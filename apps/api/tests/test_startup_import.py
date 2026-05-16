"""Regression guard for production startup-time import errors.

Fly production crashed at boot when ``python-multipart`` was missing
from the resolved lockfile: FastAPI's ``UploadFile`` parameter at
``@router.put("/me/photos", ...)`` triggers a ``Form data requires
"python-multipart" to be installed`` ``RuntimeError`` *during import*,
not at request time. The result was a 100% restart loop on Fly with
"the app is not listening on the expected address 0.0.0.0:8000".

These tests are intentionally tiny: any failure here means the runtime
image is missing a dependency that participates in FastAPI route
registration. They run independently of the DB / Redis fixtures so a
broken venv surfaces before any integration test even starts.
"""

from __future__ import annotations


def test_app_main_imports_without_runtime_error() -> None:
    """Construction of the FastAPI app must not raise at import time.

    A missing optional FastAPI dependency (``python-multipart``,
    ``email-validator``, etc.) blows up here even though the offending
    route is never called in the test suite. Catching it locally is
    cheaper than a Fly restart-loop.
    """
    from app.main import app

    assert app is not None
    # The app advertises >0 routes -- guards against an accidental
    # empty router registration breaking the OpenAPI surface.
    assert len(app.routes) > 0


def test_users_photo_upload_route_is_registered() -> None:
    """The route that originally crashed must be discoverable.

    Pinning the exact path here means a future move of /users/me/photos
    that drops multipart handling will fail this test rather than
    silently leaving the photo upload broken in production.
    """
    from app.main import app

    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/users/me/photos" in paths, (
        "photo upload route missing - multipart dependency may be absent or "
        "the route was renamed without updating this guard"
    )
