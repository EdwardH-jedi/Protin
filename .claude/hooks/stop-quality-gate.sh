#!/usr/bin/env bash
# Stop-hook quality gate.
#
# Reads the Claude Code Stop-hook JSON payload from stdin and runs lightweight
# checks against the current uncommitted diff. If anything fails, it emits a
# structured JSON decision on stdout asking Claude to keep working on the
# listed issues.
#
# Exit-code contract (Claude Code Stop hook):
#   exit 0 + empty stdout        -> allow Claude to stop
#   exit 0 + {"decision":"block",...} on stdout  -> Claude must continue
#
# Infinite-loop guard: honors stop_hook_active from the stdin JSON.

set -uo pipefail

INPUT="$(cat)"

have() { command -v "$1" >/dev/null 2>&1; }
is_true() { [ "${1:-false}" = "true" ]; }

json_get() {
  # json_get <top-level-key>
  local key="$1"
  if have jq; then
    printf '%s' "$INPUT" | jq -r ".${key} // empty"
  else
    printf '%s' "$INPUT" \
      | grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*(true|false|\"[^\"]*\")" \
      | head -1 \
      | sed -E 's/.*:[[:space:]]*//; s/^"//; s/"$//'
  fi
}

# 1. Prevent infinite Stop-hook loops.
STOP_ACTIVE="$(json_get stop_hook_active)"
if is_true "$STOP_ACTIVE"; then
  exit 0
fi

# 2. Collect changed files (staged + unstaged vs HEAD).
changed_files() {
  {
    git diff --name-only HEAD 2>/dev/null || true
    git diff --cached --name-only 2>/dev/null || true
  } | sort -u
}

PY_CHANGED="$(changed_files | grep -E '^apps/api/.*\.py$' || true)"
TS_CHANGED="$(changed_files | grep -E '^apps/mobile/.*\.(ts|tsx)$' || true)"

ISSUES=()

# 3. Python lint (apps/api) — only when Python files changed.
if [ -n "$PY_CHANGED" ] && [ -d apps/api ]; then
  if have ruff; then
    if ! (cd apps/api && ruff check . >/tmp/protin-ruff.out 2>&1); then
      TAIL=$(tail -n 5 /tmp/protin-ruff.out | tr '\n' ' ')
      ISSUES+=("ruff check failed in apps/api: ${TAIL}")
    fi
  else
    echo "[stop-quality-gate] ruff not installed; skipping Python lint" >&2
  fi
fi

# 4. TypeScript typecheck (apps/mobile) — only when TS files changed.
if [ -n "$TS_CHANGED" ] && [ -d apps/mobile ] && [ -f apps/mobile/package.json ]; then
  if have npx; then
    if ! (cd apps/mobile && npx --no-install tsc --noEmit >/tmp/protin-tsc.out 2>&1); then
      TAIL=$(tail -n 5 /tmp/protin-tsc.out | tr '\n' ' ')
      ISSUES+=("mobile tsc --noEmit failed: ${TAIL}")
    fi
  else
    echo "[stop-quality-gate] npx not installed; skipping TS typecheck" >&2
  fi
fi

# 5. Secret scan across all uncommitted diff content.
SECRET_PATTERN='(password|secret|api[_-]?key|access[_-]?token|private[_-]?key)[[:space:]]*[=:][[:space:]]*["'"'"'][^"'"'"' ]{12,}'
if { git diff HEAD 2>/dev/null; git diff --cached 2>/dev/null; } \
     | grep -iE "$SECRET_PATTERN" >/dev/null 2>&1; then
  ISSUES+=("possible secret literal in uncommitted diff — remove credentials before stopping")
fi

# 6. Pass-through: nothing flagged.
if [ ${#ISSUES[@]} -eq 0 ]; then
  exit 0
fi

# 7. Build a multi-line reason and emit structured JSON.
REASON="Stop blocked by quality gate:"
for i in "${ISSUES[@]}"; do
  REASON="${REASON}"$'\n'"- ${i}"
done

if have jq; then
  jq -n --arg r "$REASON" '{decision:"block", reason:$r}'
else
  # Minimal JSON escape fallback: backslashes, quotes, newlines.
  ESC=$(printf '%s' "$REASON" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | awk 'BEGIN{ORS="\\n"} {print}' \
    | sed 's/\\n$//')
  printf '{"decision":"block","reason":"%s"}\n' "$ESC"
fi
exit 0
