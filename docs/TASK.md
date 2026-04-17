# Tasks

Running log of in-flight work. When Claude finishes a task, the Stop hooks
run (quality gate + Codex review) before Claude is allowed to stop. Link the
resulting `reviews/…md` next to any completed item that went through review.

## Active
- [ ] _(no active task)_

## Completed
<!-- - task summary — YYYY-MM-DD — reviews/codex-review-<ts>.md -->

## Conventions
- One task per line. Close with `[x]` when merged.
- If a Codex review flagged anything, link the report under Completed.
- Tasks that span multiple turns stay in Active until the diff lands on
  `main` (or is discarded).

## Hook-related env vars
- `CLAUDE_SKIP_CODEX_REVIEW=1` — skip Codex review for the current session
  (quality gate still runs).
