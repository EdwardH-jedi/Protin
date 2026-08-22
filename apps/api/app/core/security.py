"""Security helpers: password hashing and JWT tokens.

SECRET_KEY is read from the SECRET_KEY environment variable.
Set it in your .env file for production.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings as _get_settings
from app.core.protected_config import PROTECTED_ENVS, validate_strong_secret

_DEFAULT_SECRET_KEY = "change-me-in-production"

_settings = _get_settings()
SECRET_KEY: str = _settings.secret_key

_log = logging.getLogger(__name__)

if _settings.app_env in PROTECTED_ENVS:
    validate_strong_secret("SECRET_KEY", SECRET_KEY)
elif SECRET_KEY == _DEFAULT_SECRET_KEY:
    _log.warning(
        "SECRET_KEY is set to the default value. "
        "Local tokens are forgeable by anyone who knows the repository default. "
        "Set SECRET_KEY in your environment."
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> UUID:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    return UUID(payload["sub"])
