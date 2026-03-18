#!/usr/bin/env bash
# =============================================================================
# Protin — PostgreSQL backup script
#
# Creates a compressed pg_dump of the staging database and saves it to
# infra/backups/ with a timestamp in the filename.
#
# Usage:
#   bash infra/scripts/backup.sh
#
# Scheduling (cron example — daily at 2 AM):
#   0 2 * * * cd /path/to/protin && bash infra/scripts/backup.sh >> /var/log/protin-backup.log 2>&1
#
# Retention: manually delete old backups from infra/backups/ as needed.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="$REPO_ROOT/infra/backups"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml"
COMPOSE="docker compose $COMPOSE_FILES"

mkdir -p "$BACKUP_DIR"

# Load staging env to get DB credentials
if [[ ! -f "$REPO_ROOT/.env.staging" ]]; then
    echo "ERROR: .env.staging not found at $REPO_ROOT"
    exit 1
fi

# Extract DB connection details from .env.staging
POSTGRES_USER=$(grep '^POSTGRES_USER=' "$REPO_ROOT/.env.staging" | cut -d= -f2)
POSTGRES_DB=$(grep '^POSTGRES_DB=' "$REPO_ROOT/.env.staging" | cut -d= -f2)

TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
BACKUP_FILE="$BACKUP_DIR/protin_${TIMESTAMP}.dump"

echo "==> Backing up database '${POSTGRES_DB}' to ${BACKUP_FILE}…"

cd "$REPO_ROOT"

$COMPOSE exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
    > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "✓ Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# List last 10 backups
echo ""
echo "Recent backups (newest first):"
ls -lt "$BACKUP_DIR"/*.dump 2>/dev/null | head -10 || echo "  (none)"
