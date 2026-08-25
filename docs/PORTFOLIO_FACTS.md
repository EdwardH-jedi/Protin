# Protin — Portfolio Facts

Grounded reference for talking about this project. Every claim below is verifiable
from this repository (code, tests, migrations, CI, and deploy configuration).

## One-line description

Peer sports matchmaking on mobile — find opponents by sport, issue challenges, book
nearby courts, and track results through a ranking and honour system.

## Problem / purpose

Finding a workout or sports partner at your level, at a time and venue that works, is
mostly ad-hoc (group chats, notice boards). Protin makes it a first-class product flow:
discover a compatible partner for a specific sport, challenge them, book a venue for
the session, and build a track record through results, rank, and honour.

## Stack

- **Mobile:** Expo 54, React Native 0.81, React 19, TypeScript, React Navigation,
  Zustand, Jest + React Native Testing Library
- **API:** FastAPI, SQLAlchemy 2 (async) + asyncpg, Alembic, Pydantic v2, PyJWT,
  slowapi rate limiting, Python 3.12, uv
- **Data:** PostgreSQL 16, Redis 7
- **Contracts:** `@protin/shared-types` npm workspace package shared across the app
- **Infra:** Docker (multi-stage API image), docker-compose (local + staging), nginx,
  Fly.io configuration, GitHub Actions CI

## Architecture

```
Expo mobile app ──HTTP + JWT──▶ FastAPI ──▶ PostgreSQL (async SQLAlchemy / Alembic)
                                   │
                                   └─────▶ Redis
        notification worker ──────▶ Expo push service
```

A single FastAPI service exposes the REST API; a separate worker process
(`apps/api/worker.py`) polls scheduled notification events and delivers Expo push
notifications. The mobile app talks to the API through a typed HTTP client that
handles JWT auth and snake_case↔camelCase conversion, with request/response shapes
defined in the shared-types package.

## Implemented capabilities

- Auth: email/password registration + login (JWT), Sign in with Apple (including
  token revocation on account deletion), rate-limited auth endpoints
- Profiles: user profile, per-sport profiles (gym / golf / tennis / running), identity
  preferences, profile photo upload
- Discovery: sport-scoped partner feed with compatibility scoring; like/pass/save
  actions; mutual likes create a match
- Matches & chat: match list/archive, per-match message threads with a WebSocket
  endpoint for live message delivery
- Challenges: create, accept, decline, cancel, submit results (1-v-1)
- Bookings: full lifecycle (propose → confirm/decline → cancel/complete/no-show)
  implemented as an explicit state machine, with venue attachment
- Venues: nearby search merging a seeded venue DB with Google Places (haversine
  distance, name+proximity dedup), lazy place-details lookup, rate limited
- Battles (group events): create, join/leave, cancel/complete, host- and
  self-reported attendance
- Tournaments: list, detail, join, leave
- Rank & honour system: rank events from results, honour/reputation endpoints
- Integrations: Google Calendar OAuth + booking sync, Expo push notifications with a
  background delivery worker
- Safety: user reports, block/unblock, content moderation checks

## Technically interesting decisions

1. **Booking lifecycle as an explicit FSM.** Transitions live in a single declarative
   table in `apps/api/app/services/bookings.py`, so every state change (confirm,
   decline, cancel, complete, no-show) is validated in one place, and downstream
   effects such as notification scheduling hang off transitions rather than being
   scattered across route handlers.
2. **Field-level encryption enforced at boot.** Google OAuth tokens are stored via an
   `EncryptedString` SQLAlchemy type (Fernet: AES-CBC + HMAC). Outside local dev, the
   app refuses to start without `FIELD_ENCRYPTION_KEY`, so plaintext secrets cannot
   silently reach a real environment.
3. **Multi-source venue search.** Nearby venue results merge a seeded database with
   live Google Places responses, deduplicating by normalised name plus ~100 m
   haversine proximity, with place details lazy-loaded per selection to keep external
   API usage (and rate limits) under control.

## Current limitations

- No production deployment or users; staging and release configuration exists
  (docker-compose.staging, Fly.io, TestFlight/App Store prep docs) but nothing is
  claimed as live
- API tests run against in-memory SQLite, not PostgreSQL, so DB-engine-specific
  behaviour and the Alembic chain are not exercised in CI
- Media (profile photos) is stored on local disk; cloud object storage is a
  production TODO
- Opponent discovery filters by sport and profile compatibility, not by
  geographic proximity (location is used for venue search only)

## 30-second version

"Protin is a peer sports matchmaking app I built end-to-end: an Expo/React Native
app on top of an async FastAPI backend with PostgreSQL and Redis. You discover
opponents by sport, challenge them, book a nearby court through a Google
Places-backed venue search, and results feed a ranking and honour system. It's
around 620 backend tests and 750 mobile tests, with CI running lint, typecheck,
both suites, and a Docker build."

## 2-minute technical version

"Protin is a monorepo with three workspaces: an Expo React Native app, a FastAPI
service, and a shared TypeScript types package that acts as the API contract.

The backend is fully async — SQLAlchemy 2 async sessions over asyncpg, async Redis —
with 15 Alembic migrations covering the schema history. The domain is modelled around
matches: a sport-scoped discovery feed with compatibility scoring produces mutual-like
matches, matches carry chat threads and bookings, and bookings run through an explicit
finite state machine so every transition and its side effects — like scheduled push
notifications — are validated in one place. On top of that there are 1-v-1 challenges
with results, group events with attendance tracking, tournaments, and a rank/honour
system.

Two integrations I'd highlight: venue search merges a seeded database with Google
Places, deduplicating by name and haversine distance and rate-limiting the external
calls; and Google Calendar sync stores OAuth tokens through a field-level encryption
type that the app refuses to boot without a key for outside dev.

Quality-wise: about 620 pytest tests against the ASGI app with in-memory SQLite, 747
Jest tests over the mobile screens and stores, and a GitHub Actions pipeline running
ruff, ESLint, typechecks, both suites, and the Docker build. It's a pre-release
portfolio project — deploy configuration for staging and Fly.io exists, but I don't
claim production traffic."
