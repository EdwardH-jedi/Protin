"""
Protin notification worker.

Polls notification_events for due push notifications and delivers them
via the Expo push notification service.

Usage (staging):
  python worker.py

The worker runs in an infinite loop. Configure WORKER_POLL_INTERVAL_SECONDS
(default 60) to adjust the polling frequency.

It is intentionally simple: no task queue, no distributed locking.
For the current usage volume this is fine. If throughput grows, move to
a Celery + Redis queue setup.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal

from app.db.session import AsyncSessionLocal
from app.services.notifications import process_pending_notifications

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [worker] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

POLL_INTERVAL = int(os.environ.get("WORKER_POLL_INTERVAL_SECONDS", "60"))

_running = True


def _handle_signal(sig, frame):  # noqa: ANN001
    global _running
    log.info("Shutdown signal received, stopping after current cycle.")
    _running = False


async def run() -> None:
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    log.info("Notification worker started. Poll interval: %ds", POLL_INTERVAL)

    while _running:
        try:
            async with AsyncSessionLocal() as db:
                result = await process_pending_notifications(db)

            if result.processed or result.failed:
                log.info(
                    "Notifications — sent: %d  failed: %d",
                    result.processed,
                    result.failed,
                )
        except Exception:
            log.exception("Unhandled error during notification processing")

        await asyncio.sleep(POLL_INTERVAL)

    log.info("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(run())
