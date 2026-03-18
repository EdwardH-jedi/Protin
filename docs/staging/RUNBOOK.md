# Protin Staging — Operational Runbook

Day-to-day operations on the RX6600 staging server.

All commands assume you are in `/opt/protin` (the repo root) on the server.

Shorthand used throughout:
```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.staging.yml"
```

---

## Starting and stopping

```bash
# Start all services
$COMPOSE up -d

# Stop all services (data volumes preserved)
$COMPOSE stop

# Remove containers (data volumes preserved)
$COMPOSE down

# Full teardown including volumes — destroys all data
$COMPOSE down -v
```

---

## Deploying a code update

```bash
git pull
bash infra/scripts/deploy.sh --build
```

The script rebuilds images, runs migrations, then performs a rolling restart of api + worker + nginx. It will not restart if the health check fails.

If you only changed environment variables (no code changes):
```bash
bash infra/scripts/deploy.sh
```

---

## Viewing logs

```bash
# All services, follow
$COMPOSE logs -f

# API only
$COMPOSE logs -f api

# Worker only
$COMPOSE logs -f worker

# Last 100 lines, no follow
$COMPOSE logs --tail=100 api
```

---

## Running database migrations manually

```bash
$COMPOSE run --rm migrate
```

Migrations run automatically during `deploy.sh`. Run manually only if you need to apply them without a full deploy (e.g. after a restore).

---

## Health check

```bash
# Quick check
curl http://localhost/health

# With formatted output
curl -s http://localhost/health | python3 -m json.tool
```

A healthy response:
```json
{"status": "ok", "version": "0.1.0", "uptime_seconds": 3600.1, "checks": {"database": "ok", "redis": "ok"}}
```

`"status": "degraded"` means at least one dependency (postgres or redis) is unreachable.

---

## Database backup

```bash
bash infra/scripts/backup.sh
```

Backup files are saved to `infra/backups/protin_YYYYMMDDTHHMMSSZ.dump`.

**Recommended:** Schedule a daily backup via cron on the server:
```
0 2 * * * cd /opt/protin && bash infra/scripts/backup.sh >> /var/log/protin-backup.log 2>&1
```

List existing backups:
```bash
ls -lh infra/backups/*.dump
```

Old backups must be deleted manually — there is no automatic retention policy.

---

## Database restore

> **Warning:** This destroys all current data. Stop the API and worker first.

```bash
# Stop API and worker (keep postgres running)
$COMPOSE stop api worker

# Restore
bash infra/scripts/restore.sh infra/backups/protin_20260318T020000Z.dump

# Run migrations to ensure schema is current
$COMPOSE run --rm migrate

# Restart
$COMPOSE start api worker
```

---

## Restarting individual services

```bash
$COMPOSE restart api
$COMPOSE restart worker
$COMPOSE restart nginx
$COMPOSE restart postgres   # will cause brief downtime for api/worker
```

---

## Checking service status

```bash
$COMPOSE ps
```

All services should show `healthy` or `running`. The `migrate` service is one-shot and shows `exited (0)` after a successful run.

---

## Worker troubleshooting

The worker polls for pending notification events every 60 seconds (configurable via `WORKER_POLL_INTERVAL_SECONDS`).

If notifications are not being delivered:
1. Check worker logs: `$COMPOSE logs -f worker`
2. Verify `EXPO_PUBLIC_API_URL` is reachable from the test device
3. Verify the Expo push token was registered (`POST /notifications/token` on login)
4. Check the `notification_events` table in postgres:
   ```bash
   $COMPOSE exec postgres psql -U protin -d protin \
     -c "SELECT id, notification_type, scheduled_at, sent_at, failed_reason FROM notification_events ORDER BY scheduled_at DESC LIMIT 20;"
   ```

---

## Accessing the database directly

```bash
$COMPOSE exec postgres psql -U protin -d protin
```

---

## Nginx

Configuration lives at `infra/nginx/nginx.conf`. After editing:
```bash
$COMPOSE exec nginx nginx -t          # test config
$COMPOSE exec nginx nginx -s reload   # reload without downtime
```

---

## Disk usage

```bash
# Docker volumes
docker system df

# Backup directory
du -sh infra/backups/

# Prune unused Docker images (safe — only removes untagged/dangling images)
docker image prune -f
```

---

## Rollback

If a deploy breaks the API:

```bash
# 1. Check what's wrong
$COMPOSE logs --tail=50 api

# 2. If code change is the problem — revert and rebuild
git revert HEAD --no-edit
bash infra/scripts/deploy.sh --build

# 3. If env/config change is the problem — edit .env.staging and restart
nano .env.staging
$COMPOSE up -d api worker
$COMPOSE logs -f api

# 4. If database migration caused data loss — restore from backup
$COMPOSE stop api worker
bash infra/scripts/restore.sh infra/backups/<latest>.dump
$COMPOSE run --rm migrate
$COMPOSE start api worker
```

---

## First-time setup summary

Quick reference for setting up a new server from scratch:

```bash
# 1. Install Docker (Ubuntu)
bash infra/scripts/setup-server.sh
# Log out and back in after this step

# 2. Clone the repo
git clone <repo-url> /opt/protin
cd /opt/protin

# 3. Configure staging environment
cp .env.staging.example .env.staging
nano .env.staging  # fill in all placeholders

# 4. Deploy
bash infra/scripts/deploy.sh --build

# 5. Verify
curl http://localhost/health
```

See SETUP.md for the full walkthrough.
