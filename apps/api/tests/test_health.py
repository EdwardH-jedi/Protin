from httpx import AsyncClient


async def test_health_returns_200(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200


async def test_health_response_shape(client: AsyncClient) -> None:
    body = (await client.get("/health")).json()
    assert body["status"] == "ok"
    assert "environment" in body
    assert "checks" in body


async def test_health_checks_both_services(client: AsyncClient) -> None:
    checks = (await client.get("/health")).json()["checks"]
    assert checks["db"] == "ok"
    assert checks["redis"] == "ok"


async def test_health_db_failure_does_not_crash(client: AsyncClient) -> None:
    """DB error degrades gracefully — endpoint returns 200, check reports error."""
    from unittest.mock import AsyncMock

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.session import get_db
    from app.main import app as _app

    broken = AsyncMock(spec=AsyncSession)
    broken.execute = AsyncMock(side_effect=Exception("db unavailable"))

    async def override():
        yield broken

    _app.dependency_overrides[get_db] = override
    response = await client.get("/health")
    _app.dependency_overrides.pop(get_db)

    assert response.status_code == 200
    assert response.json()["checks"]["db"] == "error"
