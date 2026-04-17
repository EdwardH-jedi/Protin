#!/usr/bin/env bash
# UserPromptSubmit hook — capture each prompt into a per-session run file
# under runs/YYYY-MM-DD/. See runs/README.md for the full contract.
#
# Opt-out: CLAUDE_SKIP_RUN_LOG=1 in the environment.
#
# Contract: always exit 0 with empty stdout. This hook must never block
# Claude and must never stop Claude from processing the prompt.

set -uo pipefail

[ "${CLAUDE_SKIP_RUN_LOG:-0}" = "1" ] && exit 0

INPUT="$(cat)"

have() { command -v "$1" >/dev/null 2>&1; }

# jq is required to pull fields out of the hook payload. If it is missing we
# log nothing rather than trying to regex-parse JSON (brittle for prompt text).
if ! have jq; then
  echo "[log-run-prompt] jq not installed; skipping run log" >&2
  exit 0
fi

json_get() { printf '%s' "$INPUT" | jq -r ".${1} // empty"; }

SESSION_ID=$(json_get session_id)
PROMPT=$(json_get prompt)
TRANSCRIPT=$(json_get transcript_path)

[ -z "$SESSION_ID" ] && exit 0
[ -z "$PROMPT" ] && exit 0

STATE_DIR=".claude/tmp/runs"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

PATH_FILE="$STATE_DIR/${SESSION_ID}.path"
TURN_FILE="$STATE_DIR/${SESSION_ID}.turn"

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo detached)
SAFE_BRANCH="${BRANCH//\//_}"
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nohead)
DATE=$(date +%F)
TS=$(date +%H%M%S)
STAMP=$(date +%FT%T%z)
SESS8="${SESSION_ID:0:8}"

if [ -f "$PATH_FILE" ]; then
  RUN_FILE=$(cat "$PATH_FILE" 2>/dev/null || true)
  if [ -z "$RUN_FILE" ] || [ ! -f "$RUN_FILE" ]; then
    # State file exists but target is gone — start fresh.
    RUN_FILE=""
  fi
else
  RUN_FILE=""
fi

if [ -z "$RUN_FILE" ]; then
  RUN_DIR="runs/$DATE"
  mkdir -p "$RUN_DIR" 2>/dev/null || exit 0
  RUN_FILE="${RUN_DIR}/${TS}_${SAFE_BRANCH}_${SESS8}.md"
  TURN=1
  {
    printf '# Claude run %s — %s\n\n' "$STAMP" "$BRANCH"
    printf -- '- Branch: `%s`\n' "$BRANCH"
    printf -- '- Commit: `%s`\n' "$SHA"
    printf -- '- Session: `%s`\n' "$SESSION_ID"
    printf -- '- CWD: `%s`\n' "$(pwd)"
    if [ -n "$TRANSCRIPT" ]; then
      printf -- '- Transcript: `%s`\n' "$TRANSCRIPT"
    fi
  } > "$RUN_FILE" || exit 0
  printf '%s' "$RUN_FILE" > "$PATH_FILE"
else
  TURN=$(( $(cat "$TURN_FILE" 2>/dev/null || echo 0) + 1 ))
fi

printf '%s' "$TURN" > "$TURN_FILE"

# Use tilde fences for the prompt so triple-backtick content survives intact.
{
  printf '\n## Turn %s — %s\n\n' "$TURN" "$STAMP"
  printf '### Prompt\n\n'
  printf '~~~text\n'
  printf '%s\n' "$PROMPT"
  printf '~~~\n'
} >> "$RUN_FILE" || exit 0

printf '%s' "$RUN_FILE" > runs/LATEST 2>/dev/null || true

exit 0
