from __future__ import annotations

from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.booking import Booking
from app.models.chat import Message
from app.models.google_calendar import CalendarBookingSync, GoogleCalendarToken
from app.models.match import DiscoveryAction, Match
from app.models.notification import NotificationEvent, PushToken
from app.models.profile import IdentityPreferences, SportProfile, UserProfile
from app.models.safety import Block, Report
from app.models.user import User
from app.schemas.auth import (
    AppleSignInRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.apple_auth import AppleIdentityTokenError, verify_identity_token

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        user_id: UUID = decode_access_token(token)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    # Apple-only users have a NULL hashed_password and must not be able to
    # authenticate via the password endpoint.
    if user is None or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/apple", response_model=TokenResponse)
@limiter.limit("5/minute")
async def apple_sign_in(
    request: Request,
    body: AppleSignInRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    if not settings.apple_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Apple Sign-in is not configured",
        )

    try:
        claims = await verify_identity_token(
            body.identity_token,
            audience=settings.apple_client_id,
            nonce=body.nonce,
        )
    except AppleIdentityTokenError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e

    apple_sub: str = claims["sub"]
    # Apple provides the email on first sign-in only. Prefer the token claim
    # (it is verified) over the client-provided one when both exist.
    email: str | None = claims.get("email") or body.email

    # 1) Look up by apple_sub — this is the durable identifier.
    result = await db.execute(select(User).where(User.apple_sub == apple_sub))
    user = result.scalar_one_or_none()

    # 2) Fallback: match by email and attach apple_sub (e.g. a user who
    #    previously registered with email/password then used Apple).
    if user is None and email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is not None:
            user.apple_sub = apple_sub

    # 3) New user — create a row. hashed_password is NULL for Apple-only users.
    if user is None:
        if not email:
            # First-time Apple sign-in must include an email. The client is
            # responsible for forwarding the email Apple returns.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="email required for first-time Apple sign-in",
            )
        user = User(email=email, apple_sub=apple_sub, hashed_password=None)
        db.add(user)

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Apple account conflicts with an existing user",
        ) from e

    await db.refresh(user)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete the authenticated user and all data they own.

    Apple Guideline 5.1.1(v) — account deletion must be fully in-app. This
    performs a hard delete across every table that references ``users.id``.
    Child rows are removed explicitly (in dependency order) rather than
    relying on DB-level cascade, so the behaviour is identical regardless
    of dialect (Postgres in prod, SQLite in tests).
    """
    user_id = current_user.id

    # Match IDs owned by this user — need them to scrub messages and booking syncs
    # that reference matches / bookings this user participates in.
    match_rows = await db.execute(select(Match.id).where((Match.user1_id == user_id) | (Match.user2_id == user_id)))
    match_ids = [row[0] for row in match_rows.all()]

    booking_rows = await db.execute(
        select(Booking.id).where((Booking.proposer_id == user_id) | (Booking.partner_id == user_id))
    )
    booking_ids = [row[0] for row in booking_rows.all()]

    # --- Notifications / push (leaves) ---------------------------------
    await db.execute(delete(NotificationEvent).where(NotificationEvent.user_id == user_id))
    await db.execute(delete(PushToken).where(PushToken.user_id == user_id))

    # --- Calendar integration ------------------------------------------
    await db.execute(delete(CalendarBookingSync).where(CalendarBookingSync.user_id == user_id))
    if booking_ids:
        await db.execute(delete(CalendarBookingSync).where(CalendarBookingSync.booking_id.in_(booking_ids)))
    await db.execute(delete(GoogleCalendarToken).where(GoogleCalendarToken.user_id == user_id))

    # --- Chat / bookings / matches -------------------------------------
    if match_ids:
        await db.execute(delete(Message).where(Message.match_id.in_(match_ids)))
    await db.execute(delete(Message).where(Message.sender_id == user_id))

    if booking_ids:
        await db.execute(delete(Booking).where(Booking.id.in_(booking_ids)))

    if match_ids:
        await db.execute(delete(Match).where(Match.id.in_(match_ids)))

    await db.execute(
        delete(DiscoveryAction).where((DiscoveryAction.actor_id == user_id) | (DiscoveryAction.target_id == user_id))
    )

    # --- Safety --------------------------------------------------------
    await db.execute(delete(Report).where((Report.reporter_id == user_id) | (Report.reported_id == user_id)))
    await db.execute(delete(Block).where((Block.blocker_id == user_id) | (Block.blocked_id == user_id)))

    # --- Profile / sport data ------------------------------------------
    await db.execute(delete(SportProfile).where(SportProfile.user_id == user_id))
    await db.execute(delete(IdentityPreferences).where(IdentityPreferences.user_id == user_id))
    await db.execute(delete(UserProfile).where(UserProfile.user_id == user_id))

    # --- Finally, the user row -----------------------------------------
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    return None
