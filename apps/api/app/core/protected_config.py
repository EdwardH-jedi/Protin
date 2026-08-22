"""Central validation for secrets required in staging and production."""

from __future__ import annotations

from cryptography.fernet import Fernet

from app.core.config import Settings

PROTECTED_ENVS = {"staging", "production"}
_PLACEHOLDER_MARKERS = (
    "change-me",
    "changeme",
    "placeholder",
    "generate_me",
    "generate-with",
    "example",
    "secret-key",
)


def validate_strong_secret(name: str, value: str, *, minimum_length: int = 32) -> None:
    candidate = value.strip()
    lowered = candidate.lower()
    if not candidate:
        raise RuntimeError(f"{name} must be set and at least {minimum_length} characters")
    if len(candidate) < minimum_length:
        raise RuntimeError(f"{name} must be at least {minimum_length} characters")
    if "<" in candidate or ">" in candidate or any(marker in lowered for marker in _PLACEHOLDER_MARKERS):
        raise RuntimeError(f"{name} must not use an example or placeholder value")
    if len(set(candidate)) < 8:
        raise RuntimeError(f"{name} is too repetitive to be used as a protected-environment secret")


def validate_fernet_key(value: str) -> None:
    candidate = value.strip()
    if not candidate or "<" in candidate or "generate" in candidate.lower():
        raise RuntimeError("FIELD_ENCRYPTION_KEY must be a generated Fernet key")
    try:
        Fernet(candidate.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError("FIELD_ENCRYPTION_KEY must be a valid Fernet key") from exc


def validate_protected_environment(settings: Settings) -> None:
    if settings.app_env not in PROTECTED_ENVS:
        return
    validate_strong_secret("SECRET_KEY", settings.secret_key)
    validate_strong_secret("INTERNAL_API_TOKEN", settings.internal_api_token)
    validate_fernet_key(settings.field_encryption_key)


if __name__ == "__main__":
    from app.core.config import get_settings

    validate_protected_environment(get_settings())
    print("protected environment configuration passed")
