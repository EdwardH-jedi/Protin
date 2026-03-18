#!/usr/bin/env bash
# setup-server.sh — First-time Docker Engine setup for Ubuntu 22.04+
#
# Usage:
#   sudo bash infra/scripts/setup-server.sh
#
# What it does:
#   - Installs Docker Engine and Docker Compose v2 via the official apt repo
#   - Adds the invoking user to the docker group
#
# Run once on a fresh staging server. Reboot or log out/in after completion.

set -euo pipefail

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  echo "Error: run this script with sudo or as root." >&2
  exit 1
fi

# ── Install Docker Engine ──────────────────────────────────────────────────────
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# ── Add user to docker group ───────────────────────────────────────────────────
TARGET_USER="${SUDO_USER:-$USER}"
usermod -aG docker "$TARGET_USER"
echo "User '$TARGET_USER' added to the docker group."
echo "IMPORTANT: log out and back in (or run: newgrp docker) for this to take effect."

# ── Verify ────────────────────────────────────────────────────────────────────
docker --version
docker compose version
