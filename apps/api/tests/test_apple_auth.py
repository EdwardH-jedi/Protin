"""Unit tests for the Apple Sign-in token-exchange / revocation helpers.

These exercise the parts that route-level tests (which monkeypatch the
helpers) cannot: the ES256 client-secret claim set, the ``\\n``-escaped
private-key handling, and that Apple's token / revoke endpoints are called
with ``application/x-www-form-urlencoded`` bodies (Apple rejects JSON).
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app.services.apple_auth import (
    APPLE_ISSUER,
    APPLE_REVOKE_URL,
    APPLE_TOKEN_URL,
    apple_revocation_configured,
    build_client_secret,
    exchange_authorization_code,
    revoke_refresh_token,
    verify_identity_token,
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
    return (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )


def _settings(private_pem: str) -> SimpleNamespace:
    return SimpleNamespace(
        apple_client_id="com.edh1223.protin",
        apple_team_id="TEAM123456",
        apple_key_id="KEY1234567",
        apple_private_key=private_pem,
    )


def _rsa_key_and_jwk(kid: str = "apple-key-1") -> tuple[object, dict]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk.update({"kid": kid, "alg": "RS256", "use": "sig"})
    return private_key, jwk


def _identity_token(private_key: object, *, kid: str, nonce: str, **overrides) -> str:
    now = datetime.now(tz=timezone.utc)
    claims = {
        "iss": APPLE_ISSUER,
        "aud": "com.edh1223.protin",
        "sub": "apple-subject-1",
        "exp": now + timedelta(minutes=5),
        "iat": now,
        "nonce": hashlib.sha256(nonce.encode()).hexdigest(),
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})


def _jwks_client(payloads: list[dict]) -> tuple[httpx.AsyncClient, list[int]]:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        index = min(len(calls), len(payloads) - 1)
        calls.append(index)
        return httpx.Response(200, json=payloads[index])

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


async def test_verify_identity_token_validates_real_rs256_boundary() -> None:
    from app.services import apple_auth

    nonce = "secure-nonce-value-00000000000000"
    private_key, jwk = _rsa_key_and_jwk()
    token = _identity_token(private_key, kid="apple-key-1", nonce=nonce)
    apple_auth._key_cache.invalidate()
    client, _ = _jwks_client([{"keys": [jwk]}])
    async with client:
        claims = await verify_identity_token(
            token,
            audience="com.edh1223.protin",
            nonce=nonce,
            http_client=client,
        )
    assert claims["sub"] == "apple-subject-1"


@pytest.mark.parametrize(
    ("claim_override", "audience", "nonce"),
    [
        ({"iss": "https://attacker.invalid"}, "com.edh1223.protin", "secure-nonce-value-00000000000000"),
        ({}, "wrong.audience", "secure-nonce-value-00000000000000"),
        (
            {"exp": datetime.now(tz=timezone.utc) - timedelta(seconds=1)},
            "com.edh1223.protin",
            "secure-nonce-value-00000000000000",
        ),
        ({}, "com.edh1223.protin", "different-nonce-value-000000000000"),
    ],
)
async def test_verify_identity_token_rejects_invalid_claims(claim_override, audience, nonce) -> None:
    from app.services import apple_auth

    signed_nonce = "secure-nonce-value-00000000000000"
    private_key, jwk = _rsa_key_and_jwk()
    token = _identity_token(private_key, kid="apple-key-1", nonce=signed_nonce, **claim_override)
    apple_auth._key_cache.invalidate()
    client, _ = _jwks_client([{"keys": [jwk]}])
    async with client:
        with pytest.raises(apple_auth.AppleIdentityTokenError):
            await verify_identity_token(token, audience=audience, nonce=nonce, http_client=client)


async def test_verify_identity_token_rejects_wrong_algorithm_before_jwks() -> None:
    from app.services.apple_auth import AppleIdentityTokenError

    token = jwt.encode(
        {"sub": "x"},
        "a-secret-long-enough-for-test-only-123456",
        algorithm="HS256",
        headers={"kid": "apple-key-1"},
    )
    with pytest.raises(AppleIdentityTokenError, match="RS256"):
        await verify_identity_token(token, audience="com.edh1223.protin", nonce="n" * 32)


async def test_verify_identity_token_refreshes_jwks_for_rotated_key() -> None:
    from app.services import apple_auth

    nonce = "secure-nonce-value-00000000000000"
    _, old_jwk = _rsa_key_and_jwk("old-key")
    new_private, new_jwk = _rsa_key_and_jwk("new-key")
    token = _identity_token(new_private, kid="new-key", nonce=nonce)
    apple_auth._key_cache.invalidate()
    client, calls = _jwks_client([{"keys": [old_jwk]}, {"keys": [old_jwk, new_jwk]}])
    async with client:
        claims = await verify_identity_token(
            token,
            audience="com.edh1223.protin",
            nonce=nonce,
            http_client=client,
        )
    assert claims["sub"] == "apple-subject-1"
    assert len(calls) == 2


async def test_verify_identity_token_rejects_unknown_key_id() -> None:
    from app.services import apple_auth

    nonce = "secure-nonce-value-00000000000000"
    signing_key, _ = _rsa_key_and_jwk("unknown-key")
    _, published_jwk = _rsa_key_and_jwk("published-key")
    token = _identity_token(signing_key, kid="unknown-key", nonce=nonce)
    apple_auth._key_cache.invalidate()
    client, calls = _jwks_client([{"keys": [published_jwk]}])
    async with client:
        with pytest.raises(apple_auth.AppleIdentityTokenError, match="No Apple public key"):
            await verify_identity_token(
                token,
                audience="com.edh1223.protin",
                nonce=nonce,
                http_client=client,
            )
    assert len(calls) == 2


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
        refresh = await exchange_authorization_code("auth-code-1", settings=_settings(pem), http_client=http_client)

    assert refresh == "rt-fresh"
    assert captured["url"] == APPLE_TOKEN_URL
    assert "application/x-www-form-urlencoded" in captured["content_type"]
    form = parse_qs(captured["body"])
    assert form["grant_type"] == ["authorization_code"]
    assert form["code"] == ["auth-code-1"]
    assert form["client_id"] == ["com.edh1223.protin"]
