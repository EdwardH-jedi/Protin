"""Sports Challenge / Verified Result MVP tests using in-memory SQLite.

Coverage:
  * challenge creation: authz, self-challenge guard, no honor side-effect
  * lifecycle transitions: accept / decline / cancel (with authz)
  * result submission authz: participants only; unrelated user blocked
  * verified path: first submission inert, matching second fires
    record_match_result_for_honor exactly once
  * dispute path: conflicting submissions mark disputed, no honor mutation
  * idempotency: a verified challenge cannot double-apply rank/honor
  * security regression: an unrelated authed user cannot mutate
    rank/honor through the challenge result endpoint
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.redis import get_redis
from app.db.session import get_db
from app.main import app
from app.models.challenge import (
    ChallengeResultSubmission,
    SportsChallenge,
)
from app.models.honor_system import (
    DEFAULT_RATING,
    RATING_LOSS_DELTA,
    RATING_WIN_DELTA,
    HonorHistory,
    HonorTitle,
    RankProfile,
)

# Import every model so Base.metadata.create_all builds the full schema.
from app.models import (  # noqa: F401
    booking,
    challenge,
    chat,
    event,
    honor_system,
    match,
    profile,
    rank,
    safety,
    user,
    venue,
)


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

_engine = create_async_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}
)
_TestSession = async_sessionmaker(
    _engine, expire_on_commit=False, class_=AsyncSession
)


@pytest.fixture(scope="module", autouse=True)
async def create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _TestSession() as session:
        yield session


async def _override_get_redis() -> AsyncGenerator:
    mock = AsyncMock()
    mock.ping = AsyncMock(return_value=True)
    mock.aclose = AsyncMock()
    yield mock


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


async def _wipe_state() -> None:
    """Reset challenge + honor rows between tests."""
    async with _TestSession() as db:
        await db.execute(delete(ChallengeResultSubmission))
        await db.execute(delete(SportsChallenge))
        await db.execute(delete(HonorHistory))
        await db.execute(delete(HonorTitle))
        await db.execute(delete(RankProfile))
        await db.commit()


async def _register(client: AsyncClient, email: str) -> tuple[str, str]:
    r = await client.post(
        "/auth/register", json={"email": email, "password": "password123"}
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    me = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    return token, me.json()["id"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _create_challenge(
    client: AsyncClient,
    token: str,
    *,
    opponent_user_id: str,
    sport: str = "tennis",
    area: str = "annandale",
    note: str | None = None,
) -> dict:
    body: dict = {
        "opponent_user_id": opponent_user_id,
        "sport": sport,
        "area": area,
    }
    if note is not None:
        body["note"] = note
    r = await client.post("/challenges", json=body, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _accept(client: AsyncClient, token: str, challenge_id: str) -> dict:
    r = await client.post(
        f"/challenges/{challenge_id}/accept", headers=_auth(token)
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _submit(
    client: AsyncClient,
    token: str,
    challenge_id: str,
    *,
    winner_user_id: str,
    loser_user_id: str,
) -> tuple[int, dict]:
    r = await client.post(
        f"/challenges/{challenge_id}/result",
        json={"winner_user_id": winner_user_id, "loser_user_id": loser_user_id},
        headers=_auth(token),
    )
    return r.status_code, (r.json() if r.content else {})


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------


async def test_authenticated_user_can_create_challenge(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_create_a@example.com")
    _, uid_b = await _register(client, "ch_create_b@example.com")

    body = await _create_challenge(
        client, token_a, opponent_user_id=uid_b, sport="tennis", area="annandale"
    )
    assert body["challenger_user_id"] == uid_a
    assert body["opponent_user_id"] == uid_b
    assert body["sport"] == "tennis"
    assert body["area"] == "annandale"
    assert body["status"] == "pending"
    assert body["accepted_at"] is None
    assert body["completed_at"] is None
    assert body["verified_at"] is None


async def test_user_cannot_challenge_themselves(client: AsyncClient) -> None:
    await _wipe_state()
    token, uid = await _register(client, "ch_self@example.com")
    r = await client.post(
        "/challenges",
        json={
            "opponent_user_id": uid,
            "sport": "tennis",
            "area": "annandale",
        },
        headers=_auth(token),
    )
    assert r.status_code == 422


async def test_create_challenge_does_not_touch_honor_state(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_no_honor_a@example.com")
    _, uid_b = await _register(client, "ch_no_honor_b@example.com")
    await _create_challenge(client, token_a, opponent_user_id=uid_b)

    async with _TestSession() as db:
        rank_rows = list(
            (await db.execute(select(RankProfile))).scalars().all()
        )
        title_rows = list(
            (await db.execute(select(HonorTitle))).scalars().all()
        )
        history_rows = list(
            (await db.execute(select(HonorHistory))).scalars().all()
        )
    assert rank_rows == []
    assert title_rows == []
    assert history_rows == []


# ---------------------------------------------------------------------------
# Lifecycle authz
# ---------------------------------------------------------------------------


async def test_only_opponent_can_accept(client: AsyncClient) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_acc_a@example.com")
    token_b, uid_b = await _register(client, "ch_acc_b@example.com")
    unrelated_tok, _ = await _register(client, "ch_acc_x@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)

    # Challenger cannot accept their own outgoing challenge.
    r_self = await client.post(
        f"/challenges/{body['id']}/accept", headers=_auth(token_a)
    )
    assert r_self.status_code == 403

    # Unrelated third party cannot accept.
    r_third = await client.post(
        f"/challenges/{body['id']}/accept", headers=_auth(unrelated_tok)
    )
    assert r_third.status_code == 403

    # Opponent can accept.
    r_ok = await client.post(
        f"/challenges/{body['id']}/accept", headers=_auth(token_b)
    )
    assert r_ok.status_code == 200, r_ok.text
    assert r_ok.json()["status"] == "accepted"
    assert r_ok.json()["accepted_at"] is not None


async def test_only_challenger_can_cancel_pending(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_cnl_a@example.com")
    token_b, uid_b = await _register(client, "ch_cnl_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)

    # Opponent cannot cancel.
    r_b = await client.post(
        f"/challenges/{body['id']}/cancel", headers=_auth(token_b)
    )
    assert r_b.status_code == 403

    # Challenger can cancel.
    r_a = await client.post(
        f"/challenges/{body['id']}/cancel", headers=_auth(token_a)
    )
    assert r_a.status_code == 200, r_a.text
    assert r_a.json()["status"] == "cancelled"


async def test_opponent_can_decline_pending(client: AsyncClient) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_dec_a@example.com")
    token_b, uid_b = await _register(client, "ch_dec_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)

    r = await client.post(
        f"/challenges/{body['id']}/decline", headers=_auth(token_b)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "declined"


async def test_cannot_accept_declined_or_cancelled_challenge(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_term_a@example.com")
    token_b, uid_b = await _register(client, "ch_term_b@example.com")

    # Decline then try accept.
    declined = await _create_challenge(
        client, token_a, opponent_user_id=uid_b
    )
    await client.post(
        f"/challenges/{declined['id']}/decline", headers=_auth(token_b)
    )
    r1 = await client.post(
        f"/challenges/{declined['id']}/accept", headers=_auth(token_b)
    )
    assert r1.status_code == 422

    # Cancel then try accept.
    cancelled = await _create_challenge(
        client, token_a, opponent_user_id=uid_b
    )
    await client.post(
        f"/challenges/{cancelled['id']}/cancel", headers=_auth(token_a)
    )
    r2 = await client.post(
        f"/challenges/{cancelled['id']}/accept", headers=_auth(token_b)
    )
    assert r2.status_code == 422


# ---------------------------------------------------------------------------
# Result submission — authz + validation
# ---------------------------------------------------------------------------


async def test_only_participants_can_submit_result(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_subauth_a@example.com")
    token_b, uid_b = await _register(client, "ch_subauth_b@example.com")
    unrelated_tok, _ = await _register(client, "ch_subauth_x@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])

    code, _ = await _submit(
        client,
        unrelated_tok,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code == 403


async def test_winner_and_loser_must_be_participants(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_wl_a@example.com")
    token_b, uid_b = await _register(client, "ch_wl_b@example.com")
    _, uid_x = await _register(client, "ch_wl_x@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])

    code, _ = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_x,
    )
    assert code == 422


async def test_cannot_submit_before_accepted(client: AsyncClient) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_pre_a@example.com")
    _, uid_b = await _register(client, "ch_pre_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)

    code, _ = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code == 422


async def test_cannot_submit_twice_as_same_user(client: AsyncClient) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_dup_a@example.com")
    token_b, uid_b = await _register(client, "ch_dup_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])

    first_code, _ = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert first_code == 200
    second_code, _ = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert second_code == 409


# ---------------------------------------------------------------------------
# Verified result path
# ---------------------------------------------------------------------------


async def test_first_submission_does_not_update_honor(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_first_a@example.com")
    token_b, uid_b = await _register(client, "ch_first_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])

    code, after = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code == 200
    assert after["status"] == "accepted"  # still waiting on B

    async with _TestSession() as db:
        rank_rows = list(
            (await db.execute(select(RankProfile))).scalars().all()
        )
        title_rows = list(
            (await db.execute(select(HonorTitle))).scalars().all()
        )
        history_rows = list(
            (await db.execute(select(HonorHistory))).scalars().all()
        )
    assert rank_rows == []
    assert title_rows == []
    assert history_rows == []


async def test_matching_second_submission_verifies_and_applies_honor(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_ver_a@example.com")
    token_b, uid_b = await _register(client, "ch_ver_b@example.com")
    body = await _create_challenge(
        client, token_a, opponent_user_id=uid_b, sport="tennis", area="annandale"
    )
    await _accept(client, token_b, body["id"])

    # A submits: A wins.
    await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    # B agrees: A wins.
    code, after = await _submit(
        client,
        token_b,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code == 200, after
    assert after["status"] == "verified"
    assert after["verified_at"] is not None
    assert after["completed_at"] is not None

    # Honor service was invoked exactly once with the canonical effects.
    async with _TestSession() as db:
        a_profile = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_a),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        b_profile = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_b),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        title = (
            await db.execute(
                select(HonorTitle).where(
                    HonorTitle.sport == "tennis",
                    HonorTitle.area == "annandale",
                )
            )
        ).scalar_one()
        history_rows = list(
            (await db.execute(select(HonorHistory))).scalars().all()
        )

    assert a_profile.rating == DEFAULT_RATING + RATING_WIN_DELTA
    assert a_profile.wins == 1
    assert a_profile.losses == 0
    assert a_profile.streak == 1
    assert b_profile.rating == DEFAULT_RATING - RATING_LOSS_DELTA
    assert b_profile.wins == 0
    assert b_profile.losses == 1
    assert b_profile.streak == 0
    assert title.current_holder_user_id == UUID(uid_a)
    assert title.title_name == "Annandale Tennis Champion"
    assert len(history_rows) == 1
    assert history_rows[0].source_match_id == UUID(body["id"])


async def test_verified_challenge_cannot_double_apply_honor(
    client: AsyncClient,
) -> None:
    """A verified challenge is terminal — retrying the result must not
    re-trigger record_match_result_for_honor."""
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_dbl_a@example.com")
    token_b, uid_b = await _register(client, "ch_dbl_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])
    await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    await _submit(
        client,
        token_b,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )

    # Snapshot the honor state after verification.
    async with _TestSession() as db:
        before_rating_a = (
            await db.execute(
                select(RankProfile.rating).where(
                    RankProfile.user_id == UUID(uid_a)
                )
            )
        ).scalar_one()
        before_history = int(
            (
                await db.execute(select(func.count(HonorHistory.id)))
            ).scalar_one()
        )

    # Either party retries the submit. Should be rejected and the honor
    # state must not change.
    code_a, _ = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code_a == 422
    code_b, _ = await _submit(
        client,
        token_b,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code_b == 422

    async with _TestSession() as db:
        after_rating_a = (
            await db.execute(
                select(RankProfile.rating).where(
                    RankProfile.user_id == UUID(uid_a)
                )
            )
        ).scalar_one()
        after_history = int(
            (
                await db.execute(select(func.count(HonorHistory.id)))
            ).scalar_one()
        )
    assert after_rating_a == before_rating_a
    assert after_history == before_history


# ---------------------------------------------------------------------------
# Dispute path
# ---------------------------------------------------------------------------


async def test_conflicting_submissions_mark_disputed_and_do_not_update_honor(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_dsp_a@example.com")
    token_b, uid_b = await _register(client, "ch_dsp_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])

    # A claims A wins; B claims B wins.
    await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    code, after = await _submit(
        client,
        token_b,
        body["id"],
        winner_user_id=uid_b,
        loser_user_id=uid_a,
    )
    assert code == 200
    assert after["status"] == "disputed"
    assert after["verified_at"] is None
    assert after["completed_at"] is not None

    async with _TestSession() as db:
        rank_rows = list(
            (await db.execute(select(RankProfile))).scalars().all()
        )
        title_rows = list(
            (await db.execute(select(HonorTitle))).scalars().all()
        )
        history_rows = list(
            (await db.execute(select(HonorHistory))).scalars().all()
        )
    assert rank_rows == []
    assert title_rows == []
    assert history_rows == []


async def test_cannot_submit_after_dispute(client: AsyncClient) -> None:
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_dpost_a@example.com")
    token_b, uid_b = await _register(client, "ch_dpost_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])
    await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    await _submit(
        client,
        token_b,
        body["id"],
        winner_user_id=uid_b,
        loser_user_id=uid_a,
    )

    # Both participants are now blocked.
    code_a, _ = await _submit(
        client,
        token_a,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    code_b, _ = await _submit(
        client,
        token_b,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code_a == 422
    assert code_b == 422


# ---------------------------------------------------------------------------
# Security regressions
# ---------------------------------------------------------------------------


async def test_unrelated_user_cannot_mutate_honor_via_challenge_result(
    client: AsyncClient,
) -> None:
    """
    A third party with no role in the challenge must not be able to
    move two other users' rating, wins/losses, streak, title holder,
    or honor history through the challenge result endpoint.
    """
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_sec_a@example.com")
    token_b, uid_b = await _register(client, "ch_sec_b@example.com")
    unrelated_tok, _ = await _register(client, "ch_sec_x@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    await _accept(client, token_b, body["id"])

    # Snapshot honor state (which is empty so far).
    async with _TestSession() as db:
        before_rank = list(
            (await db.execute(select(RankProfile))).scalars().all()
        )
        before_titles = list(
            (await db.execute(select(HonorTitle))).scalars().all()
        )
        before_history = list(
            (await db.execute(select(HonorHistory))).scalars().all()
        )
    assert before_rank == [] and before_titles == [] and before_history == []

    # Unrelated user attempts to submit.
    code, _ = await _submit(
        client,
        unrelated_tok,
        body["id"],
        winner_user_id=uid_a,
        loser_user_id=uid_b,
    )
    assert code == 403

    # Nothing moved.
    async with _TestSession() as db:
        after_rank = list(
            (await db.execute(select(RankProfile))).scalars().all()
        )
        after_titles = list(
            (await db.execute(select(HonorTitle))).scalars().all()
        )
        after_history = list(
            (await db.execute(select(HonorHistory))).scalars().all()
        )
        # And no submissions row landed.
        subs = list(
            (
                await db.execute(select(ChallengeResultSubmission))
            ).scalars().all()
        )
    assert after_rank == []
    assert after_titles == []
    assert after_history == []
    assert subs == []


async def test_public_honors_result_route_does_not_exist(
    client: AsyncClient,
) -> None:
    """Pin that the deprecated public POST /honors/result is still
    absent — challenges are the only mutation path."""
    token, _ = await _register(client, "ch_no_post@example.com")
    r = await client.post(
        "/honors/result",
        json={
            "winner_user_id": "00000000-0000-0000-0000-000000000001",
            "loser_user_id": "00000000-0000-0000-0000-000000000002",
            "sport": "tennis",
            "area": "annandale",
        },
        headers=_auth(token),
    )
    assert r.status_code in (404, 405)


# ---------------------------------------------------------------------------
# Listing + read
# ---------------------------------------------------------------------------


async def test_list_returns_only_my_challenges(client: AsyncClient) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_list_a@example.com")
    token_b, uid_b = await _register(client, "ch_list_b@example.com")
    token_c, uid_c = await _register(client, "ch_list_c@example.com")

    # A creates against B (A is participant). C is unrelated.
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)

    a_list = (
        await client.get("/challenges", headers=_auth(token_a))
    ).json()
    b_list = (
        await client.get("/challenges", headers=_auth(token_b))
    ).json()
    c_list = (
        await client.get("/challenges", headers=_auth(token_c))
    ).json()

    assert any(item["id"] == body["id"] for item in a_list["items"])
    assert any(item["id"] == body["id"] for item in b_list["items"])
    assert all(item["id"] != body["id"] for item in c_list["items"])


async def test_unrelated_user_cannot_read_challenge_detail(
    client: AsyncClient,
) -> None:
    await _wipe_state()
    token_a, _ = await _register(client, "ch_read_a@example.com")
    _, uid_b = await _register(client, "ch_read_b@example.com")
    unrelated_tok, _ = await _register(client, "ch_read_x@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)

    r = await client.get(
        f"/challenges/{body['id']}", headers=_auth(unrelated_tok)
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Concurrency regression — the Codex BLOCK that this fix addresses
# ---------------------------------------------------------------------------


async def test_concurrent_matching_submissions_verify_once(
    client: AsyncClient,
) -> None:
    """
    Regression for the Codex BLOCK on ``submit_challenge_result``.

    The previous implementation read the submissions list before
    inserting without locking the challenge row. Two concurrent
    matching submissions could both observe ``existing == []``, each
    insert one row, and both return ``accepted`` — leaving the
    challenge stuck with two matching submissions and zero honor
    application.

    The fix locks the challenge with ``SELECT … FOR UPDATE`` and
    re-queries the submission list AFTER the flush. This test fires
    both participants' submissions via ``asyncio.gather`` to exercise
    the race path.

    Concurrency caveat: the test DB is in-memory SQLite, which
    serializes writes globally and ignores ``FOR UPDATE``. So this
    test is a best-effort simulation rather than true threaded
    concurrency. The post-flush re-query branch is what makes the
    code correct regardless of whether the DB honors the row lock —
    and that branch is what this test exercises.
    """
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_conc_a@example.com")
    token_b, uid_b = await _register(client, "ch_conc_b@example.com")
    body = await _create_challenge(
        client, token_a, opponent_user_id=uid_b, sport="tennis", area="annandale"
    )
    await _accept(client, token_b, body["id"])

    # Fire both submissions concurrently via asyncio.gather. Either may
    # land first; both must report 200, and the terminal state must be
    # verified with exactly one honor application.
    (code_a, body_a), (code_b, body_b) = await asyncio.gather(
        _submit(
            client,
            token_a,
            body["id"],
            winner_user_id=uid_a,
            loser_user_id=uid_b,
        ),
        _submit(
            client,
            token_b,
            body["id"],
            winner_user_id=uid_a,
            loser_user_id=uid_b,
        ),
    )
    assert code_a == 200, body_a
    assert code_b == 200, body_b

    # Terminal state assertions — the challenge must NOT be stuck in
    # "accepted" with two orphan submissions.
    async with _TestSession() as db:
        challenge = (
            await db.execute(
                select(SportsChallenge).where(
                    SportsChallenge.id == UUID(body["id"])
                )
            )
        ).scalar_one()
        subs = list(
            (
                await db.execute(
                    select(ChallengeResultSubmission).where(
                        ChallengeResultSubmission.challenge_id == challenge.id
                    )
                )
            )
            .scalars()
            .all()
        )
        a_profile = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_a),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        b_profile = (
            await db.execute(
                select(RankProfile).where(
                    RankProfile.user_id == UUID(uid_b),
                    RankProfile.sport == "tennis",
                    RankProfile.area == "annandale",
                )
            )
        ).scalar_one()
        history_count = int(
            (
                await db.execute(select(func.count(HonorHistory.id)))
            ).scalar_one()
        )
        title = (
            await db.execute(
                select(HonorTitle).where(
                    HonorTitle.sport == "tennis",
                    HonorTitle.area == "annandale",
                )
            )
        ).scalar_one()

    assert challenge.status == "verified"
    assert challenge.verified_at is not None
    assert challenge.completed_at is not None
    assert len(subs) == 2
    # Rank applied exactly once — winner +20, loser -10, single history row.
    assert a_profile.rating == DEFAULT_RATING + RATING_WIN_DELTA
    assert a_profile.wins == 1
    assert a_profile.losses == 0
    assert a_profile.streak == 1
    assert b_profile.rating == DEFAULT_RATING - RATING_LOSS_DELTA
    assert b_profile.wins == 0
    assert b_profile.losses == 1
    assert b_profile.streak == 0
    assert history_count == 1
    assert title.current_holder_user_id == UUID(uid_a)


async def test_concurrent_same_user_duplicate_submission_returns_409(
    client: AsyncClient,
) -> None:
    """
    The same participant firing two submissions in flight must surface
    a clean 200/409 split — never a 500 from a raw IntegrityError.

    This pins the API contract under a race. The DB-side guarantee
    that exactly one row lands is a Postgres production invariant
    enforced by ``uq_challenge_submissions_per_user``; we don't assert
    it here because the in-memory SQLite test setup uses
    ``StaticPool`` (a single shared connection across all
    ``AsyncSession`` instances), so the rollback fired by the loser
    of the race also rolls back the winner's flushed-but-uncommitted
    insert. The sequential ``test_cannot_submit_twice_as_same_user``
    test covers the non-racing 409 path against the actual DB.
    """
    await _wipe_state()
    token_a, uid_a = await _register(client, "ch_dup_conc_a@example.com")
    _, uid_b = await _register(client, "ch_dup_conc_b@example.com")
    body = await _create_challenge(client, token_a, opponent_user_id=uid_b)
    # Opponent accepts via service-direct seeding to keep the test
    # deterministic — registering token_b just to call /accept isn't
    # needed for the duplicate-submission race we're testing.
    async with _TestSession() as db:
        ch = (
            await db.execute(
                select(SportsChallenge).where(
                    SportsChallenge.id == UUID(body["id"])
                )
            )
        ).scalar_one()
        ch.status = "accepted"
        await db.commit()

    (code_one, _), (code_two, _) = await asyncio.gather(
        _submit(
            client,
            token_a,
            body["id"],
            winner_user_id=uid_a,
            loser_user_id=uid_b,
        ),
        _submit(
            client,
            token_a,
            body["id"],
            winner_user_id=uid_a,
            loser_user_id=uid_b,
        ),
    )
    codes = sorted([code_one, code_two])
    # API-contract invariant: one of the two must report success and
    # the other the conflict. Never a 500.
    assert codes == [200, 409], codes
