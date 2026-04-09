from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.match import Match
from app.models.profile import SportProfile, UserProfile
from app.models.user import User
from app.schemas.discovery import PartnerCardResponse, SportProfileSummary
from app.schemas.matches import MatchListResponse, MatchResponse

_CURRENT_YEAR = datetime.now().year


async def list_matches(
    db: AsyncSession,
    current_user_id: UUID,
    limit: int = 20,
    offset: int = 0,
) -> MatchListResponse:
    participant_filter = and_(
        or_(
            Match.user1_id == current_user_id,
            Match.user2_id == current_user_id,
        ),
        Match.status == "active",
    )

    stmt = select(Match).where(participant_filter).order_by(Match.created_at.desc()).offset(offset).limit(limit)
    matches = list((await db.execute(stmt)).scalars().all())

    count_stmt = select(Match.id).where(participant_filter)
    total = len((await db.execute(count_stmt)).all())

    items: list[MatchResponse] = []
    for m in matches:
        partner_id = m.user2_id if m.user1_id == current_user_id else m.user1_id
        partner = await _build_partner_card(db, partner_id, m.sport)
        items.append(
            MatchResponse(
                id=m.id,
                user1_id=m.user1_id,
                user2_id=m.user2_id,
                sport=m.sport,
                status=m.status,
                created_at=m.created_at,
                partner=partner,
            )
        )

    return MatchListResponse(items=items, total=total, limit=limit, offset=offset)


async def archive_match(
    db: AsyncSession,
    match_id: UUID,
    current_user_id: UUID,
) -> MatchResponse | None:
    stmt = select(Match).where(Match.id == match_id)
    m = (await db.execute(stmt)).scalar_one_or_none()

    if m is None:
        return None
    if m.user1_id != current_user_id and m.user2_id != current_user_id:
        return None

    m.status = "archived"
    await db.commit()
    await db.refresh(m)

    partner_id = m.user2_id if m.user1_id == current_user_id else m.user1_id
    partner = await _build_partner_card(db, partner_id, m.sport)

    return MatchResponse(
        id=m.id,
        user1_id=m.user1_id,
        user2_id=m.user2_id,
        sport=m.sport,
        status=m.status,
        created_at=m.created_at,
        partner=partner,
    )


async def _build_partner_card(db: AsyncSession, user_id: UUID, sport: str) -> PartnerCardResponse:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))).scalar_one_or_none()
    sp = (
        await db.execute(select(SportProfile).where(and_(SportProfile.user_id == user_id, SportProfile.sport == sport)))
    ).scalar_one_or_none()

    display_name = profile.display_name if profile else (user.email if user else "Unknown")
    age = (_CURRENT_YEAR - profile.birth_year) if profile and profile.birth_year else None
    bio_excerpt = profile.bio[:160] if profile and profile.bio else None

    return PartnerCardResponse(
        user_id=user_id,
        display_name=display_name,
        suburb=profile.suburb if profile else None,
        bio_excerpt=bio_excerpt,
        avatar_url=profile.avatar_url if profile else None,
        age=age,
        sport_profiles=[
            SportProfileSummary(
                sport=sp.sport,
                level=sp.level,
                gym_name=sp.gym_name,
                golf_club=sp.golf_club,
            )
        ]
        if sp
        else [],
    )
