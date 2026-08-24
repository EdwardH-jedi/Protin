# Protin

Protin connects players for peer sports matches: discover opponents nearby, issue challenges, book courts, and track results through a ranking and honour system.

| Layer | Stack |
|---|---|
| Mobile | Expo 52, React Native 0.76, TypeScript, React Navigation |
| API | FastAPI, SQLAlchemy (async), Alembic, Python 3.12 |
| Data | PostgreSQL 16, Redis 7 |
| Package manager (JS) | npm workspaces |
| Package manager (Python) | uv |

---

## Repository layout

```
.
├── apps/
│   ├── api/                  FastAPI service
│   │   ├── alembic/          database migrations
│   │   ├── app/
│   │   │   ├── core/         config, security
│   │   │   └── db/           SQLAlchemy engine, Redis client
│   │   └── tests/
│   └── mobile/               Expo React Native app
│       └── src/
│           ├── components/   shared UI primitives
│           ├── navigation/   React Navigation setup
│           ├── screens/      screen shells by domain
│           └── theme/        design tokens
├── .env.example              root infrastructure variables (source of truth)
├── docker-compose.yml        PostgreSQL + Redis
└── package.json              npm workspace root + infra scripts
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | bundled with Node |
| Python | 3.12+ | [python.org](https://python.org) |
| uv | latest | `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker Desktop | latest | [docker.com](https://docker.com) |

---

## Local setup

### 1. Copy environment files

**bash / macOS / Linux**
```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

**PowerShell**
```powershell
Copy-Item .env.example .env
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\mobile\.env.example apps\mobile\.env
```

The default values work out of the box for local development.
See [Environment variables](#environment-variables) if you need to change ports.

---

### 2. Start infrastructure

```bash
npm run infra:up
```

This starts PostgreSQL on `localhost:5432` and Redis on `localhost:6379`.

**Wait for both services to be healthy before continuing:**

```bash
npm run infra:ps
```

Expected output — both `Status` columns should read `Up (healthy)`:

```
NAME               IMAGE                COMMAND                  STATUS
protin-postgres-1  postgres:16-alpine   "docker-entrypoint.s…"  Up (healthy)
protin-redis-1     redis:7-alpine       "docker-entrypoint.s…"  Up (healthy)
```

If services show `starting` rather than `healthy`, wait 10–15 seconds and run `npm run infra:ps` again.

---

### 3. Install dependencies

```bash
npm install                       # JavaScript — mobile app + root tooling
cd apps/api && uv sync --dev      # Python — API + test dependencies
```

---

### 4. Run database migrations

From `apps/api`:

```bash
uv run alembic upgrade head
```

Expected output:

```
INFO  [alembic.runtime.migration] Context impl PostgreSQLImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
```

Migrations are a no-op if the schema is already current.
Re-run this command whenever new migration files are added.

---

### 5. Start the API

From `apps/api`:

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Verify the API is running and connected to both services:**

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok","environment":"local","checks":{"db":"ok","redis":"ok"}}
```

If either check shows `"error"`, see [Troubleshooting](#troubleshooting).

Interactive API docs: `http://localhost:8000/docs`

---

### 6. Start the mobile app

From the repository root:

```bash
npm run mobile:start
```

Then in the Expo terminal:

| Key | Action |
|---|---|
| `a` | Open Android emulator |
| `i` | Open iOS simulator |
| `w` | Open in browser |
| Scan QR | Open in Expo Go on a physical device |

The app connects to `EXPO_PUBLIC_API_URL` from `apps/mobile/.env` (default: `http://localhost:8000`).

---

## Development scripts

All infra scripts run from the repository root via npm.

### Infrastructure

```bash
npm run infra:up           # start PostgreSQL and Redis (detached)
npm run infra:down         # stop services, keep data volumes
npm run infra:reset        # wipe volumes and restart fresh (re-run migrations after)
npm run infra:logs         # tail all service logs
npm run infra:ps           # show service status and health
```

### Mobile

```bash
npm run mobile:start       # start Expo dev server
npm run mobile:android     # open Android emulator
npm run mobile:ios         # open iOS simulator
npm run mobile:web         # open in browser
```

### API (run from `apps/api`)

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000   # dev server
uv run pytest                                                       # test suite
uv run alembic upgrade head                                         # apply migrations
uv run alembic downgrade -1                                         # roll back one migration
```

---

## Health verification

Use these checks to confirm the full stack is operational before developing.

### Infrastructure

```bash
npm run infra:ps
# Both STATUS values should be "Up (healthy)"

# Check PostgreSQL directly
docker compose exec postgres pg_isready -U protin
# → /var/run/postgresql:5432 - accepting connections

# Check Redis directly
docker compose exec redis redis-cli ping
# → PONG
```

### API

```bash
curl http://localhost:8000/health
# → {"status":"ok","environment":"local","checks":{"db":"ok","redis":"ok"}}
```

Both checks inside `checks` must be `"ok"`. If either is `"error"`, the service
is running but cannot reach that dependency — see [Troubleshooting](#troubleshooting).

---

## Environment variables

### `.env` (root) — Docker Compose + shared

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` | `protin` | database name |
| `POSTGRES_USER` | `protin` | database user |
| `POSTGRES_PASSWORD` | `protin` | database password |
| `POSTGRES_PORT` | `5432` | host port for PostgreSQL |
| `REDIS_PORT` | `6379` | host port for Redis |
| `APP_ENV` | `local` | reported in `/health` response |
| `API_HOST` | `0.0.0.0` | uvicorn bind address |
| `API_PORT` | `8000` | uvicorn bind port |
| `POSTGRES_URL` | `postgresql://protin:protin@localhost:5432/protin` | used by API and Alembic |
| `REDIS_URL` | `redis://localhost:6379/0` | used by API |
| `EXPO_PUBLIC_API_URL` | `http://localhost:8000` | API base URL baked into mobile JS bundle |

### `apps/api/.env` — FastAPI runtime only

Subset of the root variables: `APP_ENV`, `API_HOST`, `API_PORT`, `POSTGRES_URL`, `REDIS_URL`.

### `apps/mobile/.env` — Expo runtime only

`EXPO_PUBLIC_API_URL` only. The `EXPO_PUBLIC_` prefix is required by Expo to expose
variables to the JavaScript bundle.

---

## Troubleshooting

### Port conflicts

If ports `5432` or `6379` are already in use on your machine, edit `.env` before starting:

```
POSTGRES_PORT=5433
REDIS_PORT=6380
```

Then update `POSTGRES_URL` to use the new port, restart infra (`npm run infra:reset`),
and re-run migrations.

### API health returns `"db": "error"`

1. Confirm PostgreSQL is healthy: `npm run infra:ps`
2. Confirm `POSTGRES_URL` in `apps/api/.env` matches the credentials in `.env`
   (default for both: `protin` / `protin` / `protin`)
3. If you reset volumes with `npm run infra:reset`, re-run migrations:
   ```bash
   cd apps/api && uv run alembic upgrade head
   ```

### API health returns `"redis": "error"`

1. Confirm Redis is healthy: `npm run infra:ps`
2. Confirm `REDIS_URL` in `apps/api/.env` matches the port in `.env`

### Migrations fail: `Connection refused`

PostgreSQL is not yet ready. Wait for `npm run infra:ps` to show `Up (healthy)`,
then retry.

### `uv` not found

Install uv:
```bash
# bash
curl -LsSf https://astral.sh/uv/install.sh | sh

# PowerShell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

---

## Stopping and resetting

```bash
npm run infra:down          # stop services, data volumes are preserved
npm run infra:reset         # wipe all data volumes and restart fresh
```

After `infra:reset`, re-run migrations before starting the API:

```bash
cd apps/api && uv run alembic upgrade head
```
