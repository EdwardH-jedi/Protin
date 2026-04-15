"""Apple Sign-in identity token verification.

Fetches Apple's public JWKS, caches it in-process, and verifies the
JWT signature + claims for identity tokens issued by Apple ID.

Reference: https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/authenticating_users_with_sign_in_with_apple
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
# Cache Apple's public keys for 1 hour. Apple rotates infrequently; fetching
# on every login would add ~200ms latency and hammer their endpoint.
_JWKS_TTL_SECONDS = 3600

_log = logging.getLogger(__name__)


class AppleIdentityTokenError(ValueError):
    """Raised when an Apple identity token is invalid or cannot be verified."""


class _AppleKeyCache:
    """In-process cache for Apple's JWKS with TTL."""

    def __init__(self) -> None:
        self._keys: dict[str, Any] | None = None
        self._fetched_at: float = 0.0

    async def get(self, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
        now = time.monotonic()
        if self._keys is not None and (now - self._fetched_at) < _JWKS_TTL_SECONDS:
            return self._keys

        owns_client = client is None
        if client is None:
            client = httpx.AsyncClient(timeout=10.0)
        try:
            resp = await client.get(APPLE_JWKS_URL)
            resp.raise_for_status()
            data = resp.json()
        finally:
            if owns_client:
                await client.aclose()

        keys = {k["kid"]: k for k in data.get("keys", [])}
        if not keys:
            raise AppleIdentityTokenError("Apple JWKS returned no keys")
        self._keys = keys
        self._fetched_at = now
        return keys

    def invalidate(self) -> None:
        self._keys = None
        self._fetched_at = 0.0


_key_cache = _AppleKeyCache()


async def verify_identity_token(
    identity_token: str,
    *,
    audience: str,
    nonce: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Verify an Apple identity token and return its decoded claims.

    Parameters
    ----------
    identity_token:
        The raw JWT string sent by the mobile client.
    audience:
        Expected ``aud`` claim — the app's bundle identifier (iOS) or
        Services ID (web). Required for signature validation.
    nonce:
        Optional **raw** nonce previously passed to Apple on the client side
        (e.g. via ``AppleAuthentication.signInAsync({ nonce })``). When
        supplied, we compare ``SHA256(nonce)`` in hex against the token's
        ``nonce`` claim — Apple hashes the client-supplied nonce before
        embedding it in the identity token.
    http_client:
        Optional shared httpx client (used by tests to stub JWKS fetches).

    Raises
    ------
    AppleIdentityTokenError
        If the token is malformed, signed by an unknown key, has an invalid
        signature, is expired, or fails any claim check.
    """
    try:
        header = jwt.get_unverified_header(identity_token)
    except jwt.PyJWTError as e:
        raise AppleIdentityTokenError(f"Malformed identity token: {e}") from e

    kid = header.get("kid")
    alg = header.get("alg", "RS256")
    if not kid:
        raise AppleIdentityTokenError("Identity token header missing 'kid'")

    keys = await _key_cache.get(http_client)
    jwk = keys.get(kid)
    if jwk is None:
        # Key rotation — refresh once and retry.
        _key_cache.invalidate()
        keys = await _key_cache.get(http_client)
        jwk = keys.get(kid)
    if jwk is None:
        raise AppleIdentityTokenError(f"No Apple public key matches kid={kid}")

    public_key = RSAAlgorithm.from_jwk(jwk)

    try:
        claims = jwt.decode(
            identity_token,
            public_key,  # type: ignore[arg-type]
            algorithms=[alg],
            audience=audience,
            issuer=APPLE_ISSUER,
        )
    except jwt.PyJWTError as e:
        raise AppleIdentityTokenError(f"Identity token verification failed: {e}") from e

    if nonce is not None:
        expected_nonce = hashlib.sha256(nonce.encode("utf-8")).hexdigest()
        if claims.get("nonce") != expected_nonce:
            raise AppleIdentityTokenError("Nonce mismatch")

    if "sub" not in claims:
        raise AppleIdentityTokenError("Identity token missing 'sub' claim")

    return claims
