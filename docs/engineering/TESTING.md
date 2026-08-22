# Testing & quality

What is tested, how, and what the tests deliberately do not cover.

---

## At a glance

| | Framework | Count | Runtime |
|---|---|---|---|
| API | pytest + pytest-asyncio | 660 passing, 3 PostgreSQL-only skipped, 29 modules | ~95s |
| Mobile | Jest (`jest-expo`) + React Native Testing Library | 747 tests, 53 suites | ~7s |

Counts are from the 2026-08-22 local runs on this branch. The default API suite needs no
container or network, but three concurrency tests require `POSTGRES_TEST_URL` and are
skipped locally when PostgreSQL is unavailable. CI supplies PostgreSQL 16.

---

## Running everything locally

```bash
# API — from apps/api
uv sync --dev
uv run ruff check .
uv run ruff format --check .
uv run pytest

# Mobile — from the repository root
npm ci
npm run lint      -w @protin/mobile
npm run typecheck -w @protin/mobile
npm run test:ci   -w @protin/mobile

# Web — from the repository root
npm run typecheck -w @protin/web
npm run build     -w @protin/web

# PostgreSQL-only migration and concurrency gate
POSTGRES_URL=postgresql://... uv run alembic upgrade head
POSTGRES_TEST_URL=postgresql+asyncpg://... uv run pytest -q tests/integration

# Rendered staging-network assertion — from the repository root
bash infra/scripts/check-staging-compose.sh

# API container
docker build -f apps/api/Dockerfile .
```

Note the Docker build context: the repository **root**, not `apps/api`. The Dockerfile
`COPY`s repo-root-relative paths to match how `fly.toml` builds the image, and the root
`.dockerignore` is written against the same context.

---

## API tests

**Stack.** pytest with `asyncio_mode = "auto"`. Most modules drive the real ASGI app
through httpx's `ASGITransport`, exercising actual HTTP routes — method, path, status
code, response body — so route wiring, dependency resolution, auth and serialisation are
covered rather than bypassed. A minority test a service or pure function directly where
there is no route to go through: `test_places`, `test_matching_eval`,
`test_content_moderation`, `test_seed_venues` and `test_startup_import`.

**Database.** Nineteen of the twenty-six modules stand up their own module-scoped
in-memory SQLite engine (`sqlite+aiosqlite:///:memory:`) and override the `get_db`
dependency against it. Each module gets a fresh schema created from the SQLAlchemy
metadata, which keeps modules isolated without any cross-test teardown ordering.

The remaining modules — `test_health`, `test_apple_auth`, `test_places`,
`test_content_moderation`, `test_matching_eval`, `test_seed_venues`,
`test_startup_import` — need no persistence and use the mocked-session fixture in
`conftest.py` or test pure functions directly.

**Redis** is mocked globally, and slowapi's limiter is disabled for the suite in
`conftest.py` so rate limits do not make test ordering significant.

**External services** are mocked so no test touches the network, but not all at the same
depth, and the difference matters:

- **Google Places** is stubbed at the HTTP boundary, so our own request construction,
  response parsing and error handling stay under test.
- **Google Calendar** is stubbed at the HTTP boundary for the OAuth token exchange only.
  The event create/update calls and their error paths have no HTTP-boundary test.
- **Expo Push** is stubbed one level higher: tests replace `_send_expo_push` itself, so
  scheduling, due-event selection and the failure bookkeeping around delivery are
  covered, but the Expo request body and response handling are not.
- **Apple route tests** stub the verifier, while `test_apple_auth.py` separately exercises
  the verifier with a real RS256-signed token and mocked JWKS transport: issuer, audience,
  expiry, required nonce, algorithm pinning, unknown key and cache rotation are covered.

Expo Push request/response handling remains the significant external-boundary gap.

**WebSocket boundary.** `test_chat.py` exercises the route's first-message authentication,
timeout/missing-auth rejection, invalid and expired JWTs, inactive accounts, participant
admission and nonparticipant denial with a deterministic fake socket. The mobile test
also asserts that the constructed URL contains no token and that auth is sent after open.

SQLite is still the default unit/integration store. A separate PostgreSQL group applies
all Alembic migrations and tests concurrent double-complete, confirm-vs-decline, and
one-time OAuth-state consumption. Those tests are configured in CI but were **not verified
locally** on 2026-08-22 because this machine has no PostgreSQL server or Docker daemon.

---

## Mobile tests

**Stack.** Jest via the `jest-expo` preset, with React Native Testing Library for
component and screen rendering.

**Coverage shape.** Roughly three groups:

- **Screens** — rendered with mocked navigation and API modules, asserting on
  user-visible output and on what interaction dispatches. Every major surface has one:
  discovery, matches, chat, bookings, events/battles, challenges, tournaments,
  onboarding, profile, safety and auth.
- **Hooks and stores** — `useDiscovery`, `useVenueLocation`, `useUserHonorSummary`, the
  profile store, the auth store.
- **Pure logic** — the API client, display-name formatting, session-time formatting,
  rank and honor derivation, venue location maths, legal link resolution.

**Mocking.** Native Expo modules (secure store, location, notifications, Apple
authentication) and the API client are mocked per suite. Because `jest.mock` factories
hoist above the import block, mocked modules are pulled in with `require()` after the
mocks are declared — the ESLint config scopes `no-require-imports` and `import/first`
off for `src/__tests__/**` for exactly that reason, and both rules stay on for
production sources.

---

## CI gates

`.github/workflows/ci.yml` runs on every push to any branch and on pull requests to
`main`, with in-progress PR runs cancelled when superseded.

The workflow defines eight jobs. `docker-build` waits for API tests, PostgreSQL
integration, mobile typecheck/tests, and web quality; the independent lint jobs remain
required workflow results.

| Job | Command |
|---|---|
| `lint` | `uv run ruff check .` and `uv run ruff format --check .` |
| `typecheck` | `npm run typecheck -w @protin/mobile` |
| `lint-mobile` | `npm run lint -w @protin/mobile` |
| `test` | `cd apps/api && uv run pytest` |
| `test-mobile` | `npm run test:ci -w @protin/mobile` |
| `web-quality` | `npm run build -w @protin/web` (TypeScript check + Vite production build) |
| `postgres-integration` | PostgreSQL 16 service, `alembic upgrade head`, one-head assertion, `pytest -q tests/integration` |
| `docker-build` | API image build plus `bash infra/scripts/check-staging-compose.sh` |

Three things worth noting about the gate design:

- **Lint failures block their test job.** Running a test suite over code that does not
  pass lint wastes a runner and buries the actionable signal under the noisier one.
- **`--max-warnings 0`.** ESLint warnings fail the build, so there is no accumulating
  backlog of "known warnings" that stops being read.
- **The Docker build is the final gate.** It verifies the deployable image and rendered
  staging exposure after the web and PostgreSQL gates have passed.

All eight jobs passed on commit `956c002` in
[run 32553409076](https://github.com/EdwardH-jedi/Protin/actions/runs/32553409076).
The PostgreSQL job applied all 16 migrations, verified one head and passed all three
concurrency/atomic-consumption tests; Docker packaging and rendered Compose exposure also
passed.

No coverage threshold is enforced, and no coverage percentage is reported. Adding a
number without a policy behind it would be decoration.

---

## Local pre-stop gates

Beyond CI, the `.claude/hooks` harness runs the same checks against the working diff
before an AI-assisted turn is allowed to finish — Ruff on changed Python, `tsc` on
changed TypeScript, and a secret-pattern scan on the diff itself. See
[AI_WORKFLOW.md](AI_WORKFLOW.md).
