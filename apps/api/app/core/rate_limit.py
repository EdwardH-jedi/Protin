"""Shared slowapi Limiter backed by Redis.

Auth endpoints are the current consumers. Keyed on client IP
(``get_remote_address``). In production the nginx reverse proxy must set
``X-Forwarded-For`` and slowapi must see the real IP — starlette's
``request.client.host`` already reflects the proxied peer when
``forwarded_allow_ips`` is configured on uvicorn. If that is not set, the
limiter falls back to the direct peer, which is still a reasonable floor.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

# slowapi recognises redis:// URLs natively. If redis is unreachable at
# check time slowapi will raise; we want auth to fail closed under abuse,
# not open, so we don't swallow that error.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_settings.redis_url,
    # Strategy "fixed-window" is the default and cheapest. Reasonable for
    # login/register where we want burst protection, not precise pacing.
    strategy="fixed-window",
)
