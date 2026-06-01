"""Unit tests for the Apple Sign-in token-exchange / revocation helpers.

These exercise the parts that route-level tests (which monkeypatch the
helpers) cannot: the ES256 client-secret claim set, the ``\\n``-escaped
private-key handling, and that Apple's token / revoke endpoints are called
with ``application/x-www-form-urlencoded`` bodies (Apple rejects JSON).
"""

from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.services.apple_auth import (
    APPLE_ISSUER,
    APPLE_REVOKE_URL,
    APPLE_TOKEN_URL,
    apple_revocation_configured,
    build_client_secret,
    exchange_authorization_code,
    revoke_refresh_token,
)


def _ec_private_key_pem() -> str:
    """Generate a throwaway P-256 (ES256) private key in PKCS8 PEM form."""
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


def _public_pem_from_private(private_pem: str) -> str:
    private_key = serialization.load_pem_private_key(private_pem.encode(), password=None)
    return private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()


def _settings(private_pem: str) -> SimpleNamespace:
    return SimpleNamespace(
        apple_client_id="com.edh1223.protin",
        apple_team_id="TEAM123456",
        apple_key_id="KEY1234567",
        apple_private_key=private_pem,
    )


def test_build_client_secret_has_expected_claims_and_verifies() -> None:
    pem = _ec_private_key_pem()
    secret = build_client_secret(
        team_id="TEAM123456",
        key_id="KEY1234567",
        client_id="com.edh1223.protin",
        private_key=pem,
    )

    # Header carries the key id and the ES256 algorithm Apple requires.
    header = jwt.get_unverified_header(secret)
    assert header["kid"] == "KEY1234567"
    assert header["alg"] == "ES256"

    # The signature must verify against the matching public key, and the
    # claims must match Apple's required shape for a native-app client.
    claims = jwt.decode(
        secret,
        _public_pem_from_private(pem),
        algorithms=["ES256"],
        audience=APPLE_ISSUER,
    )
    assert claims["iss"] == "TEAM123456"
    assert claims["sub"] == "com.edh1223.protin"
    assert claims["aud"] == APPLE_ISSUER
    assert claims["exp"] > claims["iat"]


def test_build_client_secret_unescapes_literal_newlines() -> None:
    # Secrets delivered via env vars commonly arrive with literal ``\n``
    # instead of real newlines; the PEM loader would otherwise throw.
    pem = _ec_private_key_pem()
    escaped = pem.replace("\n", "\\n")

    secret = build_client_secret(
        team_id="TEAM123456",
        key_id="KEY1234567",
        client_id="com.edh1223.protin",
        private_key=escaped,
    )
    # Verifies => the escaped key was loaded correctly.
    jwt.decode(
        secret,
        _public_pem_from_private(pem),
        algorithms=["ES256"],
        audience=APPLE_ISSUER,
    )


def test_apple_revocation_configured_requires_all_four_values() -> None:
    pem = _ec_private_key_pem()
    assert apple_revocation_configured(_settings(pem)) is True
    # Any missing piece disables revocation rather than crashing.
    for missing in ("apple_client_id", "apple_team_id", "apple_key_id", "apple_private_key"):
        s = _settings(pem)
        setattr(s, missing, "")
        assert apple_revocation_configured(s) is False, missing


async def test_revoke_refresh_token_posts_form_encoded() -> None:
    pem = _ec_private_key_pem()
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["content_type"] = request.headers.get("content-type", "")
        captured["body"] = request.content.decode()
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        await revoke_refresh_token("rt-abc", settings=_settings(pem), http_client=http_client)

    assert captured["url"] == APPLE_REVOKE_URL
    assert "application/x-www-form-urlencoded" in captured["content_type"]
    form = parse_qs(captured["body"])
    assert form["token"] == ["rt-abc"]
    assert form["token_type_hint"] == ["refresh_token"]
    assert form["client_id"] == ["com.edh1223.protin"]
    assert form["client_secret"][0]  # non-empty signed JWT


async def test_revoke_refresh_token_raises_on_apple_error() -> None:
    pem = _ec_private_key_pem()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_client"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        with pytest.raises(httpx.HTTPStatusError):
            await revoke_refresh_token("rt-abc", settings=_settings(pem), http_client=http_client)


async def test_exchange_authorization_code_returns_refresh_token_form_encoded() -> None:
    pem = _ec_private_key_pem()
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["content_type"] = request.headers.get("content-type", "")
        captured["body"] = request.content.decode()
        return httpx.Response(200, json={"refresh_token": "rt-fresh", "access_token": "at-x"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        refresh = await exchange_authorization_code(
            "auth-code-1", settings=_settings(pem), http_client=http_client
        )

    assert refresh == "rt-fresh"
    assert captured["url"] == APPLE_TOKEN_URL
    assert "application/x-www-form-urlencoded" in captured["content_type"]
    form = parse_qs(captured["body"])
    assert form["grant_type"] == ["authorization_code"]
    assert form["code"] == ["auth-code-1"]
    assert form["client_id"] == ["com.edh1223.protin"]
