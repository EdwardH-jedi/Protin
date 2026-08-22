"""Tests for PUT /users/me/photos."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.profile import ProfilePhoto, UserProfile
from app.models.user import User
from app.routers.auth import get_current_user
from app.services import media_storage

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(scope="module", autouse=True)
async def create_tables() -> AsyncGenerator[None, None]:
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def photo_client(tmp_path, monkeypatch) -> AsyncGenerator[tuple[AsyncClient, User, UserProfile], None]:
    """Yield (client, user, profile) with auth bypassed and media routed to tmp."""
    # Route file storage to an isolated tmp directory.
    media_root = tmp_path / "media"
    monkeypatch.setattr(
        media_storage,
        "_profile_photos_root",
        lambda: media_root / "profile_photos",
    )

    # Seed a user + profile so the endpoint has somewhere to attach photos.
    import uuid as _uuid

    email = f"photos_{_uuid.uuid4().hex[:8]}@example.com"
    async with _TestSession() as session:
        user = User(email=email, hashed_password="x")
        session.add(user)
        await session.commit()
        await session.refresh(user)

        profile = UserProfile(user_id=user.id, display_name="Photo User")
        session.add(profile)
        await session.commit()
        await session.refresh(profile)

    async def _override_current_user() -> User:
        return user

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    app.dependency_overrides[get_current_user] = _override_current_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac, user, profile

    app.dependency_overrides.clear()


def _image_bytes(image_format: str = "JPEG", size: tuple[int, int] = (32, 32)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=(20, 80, 140)).save(buffer, format=image_format)
    return buffer.getvalue()


def _files(count: int, image_format: str = "JPEG") -> list[tuple[str, tuple[str, bytes, str]]]:
    suffix = "jpg" if image_format == "JPEG" else image_format.lower()
    mime = "image/jpeg" if image_format == "JPEG" else f"image/{image_format.lower()}"
    return [("files", (f"photo{i}.{suffix}", _image_bytes(image_format), mime)) for i in range(count)]


async def test_replace_profile_photos_two_files(photo_client) -> None:
    client, user, profile = photo_client
    r = await client.put("/users/me/photos", files=_files(2))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["photos"]) == 2
    assert [p["position"] for p in body["photos"]] == [0, 1]
    for p in body["photos"]:
        assert p["photo_url"].startswith("/media/profile_photos/")
        assert str(user.id) in p["photo_url"]
    assert body["avatar_url"] == body["photos"][0]["photo_url"]


async def test_replace_profile_photos_four_files(photo_client) -> None:
    client, user, profile = photo_client
    r = await client.put("/users/me/photos", files=_files(4))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["photos"]) == 4
    assert [p["position"] for p in body["photos"]] == [0, 1, 2, 3]


async def test_replace_profile_photos_rejects_one_file(photo_client) -> None:
    client, _, _ = photo_client
    r = await client.put("/users/me/photos", files=_files(1))
    assert r.status_code == 422
    assert "2-4" in r.json()["detail"]


async def test_replace_profile_photos_rejects_five_files(photo_client) -> None:
    client, _, _ = photo_client
    r = await client.put("/users/me/photos", files=_files(5))
    assert r.status_code == 422
    assert "2-4" in r.json()["detail"]


async def test_avatar_url_synced_to_first_photo(photo_client) -> None:
    client, user, profile = photo_client
    r = await client.put("/users/me/photos", files=_files(3))
    assert r.status_code == 200
    first_url = r.json()["photos"][0]["photo_url"]

    async with _TestSession() as session:
        result = await session.execute(select(UserProfile).where(UserProfile.id == profile.id))
        refreshed = result.scalar_one()
        assert refreshed.avatar_url == first_url

        rows = await session.execute(
            select(ProfilePhoto).where(ProfilePhoto.profile_id == profile.id).order_by(ProfilePhoto.position)
        )
        photos = list(rows.scalars().all())
        assert len(photos) == 3
        assert photos[0].photo_url == first_url


async def test_replace_all_semantics_overwrites_previous(photo_client) -> None:
    client, _, profile = photo_client
    first = await client.put("/users/me/photos", files=_files(4))
    assert first.status_code == 200

    second = await client.put("/users/me/photos", files=_files(2))
    assert second.status_code == 200

    async with _TestSession() as session:
        rows = await session.execute(
            select(ProfilePhoto).where(ProfilePhoto.profile_id == profile.id).order_by(ProfilePhoto.position)
        )
        photos = list(rows.scalars().all())
        assert [p.position for p in photos] == [0, 1]


async def test_files_are_written_to_disk(photo_client, tmp_path) -> None:
    client, user, _ = photo_client
    r = await client.put("/users/me/photos", files=_files(2))
    assert r.status_code == 200
    saved_dir = Path(tmp_path) / "media" / "profile_photos" / str(user.id)
    assert saved_dir.is_dir()
    written = list(saved_dir.iterdir())
    assert len(written) == 2
    for f in written:
        assert f.stat().st_size > 0


async def test_get_profile_returns_persisted_photos_in_order(photo_client) -> None:
    """GET /users/me/profile must return the persisted photo list so the mobile
    app can rehydrate ``photoUris`` after a cold start / store reset."""
    client, _, _ = photo_client

    upload = await client.put("/users/me/photos", files=_files(3))
    assert upload.status_code == 200, upload.text
    uploaded_urls = [p["photo_url"] for p in upload.json()["photos"]]

    r = await client.get("/users/me/profile")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "photos" in body
    photos = body["photos"]
    assert len(photos) == 3
    assert [p["position"] for p in photos] == [0, 1, 2]
    assert [p["photo_url"] for p in photos] == uploaded_urls
    assert body["avatar_url"] == uploaded_urls[0]


async def test_upsert_profile_response_includes_persisted_photos(photo_client) -> None:
    """PUT /users/me/profile must also return the persisted photo list so the
    bio save in onboarding Step 2 does not clobber the rehydrated state."""
    client, _, _ = photo_client

    upload = await client.put("/users/me/photos", files=_files(2))
    assert upload.status_code == 200
    uploaded_urls = [p["photo_url"] for p in upload.json()["photos"]]

    r = await client.put(
        "/users/me/profile",
        json={"display_name": "Photo User", "bio": "Updated bio"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert [p["photo_url"] for p in body["photos"]] == uploaded_urls


async def test_upload_rejects_fake_jpeg_and_corrupt_image(photo_client) -> None:
    client, _, _ = photo_client
    fake = [("files", (f"fake{i}.jpg", b"not-an-image", "image/jpeg")) for i in range(2)]
    response = await client.put("/users/me/photos", files=fake)
    assert response.status_code == 422
    assert "valid image" in response.json()["detail"]


async def test_upload_rejects_oversized_file(photo_client) -> None:
    client, _, _ = photo_client
    settings = media_storage.get_settings()
    oversized = b"x" * (settings.media_max_file_bytes + 1)
    files = [
        ("files", ("oversized.jpg", oversized, "image/jpeg")),
        ("files", ("valid.jpg", _image_bytes(), "image/jpeg")),
    ]
    response = await client.put("/users/me/photos", files=files)
    assert response.status_code == 413


async def test_upload_enforces_combined_user_quota(photo_client, monkeypatch) -> None:
    client, _, _ = photo_client
    one_image = _image_bytes()
    monkeypatch.setattr(media_storage.get_settings(), "media_max_total_bytes", len(one_image) * 2 - 1)
    files = [("files", (f"photo{i}.jpg", one_image, "image/jpeg")) for i in range(2)]
    response = await client.put("/users/me/photos", files=files)
    assert response.status_code == 413
    assert "Combined profile photos" in response.json()["detail"]


async def test_upload_rejects_excessive_dimensions(photo_client) -> None:
    client, _, _ = photo_client
    giant = _image_bytes("PNG", (6001, 1))
    files = [("files", (f"giant{i}.png", giant, "image/png")) for i in range(2)]
    response = await client.put("/users/me/photos", files=files)
    assert response.status_code == 422
    assert "dimensions" in response.json()["detail"]


async def test_upload_accepts_valid_png(photo_client) -> None:
    client, _, _ = photo_client
    response = await client.put("/users/me/photos", files=_files(2, "PNG"))
    assert response.status_code == 200
    assert all(photo["photo_url"].endswith(".png") for photo in response.json()["photos"])


async def test_database_failure_restores_previous_files(photo_client, monkeypatch) -> None:
    client, user, _ = photo_client
    initial = await client.put("/users/me/photos", files=_files(2))
    assert initial.status_code == 200
    user_dir = media_storage._user_dir(user.id)
    original_names = sorted(path.name for path in user_dir.iterdir())

    async def fail_commit(_session) -> None:
        raise RuntimeError("simulated database failure")

    monkeypatch.setattr(AsyncSession, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated database failure"):
        await client.put("/users/me/photos", files=_files(3, "PNG"))

    assert sorted(path.name for path in user_dir.iterdir()) == original_names
