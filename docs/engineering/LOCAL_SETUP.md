# Local setup reference

Environment variables, health verification and troubleshooting for local development.
The short path — six commands from clone to running app — is in the
[README](../../README.md#running-locally).

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| npm | 10+ | bundled with Node |
| Python | 3.12+ | [python.org](https://python.org) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker Desktop | latest | [docker.com](https://docker.com) |

---

## Environment files

Three files, all copied from a committed `.env.example`. None of them are tracked;
all committed examples contain placeholders only.

```bash
cp .env.example        .env            # Docker Compose + shared defaults
cp apps/api/.env.example  apps/api/.env    # FastAPI runtime
cp apps/mobile/.env.example apps/mobile/.env  # Expo runtime
```

On PowerShell use `Copy-Item .env.example .env` and so on.

### `.env` (root) — Compose and shared defaults

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `protin` | Compose database credentials |
| `POSTGRES_PORT` | `5432` | host port for PostgreSQL |
| `REDIS_PORT` | `6379` | host port for Redis |
| `APP_ENV` | `local` | `local` \| `staging` \| `production`; reported by `/health` |
| `API_HOST` / `API_PORT` | `0.0.0.0` / `8000` | uvicorn bind address |
| `LOG_LEVEL` | `info` | API and worker log level |
| `POSTGRES_URL` | `postgresql://protin:protin@localhost:5432/protin` | used by the API and Alembic |
| `REDIS_URL` | `redis://localhost:6379/0` | used by the API |
| `SECRET_KEY` | placeholder | JWT signing key — **must** be replaced with a real random value outside local |
| `WORKER_POLL_INTERVAL_SECONDS` | `60` | notification worker poll cadence |

### `apps/api/.env` — API runtime

Everything above that the FastAPI process needs, plus the integration keys.

**Optional integrations.** Leaving one empty switches that feature off rather than
breaking the app, which is what CI and the App Store reviewer environment rely on:

| Variable | Empty means |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google Calendar export disabled |
| `GOOGLE_PLACES_API_KEY` | venue discovery falls back to the seeded Sydney catalogue, no HTTP call made |
| `APPLE_CLIENT_ID` | Apple Sign-In endpoint disabled |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Apple token revocation on account deletion is skipped |
| `EXPO_PUSH_URL` | **Defaults to the live Expo endpoint**, so omitting it attempts real delivery. Set it explicitly to an empty value to disable sending — events are then still scheduled and stored, but each delivery attempt returns failure and is recorded as failed. |

**Deployment and upload limits.** These have working defaults; override only when the
deployment shape demands it:

| Variable | Default | Purpose |
|---|---|---|
| `TRUSTED_PROXY_CIDRS` | `127.0.0.1/32,::1/128` | Networks whose direct peers may supply client-IP headers for rate limiting. Forwarded headers are honoured **only** when the immediate peer is inside one of these networks, and the chain is walked right-to-left so a client-supplied leftmost value cannot spoof its rate-limit identity. Never set a wildcard. |
| `MEDIA_MAX_FILE_BYTES` | 5 MB | Per-file profile-photo upload ceiling |
| `MEDIA_MAX_TOTAL_BYTES` | 16 MB | Total per-user media ceiling |
| `MEDIA_MAX_DIMENSION` | 6000 | Max pixel dimension per side |
| `MEDIA_MAX_PIXELS` | 20,000,000 | Max total pixels (decompression-bomb guard) |

**Required outside `local`.** These three carry startup guards in a protected
environment rather than degrading quietly. Validation is centralised in
`app/core/protected_config.py` and runs from application startup and from the deployment
preflight:

| Variable | Behaviour when unset or weak |
|---|---|
| `SECRET_KEY` | Locally: a startup warning only. In `staging` / `production`: startup **fails** unless the value is at least 32 characters, contains no placeholder marker (`change-me`, `example`, `placeholder`, `<...>`, …) and uses at least 8 distinct characters. This closed audit finding **C1**. |
| `FIELD_ENCRYPTION_KEY` | Locally: OAuth tokens are stored with a `plain:` sentinel prefix. In `staging` / `production`: startup fails unless the value parses as a real Fernet key — staging database dumps are retained as backups and would otherwise contain readable tokens. |
| `INTERNAL_API_TOKEN` | Locally: `/internal/*` is reachable without a shared secret. In `staging` / `production`: startup fails unless it meets the same strength rules as `SECRET_KEY`, rather than expose an unauthenticated notification fan-out trigger. |

Generate the secrets with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"                          # SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # FIELD_ENCRYPTION_KEY
```

### `apps/mobile/.env` — Expo runtime

The `EXPO_PUBLIC_` prefix is required by Expo to expose a variable to the JS bundle.
Everything here ends up in the shipped bundle, so **never put a secret in this file**.

| Variable | Default |
|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8000` |
| `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` | the API's Calendar callback URL |
| `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_SUPPORT_URL` | public legal pages opened from the profile screen |

---

## Health verification

```bash
npm run infra:ps                                  # both services: "Up (healthy)"
docker compose exec postgres pg_isready -U protin # accepting connections
docker compose exec redis redis-cli ping          # PONG

curl http://localhost:8000/health
```

A healthy API returns `200` with every entry under `checks` set to `"ok"`:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "local",
  "uptime_seconds": 12,
  "checks": { "db": "ok", "redis": "ok" }
}
```

If any dependency is unreachable the endpoint returns `503` with
`"status": "degraded"` and the failing check set to `"error"` — the process is up but
cannot reach that dependency.

Interactive API docs: `http://localhost:8000/docs`.

---

## Troubleshooting

**Ports 5432 or 6379 already in use.** Set `POSTGRES_PORT` / `REDIS_PORT` in `.env` to
free ports, update `POSTGRES_URL` and `REDIS_URL` to match, then
`npm run infra:reset` and re-run migrations.

**`/health` reports `"db": "error"`.** Confirm `npm run infra:ps` shows postgres healthy,
then confirm `POSTGRES_URL` in `apps/api/.env` matches the credentials in `.env`. If you
ran `infra:reset`, the volumes were wiped — re-run `uv run alembic upgrade head`.

**`/health` reports `"redis": "error"`.** Confirm Redis is healthy and that `REDIS_URL`
matches `REDIS_PORT`.

**Migrations fail with `Connection refused`.** PostgreSQL has not finished starting.
Wait for `Up (healthy)` in `npm run infra:ps` and retry.

**API refuses to start with an encryption error.** `FIELD_ENCRYPTION_KEY` is empty while
`APP_ENV` is `staging` or `production`. This guard is deliberate — staging database dumps
are retained as backups and would otherwise contain readable OAuth tokens. Either set the
key or set `APP_ENV=local`.

**`eslint: command not found` or similar.** Run `npm ci` from the repository root; the
mobile workspace resolves its binaries from the root `node_modules`.

**`uv` not found.**

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh                                    # bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex" # PowerShell
```

---

## Stopping and resetting

```bash
npm run infra:down    # stop services, keep data volumes
npm run infra:reset   # wipe volumes and restart — re-run migrations afterwards
```
