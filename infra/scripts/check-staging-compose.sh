#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

STAGING_ENV_FILE=.env.staging.example docker compose \
  --env-file .env.staging.example \
  -f docker-compose.yml \
  -f docker-compose.staging.yml \
  config --format json | python3 infra/scripts/check-staging-compose.py
