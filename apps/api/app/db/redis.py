from collections.abc import AsyncGenerator

import redis.asyncio as aioredis

from app.core.config import get_settings

_settings = get_settings()

_pool = aioredis.ConnectionPool.from_url(
    _settings.redis_url,
    decode_responses=True,
    max_connections=20,
)


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    client = aioredis.Redis(connection_pool=_pool)
    try:
        yield client
    finally:
        await client.aclose()
