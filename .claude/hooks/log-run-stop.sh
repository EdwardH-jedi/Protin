#!/usr/bin/env bash
# Stop hook — append the recap + git diff stat to the current session's run
# file. Pairs with .claude/hooks/log-run-prompt.sh; see runs/README.md.
#
# Opt-out: CLAUDE_SKIP_RUN_LOG=1 in the environment.
#
# Contract: always exit 0 with empty stdout. This hook must never block
# Claude from stopping.

set -uo pipefail

[ "${CLAUDE_SKIP_RUN_LOG:-0}" = "1" ] && exit 0

INPUT="$(cat)"

have() { command -v "$1" >/dev/null 2>&1; }
is_true() { [ "${1:-false}" = "true" ]; }

if ! have jq; then
  echo "[log-run-stop] jq not installed; skipping run log" >&2
  exit 0
fi

json_get() { printf '%s' "$INPUT" | jq -r ".${1} // empty"; }

# Infinite-loop guard: when a prior Stop hook blocks, Claude re-enters the
# turn and fires Stop again with stop_hook_active=true. Bail to avoid
# double-logging the same recap.
STOP_ACTIVE=$(json_get stop_hook_active)
if is_true "$STOP_ACTIVE"; then exit 0; fi

SESSION_ID=$(json_get session_id)
TRANSCRIPT=$(json_get transcript_path)

[ -z "$SESSION_ID" ] && exit 0

STATE_DIR=".claude/tmp/runs"
PATH_FILE="$STATE_DIR/${SESSION_ID}.path"

# No prompt was ever logged for this session (hook added mid-session, or
# opt-out flag was flipped) — nothing to append to.
[ -f "$PATH_FILE" ] || exit 0
RUN_FILE=$(cat "$PATH_FILE" 2>/dev/null || true)
[ -n "$RUN_FILE" ] || exit 0
[ -f "$RUN_FILE" ] || exit 0

# Extract the last assistant message's text blocks from the transcript JSONL.
# Content is usually an array of {type: "text"|"tool_use"|...}; we join all
# text blocks of the last assistant turn.
RECAP=""
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  RECAP=$(jq -rs '
    map(select(.type == "assistant"))
    | if length == 0 then "" else
        (last.message.content
         | if type == "array"
           then (map(select(.type == "text")) | map(.text) | join("\n\n"))
           else (. | tostring)
           end)
      end
  ' "$TRANSCRIPT" 2>/dev/null || printf '')
fi

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo detached)
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nohead)
DIFF_STAT=$({
  git diff --stat HEAD 2>/dev/null || true
  git diff --cached --stat 2>/dev/null || true
} | head -n 60)
[ -z "$DIFF_STAT" ] && DIFF_STAT="(no uncommitted changes vs HEAD)"

STAMP=$(date +%FT%T%z)

{
  printf '\n### Recap — %s\n\n' "$STAMP"
  if [ -n "$RECAP" ]; then
    # Recap is already markdown; render as-is. No fence collision risk.
    printf '%s\n' "$RECAP"
  else
    printf '_(no assistant text captured)_\n'
  fi
  printf '\n### Git — branch `%s` @ `%s`\n\n' "$BRANCH" "$SHA"
  printf '~~~text\n'
  printf '%s\n' "$DIFF_STAT"
  printf '~~~\n'
} >> "$RUN_FILE" || exit 0

printf '%s' "$RUN_FILE" > runs/LATEST 2>/dev/null || true

exit 0
