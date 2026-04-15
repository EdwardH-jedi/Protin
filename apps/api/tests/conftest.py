from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app

# slowapi's in-process limiter would try to reach Redis at
# ``settings.redis_url``; in the test environment Redis is mocked, so we
# disable rate-limiting globally for the suite.
limiter.enabled = False


@pytest.fixture
async def client() -> AsyncClient:
    """AsyncClient with DB and Redis dependencies mocked out.

    Tests exercise the HTTP layer and response contract only.
    Integration tests against real services are out of scope here.
    """
    mock_session = AsyncMock(spec=AsyncSession)
    mock_session.execute = AsyncMock(return_value=None)

    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.aclose = AsyncMock()

    async def override_get_db():
        yield mock_session

    async def override_get_redis():
        yield mock_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
