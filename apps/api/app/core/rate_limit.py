"""Shared slowapi Limiter backed by Redis.

Auth endpoints are keyed on the effective client IP. Forwarded headers are
accepted only when the immediate peer belongs to an explicitly configured
trusted proxy network. The forwarding chain is evaluated from right to left,
so a client-supplied leftmost value cannot spoof its rate-limit identity.

Note on the `config_filename` argument below
--------------------------------------------
slowapi's ``Limiter.__init__`` looks for a ``.env`` in the **current
working directory** and, if found, opens it via Starlette's
``Config(".env")``. On Starlette < 1.0, ``Config._read_file`` calls
``open()`` without an explicit encoding — which on Windows / Korean
(cp949) locales fails to decode UTF-8 multibyte characters (em-dashes
etc.) and crashes import. We hit this when pytest is invoked from the
repo root, where ``.env`` contains a UTF-8 em-dash in a comment.

We do not depend on any value slowapi would read from that file — every
setting below is passed in explicitly as a kwarg. So we steer slowapi
away from the implicit auto-load by passing ``config_filename`` set to
``os.devnull`` (a well-known non-file on every platform). slowapi
forwards it to Starlette's ``Config(os.devnull)``, which emits a
``UserWarning`` because the path is not a regular file but does not
attempt to read it — sidestepping the cp949 decode failure entirely.
The warning is silenced via a narrow ``catch_warnings`` block so module
import stays clean.

This replaces an earlier broad monkey-patch of Starlette's private
``Config._read_file`` method; the narrower approach keeps third-party
internals untouched.
"""

from __future__ import annotations

import ipaddress
import os
import warnings

from slowapi import Limiter
from starlette.requests import Request

from app.core.config import get_settings

_settings = get_settings()


def _trusted_proxy_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    networks = []
    for raw in get_settings().trusted_proxy_cidrs.split(","):
        value = raw.strip()
        if value:
            networks.append(ipaddress.ip_network(value, strict=False))
    return tuple(networks)


def _parse_ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _is_trusted_proxy(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(address in network for network in _trusted_proxy_networks() if address.version == network.version)


def get_rate_limit_client_ip(request: Request) -> str:
    """Return a spoof-resistant client identity for SlowAPI."""
    peer_text = request.client.host if request.client else "unknown"
    peer = _parse_ip(peer_text)
    if peer is None or not _is_trusted_proxy(peer):
        return peer_text

    fly_client = request.headers.get("fly-client-ip")
    if fly_client:
        parsed_fly_client = _parse_ip(fly_client)
        return str(parsed_fly_client) if parsed_fly_client is not None else peer_text

    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer_text

    chain = [_parse_ip(part) for part in forwarded.split(",")]
    if any(address is None for address in chain):
        return peer_text
    addresses = [address for address in chain if address is not None]
    addresses.append(peer)
    while len(addresses) > 1 and _is_trusted_proxy(addresses[-1]):
        addresses.pop()
    return str(addresses[-1])


# slowapi recognises redis:// URLs natively. If redis is unreachable at
# check time slowapi will raise; we want auth to fail closed under abuse,
# not open, so we don't swallow that error.
with warnings.catch_warnings():
    # Silence the "Config file 'nul' not found." warning that Starlette
    # emits when slowapi forwards our placeholder config_filename. The
    # filter is scoped to this block so it cannot mask other warnings.
    warnings.filterwarnings(
        "ignore",
        message=r"Config file .* not found",
        category=UserWarning,
    )
    limiter = Limiter(
        key_func=get_rate_limit_client_ip,
        storage_uri=_settings.redis_url,
        # Strategy "fixed-window" is the default and cheapest. Reasonable
        # for login/register where we want burst protection, not precise
        # pacing.
        strategy="fixed-window",
        # See module docstring — steers slowapi off the implicit `.env`
        # auto-load so Starlette never tries to decode a UTF-8 .env on a
        # cp949 Windows host. ``os.devnull`` is "nul" on Windows and
        # "/dev/null" on POSIX; ``os.path.isfile`` returns False for
        # both, so Starlette skips the file read.
        config_filename=os.devnull,
    )
