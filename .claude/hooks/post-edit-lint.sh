#!/usr/bin/env bash
set -euo pipefail

# post-edit-lint.sh — Protin harness post-edit lint hook
# Registered as: PostToolUse + Edit matcher
# Receives the edited file path as $1

FILE="${1:-}"

if [ -z "$FILE" ]; then
  exit 0
fi

# ─── Python: ruff on the changed file ────────────────────────────────────────
if [[ "$FILE" == *.py ]]; then
  if command -v ruff &>/dev/null; then
    echo "▶ post-edit: ruff check $FILE"
    ruff check "$FILE" || true
  fi
fi

# ─── TypeScript: full project typecheck ──────────────────────────────────────
if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
  if [ -d "apps/mobile" ]; then
    echo "▶ post-edit: tsc --noEmit (apps/mobile)"
    (cd apps/mobile && npx tsc --noEmit) || true
  fi
fi

exit 0
