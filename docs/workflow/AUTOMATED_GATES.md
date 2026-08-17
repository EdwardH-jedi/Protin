# Automated local gates

Claude's local harness provides fast feedback during implementation. It complements the pull-request review lifecycle; it does not replace CI, behavioural verification, or a human merge decision.

## Current gates

| Trigger | Script | Behaviour |
|---|---|---|
| Before a Claude-initiated commit | `.claude/hooks/pre-commit.sh` | Blocks direct commits to `main`, runs API lint and formatting checks, mobile typecheck and lint, scans the staged diff for likely secrets, and validates an inline Conventional Commit message. |
| After a Claude edit | `.claude/hooks/post-edit-lint.sh` | Runs non-blocking targeted lint or mobile typecheck feedback. |
| Before Claude stops | `.claude/hooks/stop-quality-gate.sh` | Checks relevant uncommitted API or mobile changes and blocks only on detected failures. |
| Before Claude stops | `.claude/hooks/codex-review.sh` | Saves an independent review under the ignored `reviews/` directory and blocks only on an explicit `BLOCK` verdict. |
| Prompt and stop events | `.claude/hooks/log-run-*.sh` | Writes local run evidence under `runs/` when enabled. |

The stop hooks honour `stop_hook_active` to avoid loops. Missing optional tools are reported as skipped rather than misrepresented as passes. `CLAUDE_SKIP_CODEX_REVIEW=1` disables the local Codex stop review for a session, and `CLAUDE_SKIP_RUN_LOG=1` disables run logging.

These scripts inspect local uncommitted work. The pull-request review and CI remain authoritative for committed changes.
