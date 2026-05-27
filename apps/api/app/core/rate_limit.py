"""Shared slowapi Limiter backed by Redis.

Auth endpoints are the current consumers. Keyed on client IP
(``get_remote_address``). In production the nginx reverse proxy must set
``X-Forwarded-For`` and slowapi must see the real IP — starlette's
``request.client.host`` already reflects the proxied peer when
``forwarded_allow_ips`` is configured on uvicorn. If that is not set, the
limiter falls back to the direct peer, which is still a reasonable floor.

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

import os
import warnings

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

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
        key_func=get_remote_address,
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
