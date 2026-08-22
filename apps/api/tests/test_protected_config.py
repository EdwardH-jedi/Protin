"""Protected-environment startup secret validation."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from app.core.config import Settings
from app.core.protected_config import validate_protected_environment


def _settings(**overrides) -> Settings:
    values = {
        "app_env": "production",
        "secret_key": "0123456789abcdef" * 4,
        "internal_api_token": "fedcba9876543210" * 4,
        "field_encryption_key": Fernet.generate_key().decode(),
    }
    values.update(overrides)
    return Settings(**values)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("secret_key", "", "SECRET_KEY"),
        ("secret_key", "GENERATE_ME", "SECRET_KEY"),
        ("secret_key", "short", "SECRET_KEY"),
        ("secret_key", "a" * 64, "SECRET_KEY"),
        ("internal_api_token", "GENERATE_ME", "INTERNAL_API_TOKEN"),
        ("internal_api_token", "short", "INTERNAL_API_TOKEN"),
        ("field_encryption_key", "GENERATE_ME", "FIELD_ENCRYPTION_KEY"),
        ("field_encryption_key", "not-a-fernet-key-but-long-enough-123456", "FIELD_ENCRYPTION_KEY"),
    ],
)
def test_protected_environment_rejects_unsafe_values(field: str, value: str, message: str) -> None:
    with pytest.raises(RuntimeError, match=message):
        validate_protected_environment(_settings(**{field: value}))


def test_protected_environment_accepts_strong_generated_values() -> None:
    validate_protected_environment(_settings())


def test_local_environment_does_not_require_production_secrets() -> None:
    validate_protected_environment(
        Settings(app_env="local", secret_key="change-me-in-production", internal_api_token="", field_encryption_key="")
    )
