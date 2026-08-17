#!/usr/bin/env bash
# cron-health-check.sh — wrapper around health-check.sh for cron execution.
#
# Runs the health check and, on failure, appends a timestamped entry to
# /var/log/sportsgang/health-failures.log. Always exits 0 so cron does not
# send root mail on transient failures.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/sportsgang"
LOG_FILE="${LOG_DIR}/health-failures.log"

mkdir -p "${LOG_DIR}"

if ! bash "${SCRIPT_DIR}/health-check.sh"; then
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') health-check FAILED" >> "${LOG_FILE}"
fi

exit 0
