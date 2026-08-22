# AI-assisted engineering workflow

Implementation on Protin is AI-assisted. This document describes the process built
around that — the roles, the automated gates, and the reasoning behind both.

The claim being made here is narrow and worth stating up front: **AI acceleration is
useful only when it is paired with reproducible automated checks and independent
review.** Nothing below asserts that generated code is correct. The design goal is to
make incorrect code expensive to land.

---

## Roles

### Repository owner (human)

Owns everything that cannot be delegated:

- Product direction, scope and prioritisation
- Architectural decisions and the boundaries between components
- Reviewing generated diffs and deciding what is acceptable
- Final acceptance — no change lands because a tool approved it

### Claude Code — implementation

Configured through `.claude/`:

| Path | Role |
|---|---|
| `agents/api-builder.md` | Backend work — routes, services, models, migrations, API tests |
| `agents/mobile-builder.md` | Frontend work — screens, hooks, stores, components |
| `agents/qa-reviewer.md` | Read-only review; never modifies files |
| `agents/infra-ops.md` | Docker, nginx, CI, deploy scripts, environment config |
| `skills/booking-fsm/` | Rules for changing the booking state machine |
| `skills/discovery-feed/` | Feed filtering and match-scoring rules |
| `skills/api-contract/` | Protocol for keeping `shared-types` in sync |
| `skills/wave-planning/` | Splitting work across parallel agents by file ownership |

The agent split exists to enforce **file ownership**. Each agent has a declared scope,
and work that would cross a boundary is meant to surface as a conflict rather than get
silently edited. That is what makes parallel work merge cleanly; the alternative is
several agents rewriting the same file with different assumptions.

The skills encode domain rules that are easy to violate and expensive to get wrong — the
legal booking transitions, the discovery filter semantics, the contract-sync protocol.
They exist because those rules are not obvious from reading a single file.

Project-wide constraints live in [`CLAUDE.md`](../../CLAUDE.md): keep implementations
minimal, add no placeholder business logic, add no speculative features.

### Codex — independent review

`.claude/hooks/codex-review.sh` runs `codex exec` against the working diff and writes a
Markdown report to `reviews/` (git-ignored). The review is prompted for a fixed priority
order — correctness, regressions, security, maintainability, scope drift — and told
explicitly to skip nitpicks.

It returns one of four verdicts, and **only `BLOCK` stops the turn**.
`APPROVE_WITH_COMMENTS` and `REQUEST_CHANGES` surface in the report without blocking.

That threshold is deliberate. A reviewer that blocks on style produces one behaviour:
people route around it. Reserving the block for correctness, regression and security
findings keeps the signal worth reading.

Codex's separate role is described in [`AGENTS.md`](../../AGENTS.md).

The value here is independence, not authority. A second model reviewing the first
model's diff catches a real class of mistake — misread requirements, a contract broken
on the far side, a case the author did not consider — because it did not inherit the
reasoning that produced the error. It does not catch everything, and it is not a
substitute for the human review that follows.

### CI — the final arbiter

Nothing merges on a green local run alone. `.github/workflows/ci.yml` re-runs every
check on clean infrastructure. See [TESTING.md](TESTING.md).

---

## Quality gates

Three layers are configured at different moments, each cheaper and narrower than the
next. **Only the Stop layer is live today** — the other two are mis-wired and do not
fire; see the note at the end of this section.

### 1. On edit — `PostToolUse` *(currently inert)*

`post-edit-lint.sh` lints the single file just edited. Fast feedback, no blocking.

### 2. Before the turn ends — `Stop` *(live)*

`stop-quality-gate.sh` runs against the working diff:

- Ruff on changed `apps/api/**/*.py`
- `tsc --noEmit` on changed `apps/mobile/**/*.{ts,tsx}`
- A secret-pattern scan over the diff itself, matching assignments of the shape
  `password` / `secret` / `api_key` / `access_token` / `private_key` to a long literal

Any failure emits `{"decision":"block"}`, and Claude keeps working instead of stopping.
`codex-review.sh` then runs the independent review described above.

Both hooks honour `stop_hook_active`, which is what prevents a blocked stop from
recursing into an infinite loop. Both degrade gracefully when a tool is missing — a
machine without `codex` installed skips the review rather than failing the turn.

### 3. Before commit — `PreToolUse` *(currently inert)*

`pre-commit.sh` intercepts `git commit` and blocks on:

- **Committing directly to `main` or `master`** — feature branch required
- Ruff check *and* format check across `apps/api`
- `tsc --noEmit` across `apps/mobile`
- ESLint across `apps/mobile`
- A secret scan over the staged files

This is the strictest layer because it is the last one before history. It runs the whole
project rather than the diff, so a change that breaks a file it did not touch is still
caught.

### Known defect: layers 1 and 3 do not currently fire

`settings.json` invokes both hooks with `"$CLAUDE_TOOL_INPUT_COMMAND"` and
`"$CLAUDE_TOOL_INPUT_FILE_PATH"`. Those variables are not set in the hook environment —
Claude Code delivers hook input as JSON on **stdin**, which is how the two Stop hooks in
the same directory correctly read it. Both scripts therefore receive an empty argument,
take their `if [ -z ... ]` early-exit, and return 0 without running a single check.

The scripts' own logic is sound — invoked with a real argument, `pre-commit.sh` runs its
checks and emits a block decision as designed. Only the wiring is wrong. Fixing it also
requires resolving `ruff` and `tsc` through `uv run` / `npx --no-install` rather than
bare names, since neither is on a default `PATH`.

Documenting this rather than quietly leaving the claim in place is the point of the
section. A quality harness that is described as running when it is not is worse than no
harness, because it converts a check into an assumption. In practice the Stop gate and
CI have been carrying the load, which is why the defect survived unnoticed.

---

## Why it is shaped this way

**Deterministic checks first, model review second.** Lint, typecheck and tests are
reproducible: same input, same verdict, no judgement involved. They are the floor.
Model review sits on top to catch what a linter structurally cannot — a function that
passes every check while doing the wrong thing.

**Blocking is rationed.** The Stop gates block on lint failure, typecheck failure, secret
exposure and a `BLOCK` verdict, and nothing else. A gate that blocks on everything gets
bypassed, and a bypassed gate is worth less than no gate. The pre-commit gate is stricter
by design — it additionally refuses a commit on `main`/`master` — because it is the last
step before history.

**Degradation, where it is safe.** The two Stop hooks skip cleanly when `ruff`, `npx`,
`jq` or `codex` is missing, so a partially configured machine still gets a usable loop.
The pre-commit hook deliberately does not: it runs under `set -e` and fails the commit if
its tooling is absent, on the grounds that "the linter was missing" is not a reason to let
an unchecked commit through. (That stricter posture is by design; it is also why the
wiring fix above has to resolve the tools properly at the same time.)

**The human stays the last step.** Diffs are read before they are committed, and the
final decision is not automated. The gates narrow what reaches that review; they do not
replace it.

---

## Honest limitations

- Independent AI review does **not** guarantee correctness. It reduces a class of error;
  it does not eliminate it, and it produces false negatives on subtle logic.
- The secret scan is a regex over a diff. It catches obvious literal assignments and
  will miss an obfuscated or unusually formatted one. It is a backstop, not a control.
- The `shared-types` contract is upheld by review convention on the API side rather than
  generated from OpenAPI, so a mismatch is caught by a human or by a test, not by a
  compiler. See [ARCHITECTURE.md](../architecture/ARCHITECTURE.md#package-boundaries).
- Agent file-ownership boundaries are declared in Markdown, not enforced by tooling.
  They work because the workflow respects them, not because it cannot violate them.
