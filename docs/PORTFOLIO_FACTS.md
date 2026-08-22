# Portfolio Facts

Last verified: 2026-08-22

> This document contains repository-verified facts that are safe to reuse in portfolio
> materials, CVs, and the Developer Hub. Every claim here is traceable to source code,
> configuration, or recorded validation output. Anything that could not be verified is
> either absent or explicitly marked.
>
> **Sections [13](#13-known-limitations) and [15](#15-claims-that-must-not-be-used) are
> not optional reading.** They exist because several plausible-sounding claims about this
> project are false, and they were caught by review rather than by intuition.

---

## 1. Identity

| Field | Value |
|---|---|
| Project name | Protin (App Store brand: **SportsGang**) |
| Repository | [EdwardH-jedi/Protin](https://github.com/EdwardH-jedi/Protin) — public, source-available, all rights reserved |
| Project type | Full-stack mobile application (monorepo: React Native client + FastAPI backend) |
| Status | Active. v1 implementation present; expanded security CI awaiting a remote run; **not released** |
| Team size | Solo — independently designed and built |

---

## 2. One-line description

Protin is a mobile social fitness platform that matches people with compatible training
partners and carries them through to a booked, tracked session — discovery, chat,
scheduling, group play, and a reputation system built around actually showing up.

---

## 3. Problem

Finding someone to train with is a coordination problem split across apps that do not
talk to each other: partners are found in one place, times are negotiated in another, and
whether anyone actually turned up is recorded nowhere. Casual group sport is worse — it
needs a roster, a venue, and some reason to trust that strangers will show.

Protin closes that loop in one app and keeps it local, so the people it surfaces are ones
you could realistically meet this week.

---

## 4. What I built

Only implemented work is listed.

- A **React Native / Expo mobile app** — 31 screens across 13 domains, with onboarding,
  partner discovery, matching, real-time chat, session booking, group events, challenges,
  reputation surfaces, and safety tooling.
- A **FastAPI backend** — 15 routers, 17 service modules, 14 ORM model modules, async end
  to end over PostgreSQL, with a 28-table schema and 16 Alembic migrations.
- A **booking state machine** where legal transitions and who may perform them are
  declared as data and enforced in one place.
- **Real-time chat over WebSockets**, with per-match rooms, participant authorisation
  before room admission, and client-side de-duplication across three message sources.
- A **two-part reputation system** — a booking-derived rank/honor ledger, plus a
  competitive Honor System whose write path is reachable only when both challenge
  participants submit matching results.
- **Authentication** — email/password and Sign in with Apple, JWT sessions, rate limiting,
  and in-app account deletion built against App Store guideline 5.1.1(v), including a
  best-effort Apple token revocation step.
- **A background notification worker** delivering push via Expo, kept off the request path.
- **Trust and safety** — reporting, bidirectional blocking that filters the discovery
  feed, and content moderation on inbound messages.
- **Infrastructure** — multi-stage Docker build, Compose stacks for local and staging,
  nginx config, backup/restore and health-check scripts, and Fly.io deployment config.
- **An eight-job CI definition** covering API, mobile, web, PostgreSQL migrations and
  concurrency, Compose exposure and Docker packaging. Locally, **1,407 automated tests
  pass**; three PostgreSQL-only tests await a database-backed CI run.
- **A shared TypeScript type package** pinning the API wire contract for the client.

---

## 5. Technical ownership

Solo project. There was no team; every decision below was mine.

### Client
Screen and navigation architecture, Zustand state design, secure token storage, Expo
module integration (Apple Sign-In, location, maps, calendar, image picker, push), and the
API client layer.

### Backend
API structure and the router/service layering, the booking state machine, discovery
filtering and compatibility scoring, challenge result verification, reputation
accounting, WebSocket chat, and the background worker split.

### Data
The 28-table schema and its 16-migration history, the append-only ledger design for
reputation, and the computed-not-stored tier decision.

### Infrastructure
Docker packaging, Compose stacks, nginx, backup/restore and health-check tooling,
Fly.io configuration, and the CI pipeline design.

### Authentication & security
Dual auth paths, JWT session model, bcrypt hashing, slowapi rate limiting, field-level
Fernet encryption for stored OAuth tokens with environment-gated startup guards, and the
account-deletion flow.

### Engineering process
The AI-assisted implementation workflow, its automated quality gates, and the independent
review loop — including finding and documenting where those gates do not work.

> **Framing note.** Implementation on this project is AI-assisted. Design, review,
> verification and acceptance are not. State this plainly if asked; it is a strength when
> paired with the verification evidence in [§9](#9-verified-engineering-evidence), and a
> credibility problem if concealed.

---

## 6. Verified technology stack

Direct dependencies only, verified against manifests. Transitive packages are excluded.

| Area | Technology |
|---|---|
| Languages | TypeScript 5.9, Python 3.12 |
| Client | React Native 0.81, Expo 54, React 19, React Navigation 6, Zustand 5 |
| Backend | FastAPI, Pydantic 2, SQLAlchemy 2 (async), Alembic, uvicorn, slowapi, PyJWT, passlib/bcrypt |
| Database | PostgreSQL 16 (asyncpg) |
| Cache | Redis 7 |
| Infrastructure | Docker (multi-stage), Docker Compose, nginx, Fly.io config, systemd timers |
| Testing | pytest + pytest-asyncio + httpx ASGITransport, Jest + jest-expo + React Native Testing Library |
| Tooling | Ruff, ESLint, TypeScript compiler, GitHub Actions, npm workspaces, uv |
| Monitoring | Sentry (mobile) |
| External APIs | Apple Sign-In, Google Calendar, Google Places, Expo Push |

---

## 7. Architecture facts

- **Monorepo** — three npm workspaces (`apps/mobile`, `apps/web`,
  `packages/shared-types`) alongside the Python API package (`apps/api`, managed by uv).
- **Two backend processes** — the API and a separate notification worker — sharing models
  and services, deployed from one image.
- **Async end to end** on the backend: async SQLAlchemy over asyncpg, so requests blocked
  on external APIs do not consume a worker thread.
- **Domain logic is server-side.** The client enforces no authoritative business rules; it
  mirrors a few server rules for display only.
- **Transactional integrity on booking transitions**: the status change and any reputation
  ledger rows and queued notifications it triggers are written in one session and committed
  once. (Not every transition triggers all three — reputation rows are emitted only from
  `confirmed → completed / no_show / cancelled`.)
- **Layered API**: routers handle HTTP, services hold domain logic. Two legacy routers
  (`auth`, `users`) predate this and are the exception.
- **Type contract** shared between client and API via a source-only TypeScript package.

Full detail: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 8. Verified features

Each is present in source. All are covered by tests except where noted in the table.

| Feature | Verified detail |
|---|---|
| Partner discovery | Sport-scoped feed; filters on sport, active accounts, prior actions and bidirectional blocks; ranks by 60% skill proximity / 40% preferred-time overlap. Ranking is applied to a capped pool of the 200 newest eligible candidates, not the whole eligible set |
| Mutual matching | Reciprocal like creates a match, which gates chat and booking |
| Real-time chat | WebSocket room per match; URL contains no bearer token; first-message JWT, active-account and participant checks are covered at the route boundary; REST history is also tested. |
| Session booking | State machine over `proposed / confirmed / declined / cancelled / completed / no_show`, role-gated per transition |
| Group events | Rosters, capacity, attendance checks |
| Challenges | Result applied only on matching submissions from both participants, exactly once |
| Tournaments | List / join / leave with capacity under row-level locking — feature-flagged, incomplete |
| Reputation | Booking-derived rank/honor ledger; challenge-gated competitive Honor System |
| Authentication | Email/password + Sign in with Apple; required cryptographic Apple nonce and RS256 verification; 7-day HS256 JWT; trusted-proxy-aware rate limiting |
| Account deletion | In-app, hard delete across all referencing tables, with Apple token revocation |
| Trust & safety | Reporting, bidirectional blocking, content moderation |
| Venue discovery | Seeded Sydney catalogue with optional Google Places provider |
| Push notifications | Scheduled to a table, delivered out of band by the worker via Expo |
| Calendar | Outbound export of a confirmed booking to Google Calendar |

---

## 9. Verified engineering evidence

| Evidence | Value |
|---|---|
| Backend tests | **660 passing, 3 PostgreSQL-only skipped locally** (pytest, 29 modules) |
| Mobile tests | **747 passing** across 53 suites (Jest) |
| Total automated tests | **1,407 passing locally**; three PostgreSQL-only tests are additional |
| CI | **Eight jobs configured, not yet observed green after rehabilitation.** The older six-job [run 32234216724](https://github.com/EdwardH-jedi/Protin/actions/runs/32234216724) validates only base commit `2aced25`. |
| CI jobs | `lint`, `typecheck`, `lint-mobile`, `web-quality`, `test-mobile`, `test`, `postgres-integration`, `docker-build` |
| Lint policy | ESLint runs at `--max-warnings 0`; warnings fail the build |
| Docker | API image builds successfully in CI from a multi-stage Dockerfile |
| Database | 16 Alembic migrations; 28 tables |
| API surface | 15 routers; 17 service modules |
| Codebase | Monorepo — 3 npm workspaces (`@protin/mobile`, `@protin/web`, `@protin/shared-types`) plus the Python API package (`apps/api`, managed by uv) |
| Security review | Written audit with severity ratings and a tracked remediation record |
| Authentication flows | Two implemented and tested: email/password and Sign in with Apple |

No coverage percentage is reported because no coverage tool runs. Do not state one.

---

## 10. Engineering challenges

Each is evidenced by implementation or by recorded review history.

- **Making an incentive system resistant to abuse.** The competitive Honor System's write
  path is deliberately unreachable from any public endpoint — a public wrapper would let
  any authenticated user mutate two other users' rankings. Results flow only through the
  challenge path, only when both participants agree, and only once. Where the same rigour
  was not achievable (booking outcomes are unilaterally reportable), the mitigation is a
  penalty on the claimant, and the limitation is documented rather than hidden.
- **Keeping a state machine auditable.** Rather than scattering status checks across route
  handlers, legal transitions and their permitted actor are declared as a lookup table
  checked in one place, so the complete rule set is readable at a glance.
- **Transactional consistency across three subsystems.** A booking transition writes
  status, reputation ledger rows and queued notifications in a single session and commits
  once, so a booking can never be confirmed without its matching ledger entry.
- **Async SQLAlchemy ergonomics.** Losing lazy loading meant every relationship access
  needed explicit `selectinload`, traded for not blocking a worker thread on slow
  external APIs.
- **Designing for absent credentials.** Optional integrations (Google Calendar, Google
  Places, Apple Sign-In) switch themselves off when unconfigured rather than breaking an
  unrelated flow, which is what lets CI and an App Store reviewer's environment run the
  product without production secrets. Two settings deliberately do the opposite —
  `FIELD_ENCRYPTION_KEY` and `INTERNAL_API_TOKEN` abort startup in staging or production —
  and `EXPO_PUSH_URL` defaults to the live Expo endpoint, so it must be set explicitly
  empty to disable. Deciding which settings fail open and which fail closed was the actual
  design work.
- **Diagnosing a red CI pipeline.** Three distinct causes: a hard-coded test date that had
  elapsed, 89 lint warnings from Jest's mandatory `require()` hoisting pattern, and a
  Docker build context that could never have worked because the Dockerfile expects the
  repo root. The third had also silently broken the staging Compose stack.
- **Auditing my own documentation.** Repeated rounds of independent review against the
  implementation surfaced a series of factual over-claims in documentation I had written —
  including the headline description of how the discovery feed works, the deployment
  status, and which quality gates actually run. Sections 13 and 15 are the direct product
  of that. (Review artifacts are generated into a git-ignored `reviews/` directory, so the
  round count is not reconstructable from the repository — do not quote a number.)

---

## 11. Engineering decisions

- **Separate worker process for push delivery** — costs a second process, buys a booking
  confirmation that returns immediately and a push failure that cannot fail a booking.
- **Computed reputation tier, never stored** — avoids a third source of truth that can
  drift from the ledger.
- **SQLite for the default test suite, PostgreSQL for the concurrency gate** — fast local
  coverage plus CI-only row-lock/migration evidence; the latter still needs its first
  observed green run.
- **Feature flag over a half-finished surface** — tournaments are hidden in v1 builds
  rather than shipped incomplete.
- **Shared type package rather than duplicated interfaces** — a contract change breaks the
  client build instead of surfacing as a runtime error on a user's phone.
- **Fail-closed startup guards for protected environments** — the API refuses to boot in
  staging or production without an encryption key or internal API token, on the grounds
  that a service leaking OAuth tokens is worse than a service that is down.
- **Sydney-first scope** — accepted a data constraint to avoid a premature generalisation.

---

## 12. Validation evidence

Run 2026-08-22 on the rehabilitation worktree based on `2aced25`.

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd apps/api && uv run pytest -q` | PASS — 660 passed, 3 skipped, 711 warnings in 95.27s |
| Frontend tests | `npm run test:ci -w @protin/mobile` | PASS — 747 passed, 53 suites |
| Backend lint | `cd apps/api && uv run ruff check .` | PASS |
| Backend format | `cd apps/api && uv run ruff format --check .` | PASS — 133 files |
| Frontend lint | `npm run lint -w @protin/mobile` | PASS — exit 0 |
| Typecheck | `npm run typecheck -w @protin/mobile` | PASS — exit 0 |
| Web | `npm run typecheck -w @protin/web && npm run build -w @protin/web` | PASS — no TS2786; Vite production build |
| Alembic | `uv run alembic heads`; `uv run alembic upgrade head --sql` | PASS — one `0016` head; offline SQL generated |
| PostgreSQL integration | `POSTGRES_TEST_URL=... uv run pytest -q tests/integration` | NOT VERIFIED locally — PostgreSQL and Docker unavailable |
| Staging Compose | `bash infra/scripts/check-staging-compose.sh` | PASS — only nginx publishes host ports |
| Docker build | `docker build -f apps/api/Dockerfile .` | NOT VERIFIED locally (no Docker daemon) |
| CI | GitHub Actions `ci.yml` | CONFIGURED, NOT YET OBSERVED — eight jobs include web and PostgreSQL |

---

## 13. Known limitations

Mandatory reading before making any claim about this project.

1. **The API is not running.** Fly.io configuration exists and project documentation
   records a production deploy in May 2026, but the host did not respond when checked on
   2026-08-21 and there are no deployment records to confirm either way. The only
   verifiably live artifact is the public legal site on Netlify. Never describe the API as
   deployed or live.
2. **Not released on the App Store.** Store metadata is a draft; no build has been
   submitted or cut to TestFlight.
3. **No real users.** The project has never been used by anyone outside development. No
   usage, scale, retention or performance data exists.
4. **Discovery does not filter by gender, age or distance.** Those preferences are
   captured but never read by the feed query.
5. **Account deletion leaves photo files on disk.** Database rows are removed; uploaded
   images are not. The handler also covers the main domains explicitly and leaves the rest
   to database cascades, and tests assert on only a subset of affected tables — so
   "complete deletion" is not something this repository evidences.
6. **Discovery ranks a capped pool.** Only the 200 newest eligible candidates are scored;
   older eligible users can never surface, and the reported total reflects the capped pool.
7. **JWTs last seven days with no refresh or revocation model.** Shortening access tokens
   requires a compatible mobile refresh flow.
8. **Chat is single-instance.** The WebSocket connection manager is in process memory — no
   restart survival, no horizontal scaling.
9. **Google Calendar is export-only**, and cancelling a booking does not remove the
   calendar event.
10. **Tournaments are incomplete** and feature-flagged off.
11. **No code coverage measurement**, no refresh tokens, no dispute resolution for
    contested booking outcomes.
12. **PostgreSQL concurrency evidence is pending.** Tests and CI service configuration
    exist, but the local machine cannot execute them and the expanded workflow has not yet
    run remotely.
13. **Two of four configured quality-gate hooks do not fire** (pre-commit and post-edit);
    only the Stop gate and CI actually run.
14. **Implementation is AI-assisted.** Do not present the code as entirely hand-written.
15. **npm audit is not clean.** The 2026-08-22 audit reports 30 advisories (2 low,
    10 moderate, 16 high, 2 critical); the critical entries are transitive `shell-quote`
    and `tar`. They were recorded, not auto-fixed through an unrelated major upgrade.

---

## 14. Safe portfolio claims

Verbatim-usable. Every one is supported by the evidence above.

- "Built a full-stack mobile social fitness platform as a solo project — React Native and
  Expo client, FastAPI backend, PostgreSQL and Redis, containerised with Docker."
- "Designed and implemented a 28-table relational schema with 16 Alembic migrations,
  accessed asynchronously via SQLAlchemy 2 over asyncpg."
- "Wrote 1,407 locally passing automated tests — 660 backend (pytest) and 747 mobile
  (Jest) — and configured CI gates for web build, PostgreSQL migrations/concurrency,
  Compose exposure and Docker packaging." Do not say the expanded workflow is green until
  a GitHub Actions run proves it.
- "Implemented a booking state machine with transitions and per-role permissions declared
  as data and enforced centrally, so no route can produce an illegal state change."
- "Built real-time chat over WebSockets with per-match rooms, participant authorisation
  before room admission, and message de-duplication across REST, optimistic-send and
  socket delivery paths."
- "Implemented two authentication flows — email/password with bcrypt, and Sign in with
  Apple — issuing JWT sessions, with rate limiting and an in-app account-deletion flow
  built against App Store guideline 5.1.1(v), including best-effort Apple token
  revocation."
- "Applied field-level Fernet encryption to stored OAuth tokens, with startup guards that
  refuse to boot a staging or production environment without an encryption key."
- "Separated push-notification fan-out into a dedicated worker process so slow external
  delivery cannot block or fail a user-facing booking request."
- "Established a shared TypeScript type package as the client/API wire contract, so that
  where the client consumes it, a contract change surfaces as a build failure rather than a
  runtime error." (Do not extend this to the API side — the backend mirrors the package by
  convention only, and it is not generated from OpenAPI.)
- "Diagnosed and fixed a broken CI pipeline — an elapsed hard-coded test date, a lint rule
  conflicting with Jest's mock-hoisting requirement, and a Docker build context error that
  had also silently broken the staging Compose stack."
- "Conducted a written security audit with severity-rated findings and tracked each to
  closure, partial remediation, or an explicitly open state."
- "Used an AI-assisted development workflow with deterministic automated gates and
  independent diff review, keeping architecture, scope and acceptance under human control."

---

## 15. Claims that must NOT be used

Every entry below is tempting, plausible, and **false for this repository**. Several were
caught only by independent review after appearing in earlier documentation.

| Do not say | Why it is false |
|---|---|
| "Deployed to production" / "live in production" | The API did not respond at its Fly hostname; no deployment records exist. |
| "Available on the App Store" / "shipped to the App Store" | No build has been submitted. Store metadata is explicitly a draft. |
| Any user count, DAU, retention, or growth figure | The app has never had a user. |
| Any latency, throughput, uptime or scale number | Nothing has been measured or load-tested. |
| "Production-grade", "enterprise-ready", "industry-leading" | Unmeasured marketing language with no evidence behind it. |
| "Highly scalable" / "horizontally scalable" | Chat state and media storage are both single-instance. |
| "Matches users by location, age and gender preferences" | Those preferences are stored but never applied to the feed. |
| "Two-way Google Calendar sync" | Export is outbound only; nothing flows back. |
| "Fully GDPR-compliant deletion" / "complete data erasure" | Photo files survive account deletion. |
| "Short-lived, revocable sessions" | JWTs last seven days and there is no refresh or revocation model. |
| "Comprehensive test coverage" / any coverage percentage | No coverage tool runs; no percentage exists. |
| "Automated pre-commit quality gates enforce every change" | Those hooks are configured but inert. |
| "Tournament system with brackets and rankings" | Brackets and rank integration are not implemented. |
| "Led a team" / "collaborated with engineers" | Solo project. |
| Presenting the code as entirely hand-written | Implementation is AI-assisted. |

---

## 16. Developer Hub sync

Fields safe to flow into the portfolio site, and what to draw them from.

| Hub field | Source | Notes |
|---|---|---|
| Project title | [§1](#1-identity) | "Protin" — mention the SportsGang brand only with the "prepared for submission" caveat |
| Tagline | [§2](#2-one-line-description) | Use verbatim |
| Problem statement | [§3](#3-problem) | Use verbatim or trim |
| Role | [§5](#5-technical-ownership) | "Solo — full-stack, infrastructure and testing" |
| Tech stack tags | [§6](#6-verified-technology-stack) | Direct dependencies only |
| Feature list | [§8](#8-verified-features) | Mark tournaments as in progress if included |
| Highlight metrics | [§9](#9-verified-engineering-evidence) | Test counts, CI job count, migration count, router count — these are the only numbers that may be published |
| Bullet points | [§14](#14-safe-portfolio-claims) | Use verbatim |
| Status badge | [§1](#1-identity) | "Active — pre-release". **Never** "Live" or "Deployed" |
| Live demo link | — | **Leave empty.** No deployed product exists. The Netlify site is a marketing page, not a demo. |
| Repository link | [§1](#1-identity) | Public |

Before publishing anything not drawn from this file, check it against
[§15](#15-claims-that-must-not-be-used).

**Re-verify this document whenever the repository changes materially** — particularly the
counts in [§9](#9-verified-engineering-evidence) and the deployment status in
[§13](#13-known-limitations).
