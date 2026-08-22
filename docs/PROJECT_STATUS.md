# Project Status

Last verified: 2026-08-22
Repository: EdwardH-jedi/Protin
Default branch: main
Status: Active

> Canonical current-state document. Where this file and any other document disagree,
> repository evidence wins and this file is corrected first. A stale April 2026 status
> snapshot is retained at
> [`docs/archive/2026-04-project-status.md`](archive/2026-04-project-status.md) for
> history only — it does not describe the current repository.

---

## 1. Project summary

Protin is a mobile social fitness platform for finding training partners and organising
sports sessions. It covers the full loop: sport-scoped partner discovery, mutual
matching, real-time chat, 1:1 session booking with an explicit state machine, group
events and head-to-head challenges, and a reputation system driven by booking outcomes.

Supported sports are gym, golf, tennis and running. The product is Sydney-first by
design — the venue catalogue, suburb model and distance handling all assume one city.

The app is prepared for App Store submission under the brand **SportsGang**; `protin`
remains the internal project and package namespace.

---

## 2. Current stage

The v1 implementation is present and the security rehabilitation passes local non-Docker
checks, but the expanded PostgreSQL/web workflow has **not yet been observed green in
remote CI**. The project is not released; no App Store or TestFlight build has been
submitted, and the API is not verifiably deployed anywhere (see [§7](#7-deployment)).

The work remaining before a release is submission mechanics and the gaps listed in
[§4](#4-partially-implemented) and [§8](#8-known-issues) — not core feature development.

---

## 3. Implemented

### Mobile / client

- Expo 54 / React Native 0.81 / React 19, TypeScript throughout; 31 screen components
  across 13 domain folders with React Navigation (native stack + bottom tabs).
- Zustand stores for auth and profile; JWT persisted in `expo-secure-store`.
- Onboarding flow (4 steps), profile and public-profile screens, photo upload.
- Discovery feed with like / pass / save, match creation, matches list.
- Real-time chat screen over WebSocket with optimistic send and de-duplication.
- Booking composer and detail screens driving the server state machine.
- Events ("battles"), challenges, tournaments, rank/honor and safety screens.
- Apple Sign-In, location, maps, device calendar, image picker, push registration,
  Sentry — all via Expo modules, so the app builds through EAS with no custom native code.

### Backend / API

- FastAPI on Python 3.12, async end to end: 15 routers, 17 service modules, 14 ORM model
  modules.
- Booking state machine with transitions declared as a `(status, target) → allowed_by`
  table and enforced centrally.
- Discovery feed: filters on sport, active accounts, already-acted-on cards and
  bidirectional blocks, then scores a capped pool of the 200 newest remaining candidates by
  60% skill-level proximity / 40% preferred-time overlap.
- Challenge results applied only when both participants submit matching outcomes.
- Two reputation subsystems — a booking-derived rank/honor ledger, and a
  challenge-gated competitive Honor System with a read-only public API.
- WebSocket chat with a first-message JWT handshake, active-account and participant
  checks before room admission; bearer tokens are not placed in socket URLs.
- Google Calendar outbound export, Google Places venue search, Expo Push, content
  moderation, reporting and blocking.

### Authentication

- Email + password (bcrypt via passlib) and Sign in with Apple, both minting the same
  HS256 JWT (`sub` = user id, 7-day expiry).
- Rate limiting via slowapi on registration (3/min) and login (5/min).
- Sign in with Apple requires a cryptographically random nonce and the API pins RS256,
  validates JWK metadata and rejects missing or mismatched nonces.
- In-app account deletion: the handler explicitly deletes rows across the main domains in
  dependency order and relies on database-level cascades for the remainder, with
  best-effort Apple token revocation attempted first. Tests cover a subset of the affected
  tables, not all of them.

### Data / persistence

- PostgreSQL 16 via async SQLAlchemy 2.0 over asyncpg; 28 tables; 16 Alembic migrations.
- Redis 7 for rate-limit state and as a health-checked dependency.
- Field-level Fernet encryption for stored Google OAuth tokens. Protected environments
  centrally reject missing, placeholder, short/repetitive JWT and internal-service
  secrets, and malformed Fernet keys at startup.
- Google OAuth uses random, hashed, short-lived, one-time database state bound to the
  authenticated user and redirect URI, plus S256 PKCE.

### Infrastructure

- Multi-stage Docker build for the API (build context = repo root).
- Compose stacks for local (`docker-compose.yml`) and staging
  (`docker-compose.staging.yml`).
- `infra/` — nginx config, deploy / backup / restore / health-check scripts, systemd
  timer units.
- `fly.toml` for Fly.io with separate `app` and `worker` processes.
- GitHub Actions CI: eight configured jobs, including web build and PostgreSQL 16
  migration/concurrency validation. This expanded workflow is not yet remotely verified.

### Testing

- API: 660 pytest tests pass locally and three PostgreSQL-only tests skip without a
  database, across 29 modules; most drive the real ASGI app over HTTP via httpx
  `ASGITransport` against per-module in-memory SQLite.
- Mobile: 747 Jest tests across 53 suites (jest-expo + React Native Testing Library).
- Static analysis: Ruff (lint + format), ESLint at `--max-warnings 0`, `tsc --noEmit`.

---

## 4. Partially implemented

| Area | What works | What does not |
|---|---|---|
| Tournaments | List, join, leave, with capacity enforced under row-level locking | Bracket generation, result verification and rank integration. Hidden behind a feature flag so v1 builds do not show a half-finished surface. |
| Google Calendar | OAuth connect and outbound export of a confirmed booking | No inbound sync. `cancel_calendar_event` exists but has no caller, so cancelling a booking leaves the calendar event in place. |
| Discovery preferences | Gender, age-range and distance preferences are captured and stored in `identity_preferences` | The feed query never reads them. Only sport, blocks and prior actions filter; skill and time only affect ranking. Ranking is also applied to a capped pool of 200 candidates (`_SCORE_POOL`), so older eligible users can never surface and the reported total reflects the cap. |
| Account deletion | The handler explicitly removes rows across the main domains in dependency order; remaining references rely on DB cascades | Uploaded photo *files* are left on disk (`clear_user_photos` exists but no deletion path calls it). Test coverage exercises a subset of affected tables — several event, tournament, challenge and reputation tables are not asserted on. |
| `shared-types` contract | ~22 non-test mobile modules import the shared package | Not generated from OpenAPI, and `useDiscovery` still declares its wire shapes inline. |
| AI quality-gate harness | The two `Stop` hooks (quality gate + Codex review) run | The `PreToolUse` and `PostToolUse` hooks never fire — `settings.json` passes `$CLAUDE_TOOL_INPUT_*` variables that are never set. Verified empirically. |
| Router / service layering | Booking, discovery, challenge, rank, event and safety logic lives in `services/` | `routers/auth.py` and `routers/users.py` hold their own persistence logic. |

---

## 5. Not implemented

- Refresh tokens, token revocation or a `jti` claim — a 7-day JWT is the whole session
  model.
- Redis pub/sub backplane for chat; the WebSocket connection manager is in-process, so
  chat is single-instance.
- Cloud object storage for media; profile photos are local disk + `StaticFiles`.
- A dispute window for contested booking outcomes.
- Payments, admin panel, analytics dashboard, or a web product client. (`apps/web` is a
  marketing/legal site, not a client.)
- Code-coverage measurement. No coverage tool runs and no percentage is reported.

---

## 6. Validation

Commands below ran 2026-08-22 on the rehabilitation worktree based on `2aced25`. The
tree also contains pre-existing documentation/configuration edits and was not clean.

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd apps/api && uv run pytest -q` | **PASS** — 660 passed, 3 PostgreSQL-only skipped, 711 warnings in 95.27s |
| Frontend tests | `npm run test:ci -w @protin/mobile` | **PASS** — 747 passed, 53 suites |
| Backend lint | `cd apps/api && uv run ruff check .` | **PASS** — all checks passed |
| Backend format | `cd apps/api && uv run ruff format --check .` | **PASS** — 133 files already formatted |
| Frontend lint | `npm run lint -w @protin/mobile` | **PASS** — exit 0 (`eslint --max-warnings 0`) |
| Typecheck | `npm run typecheck -w @protin/mobile` | **PASS** — `tsc --noEmit`, exit 0 |
| Web | `npm run typecheck -w @protin/web && npm run build -w @protin/web` | **PASS** — no TS2786; Vite production build completed |
| Alembic | `uv run alembic heads`; `uv run alembic upgrade head --sql` | **PASS** — one head (`0016`), full offline PostgreSQL SQL generated |
| PostgreSQL integration | `POSTGRES_TEST_URL=... uv run pytest -q tests/integration` | **NOT VERIFIED locally** — no PostgreSQL server or Docker daemon; 3 tests skip in the default run |
| Staging exposure | `bash infra/scripts/check-staging-compose.sh` | **PASS** — rendered PostgreSQL/Redis/API/worker/migrate have no host ports; nginx is the only ingress |
| Docker build | `docker build -f apps/api/Dockerfile .` | **NOT VERIFIED locally** — no Docker daemon available |
| CI | GitHub Actions `ci.yml` | **CONFIGURED, NOT YET OBSERVED** — eight jobs now include web and PostgreSQL; the older six-job run on `2aced25` does not validate these changes |

---

## 7. Deployment

| Environment | State |
|---|---|
| Public legal site (Netlify) | **Currently deployed.** `https://sportgang.netlify.app/` and `/privacy/` both returned `200` on 2026-08-21, and the app's `EXPO_PUBLIC_*_URL` settings point at it. The repository contains no Netlify configuration, so it is **not established** that this site is built from `apps/web` — treat them as separate artifacts. |
| API — Fly.io | **Not running.** `fly.toml` targets app `protin-api` in `syd` (generated 2026-05-07). `https://protin-api.fly.dev/health` did not connect on 2026-08-21; there are no GitHub deployment or environment records; no Fly CLI was available to query the platform. Project documentation does record a past production deploy — `docs/deployment/APP_STORE_SUBMISSION.md` states reviewer seed data was run against the Fly `protin-api` production database on 2026-05-12 — but that is a documentary claim, not verified evidence, and the service is unreachable now. Do not describe the API as deployed. |
| Staging — self-hosted | **Local-network only.** `docker-compose.staging.yml` plus `infra/` target a LAN host. Never publicly reachable. |
| App Store / TestFlight | **Not released.** Store metadata is explicitly a draft, and no build has been submitted or cut. |

No live production API deployment should be inferred from the presence of `fly.toml`.

---

## 8. Known issues

1. **Account deletion leaves photo files on disk.** Privacy-relevant, and relevant to the
   App Store deletion guideline the feature was built for.
2. **Seven-day JWT sessions have no refresh/revocation model.** The lifetime was not
   shortened because that would break the existing mobile session without a refresh flow.
3. **`PreToolUse` / `PostToolUse` hooks do not fire.** The pre-commit and post-edit
   quality gates are configured but inert; only the `Stop` gate and CI actually run.
4. **Chat is single-instance.** The WebSocket connection manager holds rooms in process
   memory — it does not survive a restart or scale horizontally.
5. **`decrypt_token` returns the raw stored value on Fernet failure**, which can forward
   an unexpected value to Google APIs. Open as finding **M4** in the security audit.
6. **Expanded CI is unverified remotely.** PostgreSQL concurrency and fresh-migration
   tests exist and are wired to GitHub Actions, but cannot be called verified until that
   workflow runs green.
7. **The npm dependency tree has unresolved advisories.** `npm audit --json` on
   2026-08-22 reports 30 findings (2 low, 10 moderate, 16 high, 2 critical); the critical
   transitive packages are `shell-quote` and `tar`. Fix suggestions include dependency
   changes outside this focused pass and need a separately tested upgrade.

---

## 9. Technical debt

- `routers/auth.py` and `routers/users.py` predate the router/service split and hold
  persistence logic inline.
- `shared-types` is hand-maintained rather than generated from the OpenAPI schema, so
  the API side of the contract is upheld by review convention only.
- Most API tests still use SQLite. Three PostgreSQL-only concurrency tests and fresh
  migration application are configured in CI, but have not been executed locally.
- Expo Push HTTP request/response handling remains mocked above its transport boundary.
- `codex-review.sh` sends staged changes to the reviewer twice (`git diff HEAD` already
  includes them before `git diff --cached` appends them again).
- Security audit findings M1–M5 and L1, L3–L5 remain open.

---

## 10. Next recommended work

1. **Obtain a green expanded CI run**, including PostgreSQL 16 migrations/concurrency and
   the web production build.
2. **Purge photo files on account deletion** by calling `clear_user_photos` from the
   deletion path. Privacy-relevant and a genuine compliance gap.
3. **Fix the `PreToolUse` / `PostToolUse` hook wiring** — read the JSON payload from
   stdin, and resolve `ruff` / `tsc` via `uv run` / `npx --no-install` at the same time.
4. **Merge PR #3** so `main` and the CI badge go green.
5. **Apply `identity_preferences` to the discovery feed**, closing the largest gap
   between what the product captures and what it uses.

---

## 11. Portfolio readiness

| Dimension | State |
|---|---|
| README accuracy | Verified against implementation over multiple independent review rounds; over-claims removed. |
| Tests | 660 backend + 747 mobile pass locally; 3 PostgreSQL-only tests await CI execution. |
| Lint / format | Ruff, ESLint (`--max-warnings 0`) and `tsc` all clean. |
| Build | API Docker image builds in CI; not verifiable locally. |
| Secrets | No committed secrets found. Tracked `.env*` files are examples with placeholder values only. |
| Architecture documentation | [`ARCHITECTURE.md`](ARCHITECTURE.md) describes the implemented system, with limitations and planned work separated. |
| Portfolio claims | Constrained to [`PORTFOLIO_FACTS.md`](PORTFOLIO_FACTS.md), which lists both safe claims and claims that must not be used. |

**Assessment: REQUIRES ANOTHER PASS.** The local evidence is materially stronger, but a
green remote PostgreSQL migration/concurrency run is still an acceptance gate. The API
also remains unverifiably deployed and account deletion still leaves photo files behind.
