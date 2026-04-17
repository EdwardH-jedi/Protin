#!/usr/bin/env bash
# Stop-hook Codex diff review.
#
# Runs `codex exec` against the current uncommitted diff, saves a Markdown
# report under reviews/, and only blocks Claude from stopping when the review
# Verdict is BLOCK. Missing codex/jq is a graceful skip.
#
# Opt-out: set CLAUDE_SKIP_CODEX_REVIEW=1 in the environment.

set -uo pipefail

INPUT="$(cat)"

have() { command -v "$1" >/dev/null 2>&1; }
is_true() { [ "${1:-false}" = "true" ]; }

json_get() {
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

# 1. Infinite-loop guard.
STOP_ACTIVE="$(json_get stop_hook_active)"
if is_true "$STOP_ACTIVE"; then
  exit 0
fi

# 2. Per-session opt-out.
if [ "${CLAUDE_SKIP_CODEX_REVIEW:-0}" = "1" ]; then
  exit 0
fi

# 3. Graceful skip if codex CLI is missing.
if ! have codex; then
  echo "[codex-review] codex CLI not installed; skipping review" >&2
  exit 0
fi

# 4. Collect diff; skip if empty or trivial.
DIFF="$(git diff HEAD 2>/dev/null; git diff --cached 2>/dev/null)"
if [ -z "$DIFF" ]; then
  exit 0
fi
CHANGED_LINES=$(printf '%s' "$DIFF" | grep -cE '^[+-][^+-]' || true)
if [ "${CHANGED_LINES:-0}" -lt 5 ]; then
  # Don't burn a review call on tiny whitespace-only or near-empty diffs.
  exit 0
fi

# 5. Prepare report path.
mkdir -p reviews
TS=$(date +%Y%m%d-%H%M%S)
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo detached)
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nohead)
REPORT="reviews/codex-review-${TS}-${BRANCH//\//_}.md"

# 6. Review prompt — correctness-first, no nitpicks.
read -r -d '' PROMPT <<'PROMPT_EOF' || true
You are an independent senior reviewer. Review the staged/unstaged diff below.

Priorities (in order; higher priority first):
1. Correctness — does the code actually do what it claims? Any obvious bugs?
2. Regressions — could this break existing callers, tests, migrations, or
   API / shared-types contracts?
3. Security — secrets, authz, input validation, unsafe deserialization,
   data exposure, crypto misuse.
4. Maintainability — control flow, naming at boundaries, duplication,
   error handling at system edges.
5. Scope drift — changes unrelated to the stated task.

Skip nitpicks (formatting, minor naming, docstring wording) UNLESS they block
safe merging.

Required output format (Markdown, exactly these headings):

## Verdict
One of: APPROVE | APPROVE_WITH_COMMENTS | REQUEST_CHANGES | BLOCK

## Critical (must-fix before merge)
- bullet list, or "None."

## Important (should address)
- bullet list, or "None."

## Notes
- optional bullets, or "None."

Use BLOCK only for correctness, regression, or security issues that would
actually break production. If nothing rises to that bar, prefer
APPROVE_WITH_COMMENTS or REQUEST_CHANGES.
PROMPT_EOF

# 7. Run codex. Capture stdout+stderr to the report.
{
  printf '%s\n\n<context>\nBranch: %s\nHead: %s\nTime: %s\n</context>\n\n<diff>\n' \
    "$PROMPT" "$BRANCH" "$SHA" "$TS"
  printf '%s\n' "$DIFF"
  printf '</diff>\n'
} | codex exec - >"$REPORT" 2>&1 || {
  echo "[codex-review] codex exec failed; partial output in $REPORT" >&2
  exit 0
}

echo "[codex-review] report saved: $REPORT" >&2

# 8. Extract the Verdict line and block only on BLOCK.
VERDICT=$(awk '
  /^##[[:space:]]*Verdict/ {flag=1; next}
  flag && /^##/ {exit}
  flag && NF>0 {print; exit}
' "$REPORT" | tr -d '[:space:]')

if [ "$VERDICT" = "BLOCK" ]; then
  REASON="Codex review verdict: BLOCK. Address Critical items in $REPORT before stopping."
  if have jq; then
    jq -n --arg r "$REASON" '{decision:"block", reason:$r}'
  else
    ESC=$(printf '%s' "$REASON" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
    printf '{"decision":"block","reason":"%s"}\n' "$ESC"
  fi
fi

exit 0
