#!/usr/bin/env bash
# =============================================================================
# Protin — PostgreSQL restore script
#
# Restores a pg_dump backup file into the running staging database.
#
# Usage:
#   bash infra/scripts/restore.sh infra/backups/protin_20260318T020000Z.dump
#
# WARNING: This will DROP and recreate the database. All current data
# will be lost. Stop the API and worker before restoring.
#
#   docker compose -f docker-compose.yml -f docker-compose.staging.yml stop api worker
#   bash infra/scripts/restore.sh <backup_file>
#   docker compose -f docker-compose.yml -f docker-compose.staging.yml start api worker
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml"
COMPOSE="docker compose $COMPOSE_FILES"

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
    echo "Usage: bash infra/scripts/restore.sh <backup_file.dump>"
    echo ""
    echo "Available backups:"
    ls -lt "$REPO_ROOT/infra/backups/"*.dump 2>/dev/null || echo "  (none)"
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [[ ! -f "$REPO_ROOT/.env.staging" ]]; then
    echo "ERROR: .env.staging not found at $REPO_ROOT"
    exit 1
fi

POSTGRES_USER=$(grep '^POSTGRES_USER=' "$REPO_ROOT/.env.staging" | cut -d= -f2)
POSTGRES_DB=$(grep '^POSTGRES_DB=' "$REPO_ROOT/.env.staging" | cut -d= -f2)

echo "==> Restoring from: $BACKUP_FILE"
echo "    Target database: ${POSTGRES_DB}"
echo ""
read -r -p "This will DESTROY all current data. Continue? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
    echo "Aborted."
    exit 0
fi

cd "$REPO_ROOT"

echo "==> Dropping and recreating database…"
$COMPOSE exec -T postgres \
    psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\";"
$COMPOSE exec -T postgres \
    psql -U "$POSTGRES_USER" -c "CREATE DATABASE \"${POSTGRES_DB}\";"

echo "==> Restoring data…"
$COMPOSE exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
    < "$BACKUP_FILE"

echo "✓ Restore complete."
echo ""
echo "Run migrations to ensure schema is current:"
echo "  docker compose $COMPOSE_FILES run --rm migrate"
