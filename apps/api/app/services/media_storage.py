"""Validated, bounded local profile-photo storage.

Uploads are copied to a private staging directory with byte limits, decoded by
Pillow, and promoted as one directory swap. Callers can restore the previous
directory if their database transaction fails.
"""

from __future__ import annotations

import shutil
import tempfile
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from uuid import UUID

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import get_settings

_CHUNK_BYTES = 64 * 1024
_FORMAT_SUFFIXES = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}


class MediaValidationError(ValueError):
    """Raised when uploaded content is not an allowed, safe image."""


class MediaTooLargeError(MediaValidationError):
    """Raised when a per-file or per-user byte quota is exceeded."""


@dataclass(frozen=True)
class PreparedPhotoSet:
    user_id: UUID
    staging_dir: Path
    urls: list[str]


def _profile_photos_root() -> Path:
    return Path(get_settings().media_root) / "profile_photos"


def _user_dir(user_id: UUID) -> Path:
    return _profile_photos_root() / str(user_id)


def clear_user_photos(user_id: UUID) -> None:
    """Remove any existing photo files for the user."""
    user_dir = _user_dir(user_id)
    if user_dir.exists():
        shutil.rmtree(user_dir, ignore_errors=True)


def _copy_bounded(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    copied = 0
    upload.file.seek(0)
    with destination.open("xb") as output:
        while chunk := upload.file.read(_CHUNK_BYTES):
            copied += len(chunk)
            if copied > max_bytes:
                raise MediaTooLargeError(f"Each photo must be at most {max_bytes} bytes")
            output.write(chunk)
    if copied == 0:
        raise MediaValidationError("Photo files must not be empty")
    return copied


def _validate_image(path: Path) -> str:
    settings = get_settings()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                image_format = image.format
                width, height = image.size
                if image_format not in _FORMAT_SUFFIXES:
                    raise MediaValidationError("Only JPEG, PNG, and WebP photos are supported")
                if width <= 0 or height <= 0:
                    raise MediaValidationError("Photo dimensions are invalid")
                if width > settings.media_max_dimension or height > settings.media_max_dimension:
                    raise MediaValidationError(
                        f"Photo dimensions must not exceed {settings.media_max_dimension}px per side"
                    )
                if width * height > settings.media_max_pixels:
                    raise MediaValidationError(f"Photo must not exceed {settings.media_max_pixels} pixels")
                image.verify()
    except MediaValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise MediaValidationError("Photo dimensions are unsafe") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise MediaValidationError("Uploaded file is not a valid image") from None
    return _FORMAT_SUFFIXES[image_format]


def prepare_user_photos(user_id: UUID, files: Iterable[UploadFile]) -> PreparedPhotoSet:
    """Validate uploads in isolation without changing the user's current files."""
    settings = get_settings()
    root = _profile_photos_root()
    root.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(tempfile.mkdtemp(prefix=f".{user_id}-staging-", dir=root))
    urls: list[str] = []
    total_bytes = 0

    try:
        for index, upload in enumerate(files):
            raw_path = staging_dir / f"{index:02d}_{uuid.uuid4().hex}.upload"
            total_bytes += _copy_bounded(upload, raw_path, settings.media_max_file_bytes)
            if total_bytes > settings.media_max_total_bytes:
                raise MediaTooLargeError(
                    f"Combined profile photos must be at most {settings.media_max_total_bytes} bytes"
                )
            suffix = _validate_image(raw_path)
            final_name = f"{index:02d}_{uuid.uuid4().hex}{suffix}"
            raw_path.rename(staging_dir / final_name)
            prefix = settings.media_url_prefix.rstrip("/")
            urls.append(f"{prefix}/profile_photos/{user_id}/{final_name}")
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise

    return PreparedPhotoSet(user_id=user_id, staging_dir=staging_dir, urls=urls)


def promote_user_photos(prepared: PreparedPhotoSet) -> Path | None:
    """Atomically promote validated files, retaining a rollback directory."""
    destination = _user_dir(prepared.user_id)
    backup = destination.with_name(f".{prepared.user_id}-backup-{uuid.uuid4().hex}")
    existing_backup: Path | None = None
    if destination.exists():
        destination.rename(backup)
        existing_backup = backup
    try:
        prepared.staging_dir.rename(destination)
    except Exception:
        if existing_backup is not None and existing_backup.exists():
            existing_backup.rename(destination)
        raise
    return existing_backup


def rollback_promoted_photos(prepared: PreparedPhotoSet, backup: Path | None) -> None:
    destination = _user_dir(prepared.user_id)
    if destination.exists():
        shutil.rmtree(destination, ignore_errors=True)
    if backup is not None and backup.exists():
        backup.rename(destination)


def discard_prepared_photos(prepared: PreparedPhotoSet) -> None:
    if prepared.staging_dir.exists():
        shutil.rmtree(prepared.staging_dir, ignore_errors=True)


def finalize_promoted_photos(backup: Path | None) -> None:
    if backup is not None and backup.exists():
        shutil.rmtree(backup, ignore_errors=True)
