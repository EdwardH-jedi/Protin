#!/usr/bin/env bash
# install-systemd-timer.sh — install the sportsgang-healthcheck systemd timer.
#
# Alternative to infra/scripts/install-cron.sh for hosts running systemd.
# Both paths invoke the same cron-health-check.sh wrapper, so pick ONE —
# do not install both or the health check runs twice every 5 minutes.
#
# Usage (as root on the staging/production host):
#   sudo bash infra/scripts/install-systemd-timer.sh
#
# Assumes the repository is checked out at /opt/sportsgang. If it lives
# elsewhere, edit WorkingDirectory / ExecStart in the .service unit (or
# add a systemd drop-in) before enabling the timer.

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must run as root (systemd unit install)." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="${SCRIPT_DIR}/../systemd"
TARGET_DIR="/etc/systemd/system"

SERVICE="sportsgang-healthcheck.service"
TIMER="sportsgang-healthcheck.timer"

echo "Installing ${SERVICE} and ${TIMER} into ${TARGET_DIR}..."
install -m 0644 "${UNIT_DIR}/${SERVICE}" "${TARGET_DIR}/${SERVICE}"
install -m 0644 "${UNIT_DIR}/${TIMER}"   "${TARGET_DIR}/${TIMER}"

systemctl daemon-reload
systemctl enable --now "${TIMER}"

echo ""
echo "Installed. Timer status:"
systemctl status --no-pager "${TIMER}" || true

echo ""
echo "Next scheduled runs:"
systemctl list-timers --no-pager "${TIMER}" || true

echo ""
echo "Logs: journalctl -u ${SERVICE} -f"
