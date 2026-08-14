"""
Unit tests for the V1 deterministic content moderation service.

Sensitive categories (sexual / harassment / threat / profanity) are
exercised through ``BANNED_*_FIXTURE`` sentinels rather than real
slurs so the test surface stays readable and the repo doesn't grow
graphic strings. Scam/spam buckets use one mild representative
phrase each because those are safe to enumerate ("send me bitcoin").

Allowed-path tests are the load-bearing half: a moderation MVP that
blocks real chat ("hit the gym tomorrow", "Annandale tennis tonight")
is worse than no moderation at all. These guard against that.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.content_moderation import (
    SAFE_USER_MESSAGE,
    ensure_text_allowed,
    moderate_text,
)


# ---------------------------------------------------------------------------
# Allowed path — must never false-positive on legitimate sport content
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Hey, want to hit the gym tomorrow?",
        "Let's pass the ball at the tennis class.",
        "Annandale tennis tonight 6pm at Camperdown Park",
        "Bondi Beach Court 2",
        "Anytime Fitness Surry Hills, 428 Crown St",
        "I'm killing it at training this week",
        "Going hard at running drills",
        "Booking link: https://example.com/book/court-1",
        "",
        "   ",
    ],
)
def test_allowed_text_is_not_flagged(text: str) -> None:
    result = moderate_text(text, context="unit")
    assert result.allowed is True, f"false positive: {text!r} → categories={result.categories}"


# ---------------------------------------------------------------------------
# Blocked path — sentinel fixtures per category
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "fixture,category",
    [
        ("BANNED_PROFANITY_FIXTURE", "profanity"),
        ("BANNED_SEXUAL_FIXTURE", "sexual"),
        ("BANNED_HARASSMENT_FIXTURE", "harassment"),
        ("BANNED_THREAT_FIXTURE", "threat"),
        ("BANNED_SCAM_FIXTURE", "scam"),
        ("BANNED_FRAUD_FIXTURE", "fraud"),
        ("BANNED_SPAM_FIXTURE", "spam"),
    ],
)
def test_each_category_fires_on_its_sentinel(fixture: str, category: str) -> None:
    result = moderate_text(fixture, context="unit")
    assert result.allowed is False
    assert category in result.categories


def test_blocked_result_includes_safe_user_message_and_hides_match() -> None:
    """The user-facing copy must not leak the matched fragment."""
    result = moderate_text("BANNED_PROFANITY_FIXTURE creep", context="unit")
    assert result.allowed is False
    assert result.safe_user_message == SAFE_USER_MESSAGE
    # The internal reason is for log/test surface; it may reference the
    # match — but the user-safe message must not.
    assert "BANNED" not in result.safe_user_message


# ---------------------------------------------------------------------------
# Real-phrase coverage — kept narrow + safe-to-source
# ---------------------------------------------------------------------------


def test_scam_phrase_send_me_bitcoin_is_blocked() -> None:
    result = moderate_text("Send me bitcoin and I'll send you the prize")
    assert result.allowed is False
    assert "scam" in result.categories


def test_fraud_phrase_gift_card_is_blocked() -> None:
    result = moderate_text("Please send money to me as a gift card today")
    assert result.allowed is False
    assert {"scam", "fraud"} & set(result.categories)


def test_threat_phrase_kill_yourself_is_blocked() -> None:
    result = moderate_text("you should kill yourself")
    assert result.allowed is False
    assert "threat" in result.categories


def test_threat_does_not_false_positive_on_killing_it_at_gym() -> None:
    """Bare 'kill'/'die' would block this — patterns use multi-word phrases."""
    result = moderate_text("absolutely killing it at the gym today")
    assert result.allowed is True


# ---------------------------------------------------------------------------
# Word-boundary protection — sport/venue terms must not substring-match
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        # "ass" inside whole words must not trigger.
        "let's pass class on Tuesday",
        "tennis pass at Glebe",
        "Annandale is the area",
        # "sex" inside other words must not trigger (sextuplet, etc.).
        "Sussex Inlet running club",
    ],
)
def test_substring_safe_words_are_not_blocked(text: str) -> None:
    assert moderate_text(text).allowed is True


# ---------------------------------------------------------------------------
# Standalone "loser" must remain allowed (Codex APPROVE-WITH-FIXES regression)
#
# A sports/social app uses "loser" constantly in benign ways — it pins
# rotation rules, friendly bets, and game outcomes. Single-word matching
# would silence the most common phrasing. Phrase-level harassment is
# covered separately below.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Loser buys coffee after the match",
        "Loser of the set rotates off",
        "Winner stays on and loser rests",
        "loser pays for the courts next round",
    ],
)
def test_benign_sports_loser_phrasing_is_allowed(text: str) -> None:
    assert moderate_text(text).allowed is True


@pytest.mark.parametrize(
    "text",
    [
        "you are a loser",
        "you're a loser",
        "such a loser, never play with you again",
    ],
)
def test_directly_abusive_loser_phrasing_is_blocked(text: str) -> None:
    result = moderate_text(text)
    assert result.allowed is False
    assert "harassment" in result.categories


# ---------------------------------------------------------------------------
# Normalization — punctuation/case should not be a bypass
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Send,me,bitcoin",
        "SEND ME BITCOIN",
        "Send   me   bitcoin   please",
        "send-me-bitcoin",
    ],
)
def test_punctuation_and_case_do_not_bypass_scam(text: str) -> None:
    assert moderate_text(text).allowed is False


# ---------------------------------------------------------------------------
# ensure_text_allowed — raise shape
# ---------------------------------------------------------------------------


def test_ensure_text_allowed_is_noop_for_allowed_text() -> None:
    # Should not raise.
    ensure_text_allowed("Hey want to hit the gym tomorrow?", context="chat")


def test_ensure_text_allowed_raises_422_with_safe_detail() -> None:
    with pytest.raises(HTTPException) as ex:
        ensure_text_allowed("BANNED_PROFANITY_FIXTURE", context="chat")
    assert ex.value.status_code == 422
    assert ex.value.detail == SAFE_USER_MESSAGE
    # Defense in depth: detail must not include the matched fragment.
    assert "BANNED" not in ex.value.detail
