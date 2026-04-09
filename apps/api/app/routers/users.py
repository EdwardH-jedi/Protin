from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.profile import IdentityPreferences, SportProfile, UserProfile
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.profile import (
    IdentityPreferencesCreate,
    IdentityPreferencesResponse,
    SportProfileCreate,
    SportProfileResponse,
    UserProfileCreate,
    UserProfileResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@router.put("/me/profile", response_model=UserProfileResponse)
async def upsert_profile(
    body: UserProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = UserProfile(user_id=current_user.id, **body.model_dump())
        db.add(profile)
    else:
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/me/identity-preferences", response_model=IdentityPreferencesResponse)
async def get_identity_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IdentityPreferences:
    result = await db.execute(select(IdentityPreferences).where(IdentityPreferences.user_id == current_user.id))
    prefs = result.scalar_one_or_none()
    if prefs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preferences not found")
    return prefs


@router.put("/me/identity-preferences", response_model=IdentityPreferencesResponse)
async def upsert_identity_preferences(
    body: IdentityPreferencesCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> IdentityPreferences:
    result = await db.execute(select(IdentityPreferences).where(IdentityPreferences.user_id == current_user.id))
    prefs = result.scalar_one_or_none()

    if prefs is None:
        prefs = IdentityPreferences(user_id=current_user.id, **body.model_dump())
        db.add(prefs)
    else:
        for field, value in body.model_dump().items():
            setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)
    return prefs


@router.get("/me/sport-profiles", response_model=list[SportProfileResponse])
async def get_sport_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SportProfile]:
    result = await db.execute(select(SportProfile).where(SportProfile.user_id == current_user.id))
    return list(result.scalars().all())


@router.post(
    "/me/sport-profiles",
    response_model=SportProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_sport_profile(
    body: SportProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SportProfile:
    result = await db.execute(
        select(SportProfile).where(
            SportProfile.user_id == current_user.id,
            SportProfile.sport == body.sport,
        )
    )
    sp = result.scalar_one_or_none()

    if sp is None:
        sp = SportProfile(user_id=current_user.id, **body.model_dump())
        db.add(sp)
    else:
        for field, value in body.model_dump().items():
            setattr(sp, field, value)

    await db.commit()
    await db.refresh(sp)
    return sp


@router.delete("/me/sport-profiles/{sport}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sport_profile(
    sport: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(SportProfile).where(
            SportProfile.user_id == current_user.id,
            SportProfile.sport == sport,
        )
    )
    sp = result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sport profile not found")
    await db.delete(sp)
    await db.commit()
