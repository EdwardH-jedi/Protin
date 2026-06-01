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
# Apple Sign-in REST endpoints for the authorization-code grant and for
# revoking issued tokens (used by account deletion — App Store 5.1.1(v)).
APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
# Cache Apple's public keys for 1 hour. Apple rotates infrequently; fetching
# on every login would add ~200ms latency and hammer their endpoint.
_JWKS_TTL_SECONDS = 3600
# Apple accepts a client_secret valid for up to 6 months; we mint a short-lived
# one per call since it is only used for a single immediate request.
_CLIENT_SECRET_TTL_SECONDS = 300

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


# ---------------------------------------------------------------------------
# Token exchange + revocation (account deletion — App Store 5.1.1(v))
#
# Identity tokens are NOT revocable. To revoke a user's Sign in with Apple on
# account deletion, the backend must hold a refresh (or access) token, which is
# obtained by exchanging the one-time native ``authorizationCode`` at login.
#
# NOTE on client_id reuse: ``apple_client_id`` (the iOS bundle identifier,
# e.g. com.edh1223.protin) is used as the identity-token audience AND as the
# token/revoke ``client_id`` AND as the client_secret ``sub``. This is correct
# for a native-app authorization code. If a Services-ID web flow is ever added,
# its requests would need that Services ID instead.
# ---------------------------------------------------------------------------


def build_client_secret(
    *,
    team_id: str,
    key_id: str,
    client_id: str,
    private_key: str,
) -> str:
    """Build the ES256-signed client secret JWT Apple requires for the token
    and revoke endpoints.

    ``private_key`` is the ``.p8`` PEM contents. Values delivered via env vars
    commonly arrive with literal ``\\n`` escapes instead of real newlines, so we
    un-escape before handing the PEM to the signer.
    """
    pem = private_key.replace("\\n", "\n")
    issued_at = int(time.time())
    payload = {
        "iss": team_id,
        "iat": issued_at,
        "exp": issued_at + _CLIENT_SECRET_TTL_SECONDS,
        "aud": APPLE_ISSUER,
        "sub": client_id,
    }
    return jwt.encode(payload, pem, algorithm="ES256", headers={"kid": key_id})


def apple_revocation_configured(settings: Any) -> bool:
    """True only when all four secrets needed to mint a client secret are set.

    When False, callers skip the exchange/revoke steps so non-Apple flows and
    unconfigured environments (local, CI, App Store reviewer) are unaffected.
    """
    return bool(
        settings.apple_client_id
        and settings.apple_team_id
        and settings.apple_key_id
        and settings.apple_private_key
    )


async def _post_form(
    url: str,
    data: dict[str, str],
    *,
    http_client: httpx.AsyncClient | None,
) -> httpx.Response:
    """POST an ``application/x-www-form-urlencoded`` body (Apple rejects JSON)
    and raise on a non-2xx status."""
    owns_client = http_client is None
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=10.0)
    try:
        resp = await http_client.post(url, data=data)
        resp.raise_for_status()
        return resp
    finally:
        if owns_client:
            await http_client.aclose()


async def exchange_authorization_code(
    code: str,
    *,
    settings: Any,
    http_client: httpx.AsyncClient | None = None,
) -> str | None:
    """Exchange a native authorization code for tokens and return the
    ``refresh_token`` (or None if Apple did not return one). Raises on transport
    or non-2xx HTTP errors so the caller can decide best-effort handling.
    """
    client_secret = build_client_secret(
        team_id=settings.apple_team_id,
        key_id=settings.apple_key_id,
        client_id=settings.apple_client_id,
        private_key=settings.apple_private_key,
    )
    resp = await _post_form(
        APPLE_TOKEN_URL,
        {
            "client_id": settings.apple_client_id,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "code": code,
        },
        http_client=http_client,
    )
    return resp.json().get("refresh_token")


async def revoke_refresh_token(
    refresh_token: str,
    *,
    settings: Any,
    http_client: httpx.AsyncClient | None = None,
) -> None:
    """Revoke a Sign in with Apple refresh token via Apple's revoke endpoint.

    Raises on transport or non-2xx HTTP errors so the caller can log and decide
    whether to proceed (account deletion proceeds regardless).
    """
    client_secret = build_client_secret(
        team_id=settings.apple_team_id,
        key_id=settings.apple_key_id,
        client_id=settings.apple_client_id,
        private_key=settings.apple_private_key,
    )
    await _post_form(
        APPLE_REVOKE_URL,
        {
            "client_id": settings.apple_client_id,
            "client_secret": client_secret,
            "token": refresh_token,
            "token_type_hint": "refresh_token",
        },
        http_client=http_client,
    )
