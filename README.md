# Protin

**A mobile social fitness platform for finding training partners and organising sports sessions.**
Protin ranks potential partners by sport, skill level and training-time overlap, then carries them
all the way through messaging, session scheduling, group games and a reputation system that
rewards actually showing up.

`React Native` · `Expo 54` · `TypeScript` · `FastAPI` · `PostgreSQL 16` · `Redis 7` · `Docker`

[![CI](https://github.com/EdwardH-jedi/Protin/actions/workflows/ci.yml/badge.svg)](https://github.com/EdwardH-jedi/Protin/actions/workflows/ci.yml)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)
![TypeScript 5.9](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)
![Expo 54](https://img.shields.io/badge/expo-54-000020?logo=expo&logoColor=white)
![React Native 0.81](https://img.shields.io/badge/react%20native-0.81-61DAFB?logo=react&logoColor=black)

> Independently designed and built. The app is prepared for App Store submission under
> the brand **SportsGang** — store metadata, privacy labels and a release gate checklist
> live in [`docs/release`](docs/release) — but no build has been submitted or released.
> `protin` remains the internal project and package namespace.

---

## Screens

| Discovery | Matches | Chat |
|---|---|---|
| ![Partner discovery feed](docs/release/screenshots/ios/01-discovery-gym-partners.png) | ![Matches list](docs/release/screenshots/ios/02-matches-message-previews.png) | ![Chat with a confirmed session](docs/release/screenshots/ios/03-chat-confirmed-session.png) |

| Events & sessions | Propose a session | Profile & account |
|---|---|---|
| ![Events and sessions](docs/release/screenshots/ios/04-events-sessions.png) | ![Session proposal form](docs/release/screenshots/ios/05-propose-session-form.png) | ![Profile, legal and account controls](docs/release/screenshots/ios/08-profile-legal-account.png) |

<sub>iOS simulator captures from the release-review build.</sub>

---

## Why Protin exists

Finding someone to train with is a coordination problem that no single app solves well.
People discover partners in one place, argue about times in another, and track who
actually turned up nowhere at all. Group sports make it worse: casual games need a
roster, a venue and some assurance that the strangers involved will show.

Protin puts that whole loop in one app — discovery, agreement, scheduling and
accountability — and keeps it local, so the people it surfaces are ones you could
realistically meet this week. The product is Sydney-first by design: the venue catalogue,
suburb model and distance filters are all built around one city rather than pretending
to global coverage on day one.

It is deliberately **not** a dating app. Matching exists to produce a booked session,
and the reputation system exists to make that session actually happen.

---

## Core capabilities

**Discover & connect** — A sport-scoped partner feed with like / pass / save actions and
mutual-match creation. The feed *filters* on sport, active accounts, cards you have already
acted on, and blocks in both directions; it then *ranks* what remains by compatibility —
60% skill-level proximity, 40% preferred-time overlap. Gender, age and distance preferences
are captured on the profile but are not yet applied to the feed. Supported sports: gym, golf,
tennis and running.

**Plan & book** — 1:1 session proposals governed by an explicit booking state machine.
Every transition is checked against both the current status and the acting party's role
(proposer vs partner), so a partner can confirm or decline but only the proposer can
withdraw. A confirmed booking can be exported to the user's Google Calendar.

**Compete & participate** — Group events ("battles") with rosters, capacity and attendance
checks; head-to-head challenges whose results are only applied once *both* participants
submit matching outcomes; and a feature-flagged tournament surface (list / join / leave,
with capacity enforced under row-level locking).

**Reputation with the incentives thought through** — A rank and honor system driven by
booking outcomes. Tiers are computed from points rather than stored, and honor-ledger
writes are reachable only through the challenge path, where a result applies only once
*both* participants submit matching outcomes. Booking outcomes are weaker: either party
can unilaterally mark a confirmed session completed or no-show, so the deterrent is
game-theoretic — whoever claims a no-show takes a smaller penalty too. That is a
mitigation, not a dispute system, and the design notes say so.

**Communicate** — Real-time per-match chat over WebSockets, with participant-checked
rooms, REST history, optimistic send and message de-duplication across the
fetch / POST / socket paths. Inbound text passes content moderation.

**Trust & safety** — Reporting and blocking across users and events, blocked users
filtered out of the discovery feed in both directions, and in-app account deletion that
hard-deletes every row referencing the user in dependency order. For Sign in with Apple
users it also attempts token revocation first, best-effort: revocation is skipped when
Apple credentials are unconfigured and a failure is logged rather than aborting, so an
Apple outage can never trap a user in their account. Uploaded photo *files* are not yet
purged from disk on deletion — a known gap, tracked rather than glossed over.

**Venues & integrations** — Nearby-venue discovery backed by a seeded Sydney catalogue
with an optional Google Places provider layered on top, Apple Sign-In, and Expo push
notifications delivered by a background worker.

---

## Engineering highlights

The parts of this repository worth looking at, and where to find them:

| Area | What is there | Where |
|---|---|---|
| **Async API** | FastAPI with fully async SQLAlchemy 2.0 over asyncpg; 15 routers, 14 ORM model modules, 17 service modules | [`apps/api/app`](apps/api/app) |
| **Booking state machine** | Transitions declared as a `(status, transition) → allowed_by` table and enforced centrally, so no route can invent an illegal state change | [`services/bookings.py`](apps/api/app/services/bookings.py) |
| **Contract-typed integration** | A TypeScript package pins the API wire shapes and is imported by ~22 mobile modules, so a contract change surfaces as a build failure rather than a runtime error. Adoption is partial and the types are not OpenAPI-generated — both gaps are documented rather than glossed over | [`packages/shared-types`](packages/shared-types) |
| **Security engineering** | Field-level Fernet encryption for stored OAuth tokens with a startup guard that refuses to boot unencrypted in staging/production; JWT auth; slowapi rate limiting; shared-secret gate on internal routes | [`core/encryption.py`](apps/api/app/core/encryption.py), [`core/security.py`](apps/api/app/core/security.py) |
| **Real-time chat** | A WebSocket room per match with a connection manager; the token is decoded and match participation verified before the socket is admitted to any room, and a rejected connection is closed with a distinct code for auth vs authorisation failure | [`routers/chat.py`](apps/api/app/routers/chat.py), [`ChatScreen.tsx`](apps/mobile/src/screens/chat/ChatScreen.tsx) |
| **Background processing** | A standalone worker process polling for due push notifications and delivering them via Expo | [`apps/api/worker.py`](apps/api/worker.py) |
| **Schema evolution** | 15 Alembic migrations covering the full domain history | [`apps/api/alembic/versions`](apps/api/alembic/versions) |
| **Mobile app** | Expo / React Native with React Navigation, Zustand stores, Apple Sign-In, expo-location, maps, image picker and Sentry | [`apps/mobile/src`](apps/mobile/src) |
| **Test suite** | 620 API tests and 747 mobile tests, all run in CI | [`apps/api/tests`](apps/api/tests), [`apps/mobile/src/__tests__`](apps/mobile/src/__tests__) |
| **Infrastructure** | Multi-stage Docker build, Compose stacks for local and staging, nginx reverse proxy, backup/restore and health-check scripts, Fly.io deployment configuration | [`infra`](infra), [`fly.toml`](fly.toml) |
| **Security review** | A written security audit with severity ratings, tracked against the code that since addressed it — including which findings are closed, which are only partially addressed, and which remain open | [`docs/security/SECURITY_AUDIT.md`](docs/security/SECURITY_AUDIT.md) |

---

## Architecture

```mermaid
flowchart LR
    Mobile["React Native / Expo app"]
    API["FastAPI API"]
    Worker["Notification worker"]
    DB[("PostgreSQL 16")]
    Redis[("Redis 7")]

    Apple["Apple Sign-In"]
    GCal["Google Calendar"]
    Places["Google Places"]
    Expo["Expo Push"]

    Mobile -->|"REST + JWT"| API
    Mobile -->|"WebSocket chat"| API
    Mobile --> Apple
    API --> Apple
    API --> DB
    API --> Redis
    API --> GCal
    API --> Places
    Worker --> DB
    Worker --> Expo
```

- **Mobile app** — all user-facing state and navigation. Talks to the API over REST with a
  JWT held in `expo-secure-store`; holds no business rules of its own.
- **API** — the single source of truth for domain rules: authentication, the booking state
  machine, discovery filtering and scoring, challenge result verification, and rank/honor
  accounting. It owns the server-side integrations (Apple token verification and
  revocation, Google Calendar, Google Places). The app owns the ones that are inherently
  on-device: the Apple sign-in prompt, Expo push-token registration, device calendar
  access, and Sentry.
- **PostgreSQL** — durable state for users, profiles, matches, messages, bookings, events,
  challenges, tournaments, rankings, venues and safety records.
- **Redis** — ephemeral state, rate-limit backend, and health-checked runtime dependency.
- **WebSockets** — chat runs over an authenticated socket per match room, alongside the
  REST endpoints that serve message history.
- **Worker** — a separate process that polls for due notifications and delivers them
  through Expo Push, keeping fan-out off the request path.
- **shared-types** — a TypeScript package consumed by the mobile app that pins the wire
  contract. It is not generated from OpenAPI and a few newer hooks still declare shapes
  inline; see [the architecture notes](docs/architecture/ARCHITECTURE.md#package-boundaries).

Full detail: [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md).

---

## Testing & quality

Every push runs six CI jobs: Ruff lint + format check, mobile ESLint, TypeScript
typecheck, API pytest, mobile Jest, and an API Docker image build gated on the rest.

| | Stack | Scope |
|---|---|---|
| **API** | pytest + pytest-asyncio, httpx `ASGITransport` | 620 tests exercising real HTTP routes against a per-module in-memory SQLite database. External services (Expo Push, Google, Apple) are mocked at the boundary, so the suite needs no network or containers. |
| **Mobile** | Jest (`jest-expo`) + React Native Testing Library | 747 tests across 53 suites covering screens, hooks, stores and pure logic. |
| **Static** | Ruff (lint + format), ESLint (`--max-warnings 0`), `tsc --noEmit` | Enforced on every push, not just on pull requests. |

Details and local commands: [`docs/engineering/TESTING.md`](docs/engineering/TESTING.md).

---

## Engineering workflow

Implementation on this project is AI-assisted, and the interesting part is the
scaffolding built to keep that honest rather than the assistance itself.

- **Claude Code** performs implementation against scoped, file-owned agent definitions in
  [`.claude/agents`](.claude/agents), with domain rules encoded as reusable skills
  (booking state machine, discovery feed, API contract sync).
- **Deterministic gates** run automatically. A Stop hook lints, typechecks and
  secret-scans the working diff before a turn is allowed to finish; a pre-commit hook
  repeats the check before anything is committed.
- **Codex** reviews the resulting diff independently, writing a verdict report that blocks
  only on correctness, regression or security findings.
- **CI** is the final arbiter — nothing merges on a green local run alone.
- **Product direction, architecture, scope and final acceptance stay human-owned.**

None of this makes generated code correct by itself. It makes incorrect code
expensive to land, which is the property that actually matters.

See [`docs/engineering/AI_WORKFLOW.md`](docs/engineering/AI_WORKFLOW.md).

---

## Project ownership

Protin is an independent solo project. There was no team; every decision below was mine:

- **Product direction** — positioning, sport scope, the Sydney-first constraint, and the
  choice to make booking (not matching) the success metric.
- **System architecture** — monorepo layout, the async API, the shared-type contract
  boundary, and moving notification fan-out to a separate worker process.
- **Data modelling** — the schema and its 15-migration history, including the booking
  state machine and the rank/honor accounting rules.
- **Mobile engineering** — screens, navigation, state management and API integration.
- **Testing strategy** — the in-memory-SQLite API harness, the external-boundary mocking
  policy, and the CI gate layout.
- **Infrastructure** — Docker packaging, Compose stacks, nginx, backup/restore and
  health-check tooling, and deployment configuration.
- **Engineering workflow** — the AI-assisted loop described above and the automated gates
  that constrain it.

Implementation is AI-assisted (see the workflow section); the design, review and
acceptance of that work are not.

---

## Repository structure

```
apps/
  api/               FastAPI service — routers, services, models, migrations, worker
  mobile/            Expo React Native app — screens, hooks, stores, navigation
  web/               Vite landing / legal site (privacy, terms, support pages)
packages/
  shared-types/      TypeScript wire contract shared by the API and the app
infra/               nginx config, deploy / backup / health-check scripts, systemd units
docs/                architecture, engineering, deployment, security, legal, archive
.claude/             AI engineering harness — agents, skills, quality-gate hooks
.github/workflows/   CI pipeline
```

---

## Getting started

**Prerequisites:** Node.js 20+, Python 3.12+, [uv](https://docs.astral.sh/uv/), Docker Desktop.

```bash
# 1. Environment files (defaults work for local development as-is)
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env

# 2. Infrastructure — PostgreSQL on :5432, Redis on :6379
npm run infra:up
npm run infra:ps          # wait until both report "Up (healthy)"

# 3. Dependencies
npm install
cd apps/api && uv sync --dev

# 4. Migrations (from apps/api)
uv run alembic upgrade head

# 5. API (from apps/api)
uv run uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/health   ·   docs at http://localhost:8000/docs

# 6. Mobile app — in a second terminal, from the repository root
cd ../..
npm run mobile:start      # then press i (iOS), a (Android), or scan the QR code
```

Step 5 runs in the foreground, so start the app from a second terminal. Steps 4–5 run
from `apps/api`; everything else runs from the repository root.

Hitting a problem? See [`docs/engineering/LOCAL_SETUP.md`](docs/engineering/LOCAL_SETUP.md)
for environment variable reference and troubleshooting.

---

## Development commands

```bash
# Infrastructure (each is its own command)
npm run infra:up          # start PostgreSQL + Redis
npm run infra:down        # stop, keeping volumes
npm run infra:reset       # wipe volumes and restart
npm run infra:logs        # tail service logs
npm run infra:ps          # service status and health

# Mobile — from the repository root
npm run lint      -w @protin/mobile
npm run typecheck -w @protin/mobile
npm run test:ci   -w @protin/mobile
npm run mobile:start      # also: mobile:ios, mobile:android, mobile:web

# API — from apps/api
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run alembic upgrade head

# API container — note the context is the repo root, not apps/api
docker build -f apps/api/Dockerfile .
```

---

## Documentation

| Document | Contents |
|---|---|
| [Architecture](docs/architecture/ARCHITECTURE.md) | System context, components, request flow, data stores, trade-offs |
| [Testing](docs/engineering/TESTING.md) | Test stacks, CI gates, local commands, mocking policy |
| [AI workflow](docs/engineering/AI_WORKFLOW.md) | Roles, quality gates, and the reasoning behind them |
| [Local setup](docs/engineering/LOCAL_SETUP.md) | Environment variables, health checks, troubleshooting |
| [Security audit](docs/security/SECURITY_AUDIT.md) | Reviewed findings, severities and remediation status |
| [Deployment](docs/deployment/RELEASE_RUNBOOK.md) | Release runbook and App Store submission prep |
| [Archive](docs/archive/README.md) | Superseded historical documents, retained for provenance |

---

## License

Source available, all rights reserved — see [LICENSE](LICENSE).
The code is public so it can be read and evaluated; reuse, redistribution and
commercial use require permission.

© 2026 Edward Hwang
