"""Focused tests for spoof-resistant proxy-aware rate-limit identities."""

from __future__ import annotations

from types import SimpleNamespace

from starlette.requests import Request

from app.core import rate_limit


def _request(peer: str, **headers: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/auth/login",
            "headers": [(key.replace("_", "-").encode(), value.encode()) for key, value in headers.items()],
            "client": (peer, 12345),
            "server": ("test", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )


def test_trusted_proxy_clients_receive_distinct_rate_limit_keys(monkeypatch) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs="172.16.0.0/12"),
    )
    first = rate_limit.get_rate_limit_client_ip(_request("172.20.0.5", x_forwarded_for="198.51.100.10"))
    second = rate_limit.get_rate_limit_client_ip(_request("172.20.0.5", x_forwarded_for="198.51.100.11"))
    assert first == "198.51.100.10"
    assert second == "198.51.100.11"
    assert first != second


def test_untrusted_peer_cannot_spoof_forwarded_ip(monkeypatch) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs="172.16.0.0/12"),
    )
    assert (
        rate_limit.get_rate_limit_client_ip(_request("203.0.113.9", x_forwarded_for="198.51.100.10")) == "203.0.113.9"
    )


def test_trusted_chain_ignores_client_supplied_leftmost_spoof(monkeypatch) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs="172.16.0.0/12"),
    )
    request = _request(
        "172.20.0.5",
        x_forwarded_for="192.0.2.123, 198.51.100.20",
    )
    assert rate_limit.get_rate_limit_client_ip(request) == "198.51.100.20"


def test_direct_request_uses_direct_peer(monkeypatch) -> None:
    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: SimpleNamespace(trusted_proxy_cidrs="127.0.0.1/32"),
    )
    assert rate_limit.get_rate_limit_client_ip(_request("198.51.100.30")) == "198.51.100.30"
