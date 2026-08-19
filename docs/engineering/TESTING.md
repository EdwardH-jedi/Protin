# Testing & quality

What is tested, how, and what the tests deliberately do not cover.

---

## At a glance

| | Framework | Count | Runtime |
|---|---|---|---|
| API | pytest + pytest-asyncio | 620 tests, 26 modules | ~95s |
| Mobile | Jest (`jest-expo`) + React Native Testing Library | 747 tests, 53 suites | ~7s |

Counts are from the runs recorded on this branch. Neither suite requires Docker,
a database, or network access.

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
- **Apple identity-token verification** is likewise stubbed above the boundary — route
  tests monkeypatch `verify_identity_token` outright. The routes' handling of a verified
  or rejected token is covered; the function's own JWKS fetch, key rotation, signature
  check and nonce comparison are not.

The last two are the suite's most significant coverage gaps and are named here rather
than implied away. Both are cheap to close by moving the stub down to the HTTP client.

**What this does not cover.** SQLite is not PostgreSQL. Anything relying on
PostgreSQL-specific behaviour is unverified by the suite — most notably the
`with_for_update` row lock guarding tournament capacity, which SQLite silently ignores.
Migrations are also not applied during tests (the schema comes from metadata), so a
migration that diverges from the models would not be caught here.

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

```
lint (ruff check + ruff format --check) ──> test (pytest) ──┐
lint-mobile (eslint --max-warnings 0) ───> test-mobile ─────┼──> docker-build
typecheck (tsc --noEmit) ──────────────────────────────────┘
```

| Job | Command |
|---|---|
| `lint` | `uv run ruff check .` and `uv run ruff format --check .` |
| `typecheck` | `npm run typecheck -w @protin/mobile` |
| `lint-mobile` | `npm run lint -w @protin/mobile` |
| `test` | `cd apps/api && uv run pytest` |
| `test-mobile` | `npm run test:ci -w @protin/mobile` |
| `docker-build` | `docker build -f apps/api/Dockerfile .` |

Three things worth noting about the gate design:

- **Lint failures block their test job.** Running a test suite over code that does not
  pass lint wastes a runner and buries the actionable signal under the noisier one.
- **`--max-warnings 0`.** ESLint warnings fail the build, so there is no accumulating
  backlog of "known warnings" that stops being read.
- **The Docker build is the final gate.** It only runs once every test and static check
  has passed, and it verifies that the deployable artefact — the same Dockerfile
  `fly.toml` uses — still builds.

No coverage threshold is enforced, and no coverage percentage is reported. Adding a
number without a policy behind it would be decoration.

---

## Local pre-stop gates

Beyond CI, the `.claude/hooks` harness runs the same checks against the working diff
before an AI-assisted turn is allowed to finish — Ruff on changed Python, `tsc` on
changed TypeScript, and a secret-pattern scan on the diff itself. See
[AI_WORKFLOW.md](AI_WORKFLOW.md).
