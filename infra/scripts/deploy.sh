#!/usr/bin/env bash
# =============================================================================
# Protin — staging deployment script
#
# Runs on the RX6600 server. Assumes:
#   - Docker and docker compose v2 are installed
#   - .env.staging is present at the repo root (copied from .env.staging.example)
#   - The repo is checked out at the path where this script lives
#
# Usage:
#   cd /path/to/protin
#   bash infra/scripts/deploy.sh
#
# To force rebuild of images (e.g. after code changes):
#   bash infra/scripts/deploy.sh --build
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml"
COMPOSE="docker compose $COMPOSE_FILES"

BUILD_FLAG=""
if [[ "${1:-}" == "--build" ]]; then
    BUILD_FLAG="--build"
fi

echo "==> Protin staging deploy — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "    Repo root: $REPO_ROOT"
cd "$REPO_ROOT"

# ── Preflight checks ─────────────────────────────────────────────────────────
if [[ ! -f .env.staging ]]; then
    echo "ERROR: .env.staging not found."
    echo "       Copy .env.staging.example to .env.staging and fill in values."
    exit 1
fi

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker not found on PATH."
    exit 1
fi

# ── Pull / build images ───────────────────────────────────────────────────────
echo "==> Pulling base images…"
$COMPOSE pull postgres redis nginx 2>/dev/null || true

if [[ -n "$BUILD_FLAG" ]]; then
    echo "==> Building API image…"
    $COMPOSE build api worker migrate
fi

# ── Start infrastructure ──────────────────────────────────────────────────────
echo "==> Starting postgres and redis…"
$COMPOSE up -d postgres redis

echo "==> Waiting for postgres to be healthy…"
timeout 60 bash -c "until $COMPOSE exec -T postgres pg_isready -U \"\$(grep POSTGRES_USER .env.staging | cut -d= -f2)\" >/dev/null 2>&1; do sleep 2; done"

# ── Run migrations ────────────────────────────────────────────────────────────
echo "==> Running database migrations…"
$COMPOSE run --rm migrate

# ── Start API and worker ──────────────────────────────────────────────────────
echo "==> Starting API, worker, and nginx…"
$COMPOSE up -d $BUILD_FLAG api worker nginx

# ── Health check ─────────────────────────────────────────────────────────────
echo "==> Waiting for API to become healthy…"
timeout 60 bash -c "until curl -sf http://localhost/health >/dev/null 2>&1; do sleep 3; done"

echo ""
echo "✓ Deployment complete."
echo "  API health: $(curl -s http://localhost/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[\"status\"])')"
echo ""
echo "  To tail logs:  docker compose $COMPOSE_FILES logs -f api worker"
echo "  To stop:       docker compose $COMPOSE_FILES down"
