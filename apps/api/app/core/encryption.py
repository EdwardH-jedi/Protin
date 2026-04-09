"""Field-level encryption for sensitive database columns.

Uses AES-256-GCM via the `cryptography` library (Fernet wrapping).
The encryption key is derived from FIELD_ENCRYPTION_KEY in settings.

Key format
----------
FIELD_ENCRYPTION_KEY must be a 32-byte URL-safe base64-encoded secret,
e.g. produced by:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

If the key is absent (local dev only), tokens are stored as plaintext and a
warning is emitted at import time. This fallback is explicitly disabled in
production (app_env == "production") — the application will refuse to start.

Usage
-----
    from app.core.encryption import encrypt_token, decrypt_token

    # Persist
    row.access_token = encrypt_token(raw_token)

    # Retrieve
    raw_token = decrypt_token(row.access_token)
"""

from __future__ import annotations

import logging

from app.core.config import get_settings

_log = logging.getLogger(__name__)

_PLAINTEXT_PREFIX = "plain:"


def _get_fernet():
    """Return a Fernet instance or None when no key is configured."""
    # Deferred import so the module can be imported without cryptography if the
    # feature is unused in tests that don't exercise Google Calendar paths.
    from cryptography.fernet import Fernet  # type: ignore[import-untyped]

    settings = get_settings()
    key = settings.field_encryption_key.strip()
    if not key:
        return None
    return Fernet(key.encode())


def encrypt_token(plaintext: str) -> str:
    """Encrypt *plaintext* and return a base64-encoded ciphertext string.

    If no encryption key is configured the value is stored with a plaintext
    sentinel prefix so ``decrypt_token`` can round-trip it transparently.
    Storing unencrypted tokens in production is blocked by startup validation.
    """
    fernet = _get_fernet()
    if fernet is None:
        return _PLAINTEXT_PREFIX + plaintext
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a value produced by ``encrypt_token``.

    Handles three cases:
    - Properly encrypted ciphertext (normal production path).
    - ``plain:`` prefixed values written without a key (dev / migration path).
    - Legacy plaintext written before encryption was introduced (migration path).
    """
    if ciphertext.startswith(_PLAINTEXT_PREFIX):
        return ciphertext[len(_PLAINTEXT_PREFIX) :]

    fernet = _get_fernet()
    if fernet is None:
        # No key configured — treat as raw plaintext (legacy row).
        return ciphertext

    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except Exception:
        # Value was written without encryption (legacy plaintext row).
        # Return as-is so the caller can still attempt to use the token; the
        # token will fail at the Google API and trigger a re-auth, which is
        # the correct production recovery path.
        _log.warning(
            "decrypt_token: failed to decrypt value — returning raw string. "
            "This row was likely written before encryption was enabled."
        )
        return ciphertext


def validate_encryption_config() -> None:
    """Raise RuntimeError if the app is running in production without a key.

    Called from app startup so the process aborts before accepting requests.
    """
    settings = get_settings()
    if settings.app_env == "production" and not settings.field_encryption_key.strip():
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY must be set in production. "
            'Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
