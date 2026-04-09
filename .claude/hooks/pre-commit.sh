#!/usr/bin/env bash
set -euo pipefail

# pre-commit.sh — Protin harness pre-commit hook
# Registered as: PreToolUse + Bash matcher on "git commit"
# Exits 0 immediately for any non-commit command.

# ─── Guard: only run on git commit ───────────────────────────────────────────
FULL_CMD="${*:-}"
if ! echo "$FULL_CMD" | grep -qE '^git commit'; then
  exit 0
fi

echo "▶ pre-commit: starting checks…"

# ─── 1. Block direct commits to main/master ──────────────────────────────────
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo '{"decision":"block","reason":"Direct commits to main/master are not allowed. Use a feature branch and open a PR."}'
  exit 1
fi

# ─── 2. Python lint (apps/api) ───────────────────────────────────────────────
if [ -d "apps/api" ]; then
  echo "▶ ruff check…"
  (cd apps/api && ruff check . && ruff format --check .) || {
    echo '{"decision":"block","reason":"Python lint failed. Run: cd apps/api && ruff check . && ruff format ."}'
    exit 1
  }
fi

# ─── 3. TypeScript typecheck (apps/mobile) ───────────────────────────────────
if [ -d "apps/mobile" ]; then
  echo "▶ tsc --noEmit…"
  (cd apps/mobile && npx tsc --noEmit) || {
    echo '{"decision":"block","reason":"TypeScript typecheck failed. Run: cd apps/mobile && npx tsc --noEmit"}'
    exit 1
  }
fi

# ─── 4. Secret scan (staged files) ───────────────────────────────────────────
echo "▶ secret scan…"
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
if [ -n "$STAGED" ]; then
  if git diff --cached | grep -qiE '(password|secret|api_key|token)\s*=\s*["\x27][^"\x27]{8,}'; then
    echo '{"decision":"block","reason":"Possible secret detected in staged changes. Remove credentials before committing."}'
    exit 1
  fi
fi

# ─── 5. Conventional Commits format ──────────────────────────────────────────
MSG_FLAG=false
MSG=""
for arg in "$@"; do
  if $MSG_FLAG; then
    MSG="$arg"
    break
  fi
  if [[ "$arg" == "-m" || "$arg" == "--message" ]]; then
    MSG_FLAG=true
  fi
done

if [ -n "$MSG" ]; then
  if ! echo "$MSG" | grep -qE '^(feat|fix|chore|docs|refactor|test|perf|ci)(\(.+\))?!?: .+'; then
    echo '{"decision":"block","reason":"Commit message must follow Conventional Commits: feat|fix|chore|docs|refactor|test|perf|ci: <description>"}'
    exit 1
  fi
fi

echo "▶ pre-commit: all checks passed."
exit 0
