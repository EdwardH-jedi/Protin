> **Archived historical document.** This is the April 2026 design plan for the Claude
> Stop-hook quality gate, written before the gate was built. It is **not** current
> documentation, and one claim in it is now known to be false: the `pre-commit.sh`
> PreToolUse hook does **not** run at commit time — it is mis-wired and never fires.
> For the implemented workflow and its verified gate status see
> [`docs/engineering/AI_WORKFLOW.md`](../engineering/AI_WORKFLOW.md).
> Retained for design provenance only.

# Protin — Stop-hook Quality Gate Plan

## Purpose
Make Claude's implementation loop self-gating. Before Claude is allowed to
finish a turn, two Stop hooks run automatically against the current
uncommitted diff:

1. `stop-quality-gate.sh` — fast lint / typecheck / secret scan.
2. `codex-review.sh` — independent diff review by the Codex CLI, saved to
   `reviews/`. Blocks only on an explicit `BLOCK` verdict.

If either hook emits a JSON `{"decision":"block", ...}`, Claude keeps working
on the flagged issues instead of stopping.

## Flow

```
Claude tries to stop
        │
        ├─► stop-quality-gate.sh
        │     - respects stop_hook_active (prevents infinite loops)
        │     - ruff check on changed apps/api/**/*.py
        │     - tsc --noEmit on changed apps/mobile/**/*.{ts,tsx}
        │     - secret-pattern scan on the diff
        │     - blocks on any failure
        │
        ├─► codex-review.sh
        │     - respects stop_hook_active
        │     - runs `codex exec` against `git diff HEAD` + staged diff
        │     - saves reviews/codex-review-<ts>-<branch>.md
        │     - blocks only when Verdict = BLOCK
        │
        └─► both pass → Claude stops normally
```

## Blocking policy
- **Quality gate** blocks on: lint fail, typecheck fail, secret leak.
- **Codex review** blocks only on an explicit `BLOCK` verdict. Soft verdicts
  (`APPROVE_WITH_COMMENTS`, `REQUEST_CHANGES`) surface in the report but do
  not block. Rationale: unreviewable blocking creates dead stops; Critical
  items worth stopping for map to BLOCK.

## Codex review prompt
Priorities, in order:
1. Correctness
2. Regressions
3. Security
4. Maintainability
5. Scope drift

Nitpicks (formatting, minor naming, docstring wording) are suppressed unless
they block safe merging.

## Safety
- `stop_hook_active` from the Stop-hook stdin JSON is respected in both
  scripts. When Claude is already continuing due to a prior block, the
  hooks exit immediately — this prevents infinite Stop loops.
- Missing tools (`ruff`, `npx`, `codex`, `jq`) cause graceful skips with a
  stderr note. A missing tool is never a block.
- `CLAUDE_SKIP_CODEX_REVIEW=1` disables the Codex hook for a session.

## Files
| Path | Role |
|---|---|
| `.claude/settings.json` | registers the Stop hooks |
| `.claude/hooks/stop-quality-gate.sh` | lint + typecheck + secret scan |
| `.claude/hooks/codex-review.sh` | Codex diff review |
| `reviews/` | generated review reports (gitignored) |
| `docs/archive/2026-04-stop-hook-plan.md` | this document (archived) |
| `docs/TASK.md` | running task log |

## Notes
- Hooks key off `git diff HEAD` — they assume work lives on a feature
  branch and is not yet committed. Already-committed-but-unpushed work is
  not re-reviewed by the Stop hooks (that's what PR review is for).
- The existing `pre-commit.sh` (PreToolUse Bash hook) still runs at commit
  time and is independent of the Stop hooks.
