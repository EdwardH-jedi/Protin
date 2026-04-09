#!/usr/bin/env bash
# install-cron.sh — install a crontab entry to run cron-health-check.sh every 5 minutes.
#
# Usage:
#   bash infra/scripts/install-cron.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_ENTRY="*/5 * * * * bash ${SCRIPT_DIR}/cron-health-check.sh"

echo "Crontab entry to be added:"
echo ""
echo "  ${CRON_ENTRY}"
echo ""
printf "Install this entry? [y/N] "
read -r answer

if [[ "${answer}" != "y" && "${answer}" != "Y" ]]; then
    echo "Aborted — no changes made."
    exit 0
fi

(crontab -l 2>/dev/null | grep -v "cron-health-check"; echo "${CRON_ENTRY}") | crontab -

echo "Crontab entry installed."
