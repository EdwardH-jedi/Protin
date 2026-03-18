from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.match import DiscoveryAction, Match
from app.models.profile import SportProfile, UserProfile
from app.models.safety import Block
from app.models.user import User
from app.schemas.discovery import (
    DiscoveryFeedResponse,
    PartnerCardResponse,
    RecordActionResponse,
    SportProfileSummary,
)

_CURRENT_YEAR = datetime.now().year


def _build_partner_card(
    user: User,
    profile: UserProfile,
    sport_profiles: list[SportProfile],
) -> PartnerCardResponse:
    age = _CURRENT_YEAR - profile.birth_year if profile.birth_year else None
    bio_excerpt = profile.bio[:160] if profile.bio else None
    return PartnerCardResponse(
        user_id=user.id,
        display_name=profile.display_name,
        suburb=profile.suburb,
        bio_excerpt=bio_excerpt,
        avatar_url=profile.avatar_url,
        age=age,
        sport_profiles=[
            SportProfileSummary(
                sport=sp.sport,
                level=sp.level,
                gym_name=sp.gym_name,
                golf_club=sp.golf_club,
            )
            for sp in sport_profiles
        ],
    )


async def get_discovery_feed(
    db: AsyncSession,
    current_user_id: UUID,
    sport: str,
    limit: int = 20,
    offset: int = 0,
) -> DiscoveryFeedResponse:
    # IDs the current user has already acted on for this sport
    acted_on_subq = (
        select(DiscoveryAction.target_id)
        .where(
            and_(
                DiscoveryAction.actor_id == current_user_id,
                DiscoveryAction.sport == sport,
            )
        )
        .scalar_subquery()
    )

    # Users blocked by or blocking the current user (bidirectional hide)
    blocked_by_me_subq = (
        select(Block.blocked_id)
        .where(Block.blocker_id == current_user_id)
        .scalar_subquery()
    )
    blocking_me_subq = (
        select(Block.blocker_id)
        .where(Block.blocked_id == current_user_id)
        .scalar_subquery()
    )

    base_filter = and_(
        User.id != current_user_id,
        User.is_active.is_(True),
        User.id.not_in(acted_on_subq),
        User.id.not_in(blocked_by_me_subq),
        User.id.not_in(blocking_me_subq),
    )

    # Fetch page
    stmt = (
        select(User, UserProfile, SportProfile)
        .join(UserProfile, UserProfile.user_id == User.id)
        .join(
            SportProfile,
            and_(SportProfile.user_id == User.id, SportProfile.sport == sport),
        )
        .where(base_filter)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    # Count total without limit
    count_stmt = (
        select(User.id)
        .join(UserProfile, UserProfile.user_id == User.id)
        .join(
            SportProfile,
            and_(SportProfile.user_id == User.id, SportProfile.sport == sport),
        )
        .where(base_filter)
    )
    total = len((await db.execute(count_stmt)).all())

    items = [_build_partner_card(user, profile, [sp]) for user, profile, sp in rows]
    return DiscoveryFeedResponse(items=items, total=total, limit=limit, offset=offset)


async def record_action(
    db: AsyncSession,
    actor_id: UUID,
    target_user_id: UUID,
    action: str,
    sport: str,
) -> RecordActionResponse:
    # Upsert: update existing action or insert new one
    existing_stmt = select(DiscoveryAction).where(
        and_(
            DiscoveryAction.actor_id == actor_id,
            DiscoveryAction.target_id == target_user_id,
            DiscoveryAction.sport == sport,
        )
    )
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    if existing is None:
        db.add(
            DiscoveryAction(
                actor_id=actor_id,
                target_id=target_user_id,
                sport=sport,
                action=action,
            )
        )
    else:
        existing.action = action

    match_created = False
    match_id = None

    if action == "like":
        # Check for reverse like → mutual match
        reverse_stmt = select(DiscoveryAction).where(
            and_(
                DiscoveryAction.actor_id == target_user_id,
                DiscoveryAction.target_id == actor_id,
                DiscoveryAction.sport == sport,
                DiscoveryAction.action == "like",
            )
        )
        reverse = (await db.execute(reverse_stmt)).scalar_one_or_none()

        if reverse is not None:
            # Canonical pair: user1_id < user2_id (lexicographic string sort)
            u1_str, u2_str = sorted([str(actor_id), str(target_user_id)])
            u1, u2 = UUID(u1_str), UUID(u2_str)

            existing_match_stmt = select(Match).where(
                and_(
                    Match.user1_id == u1,
                    Match.user2_id == u2,
                    Match.sport == sport,
                )
            )
            existing_match = (await db.execute(existing_match_stmt)).scalar_one_or_none()

            if existing_match is None:
                new_match = Match(user1_id=u1, user2_id=u2, sport=sport, status="active")
                db.add(new_match)
                await db.flush()
                match_created = True
                match_id = new_match.id

    await db.commit()
    return RecordActionResponse(action=action, match_created=match_created, match_id=match_id)
