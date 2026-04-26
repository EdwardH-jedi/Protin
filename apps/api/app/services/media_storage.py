"""Local/dev media storage for profile photos.

Writes uploaded files to ``{media_root}/profile_photos/{user_id}/`` and
returns public URLs under ``{media_url_prefix}/profile_photos/{user_id}/``.
The ``main.py`` mounts ``media_url_prefix`` as a StaticFiles route.

This is a deliberately minimal slice. Cloud object storage (S3/GCS) and
content-type validation / image moderation are out of scope.
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Iterable
from uuid import UUID

from fastapi import UploadFile

from app.core.config import get_settings

_ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
_DEFAULT_SUFFIX = ".jpg"


def _profile_photos_root() -> Path:
    return Path(get_settings().media_root) / "profile_photos"


def _user_dir(user_id: UUID) -> Path:
    return _profile_photos_root() / str(user_id)


def _safe_suffix(filename: str | None) -> str:
    if not filename:
        return _DEFAULT_SUFFIX
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in _ALLOWED_SUFFIXES else _DEFAULT_SUFFIX


def clear_user_photos(user_id: UUID) -> None:
    """Remove any existing photo files for the user (replace-all semantics)."""
    user_dir = _user_dir(user_id)
    if user_dir.exists():
        shutil.rmtree(user_dir, ignore_errors=True)


def save_user_photos(user_id: UUID, files: Iterable[UploadFile]) -> list[str]:
    """Persist uploads to local disk and return ordered public URLs."""
    user_dir = _user_dir(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    url_prefix = get_settings().media_url_prefix.rstrip("/")
    urls: list[str] = []

    for index, upload in enumerate(files):
        suffix = _safe_suffix(upload.filename)
        name = f"{index:02d}_{uuid.uuid4().hex}{suffix}"
        dest = user_dir / name

        upload.file.seek(0)
        with dest.open("wb") as fh:
            shutil.copyfileobj(upload.file, fh)

        urls.append(f"{url_prefix}/profile_photos/{user_id}/{name}")

    return urls
