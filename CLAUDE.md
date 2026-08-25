# Protin Claude team guidance

## Product direction
- Booking-first workout partner app
- Sydney-first
- Supported sports: gym, golf, tennis, running (expanded from gym+golf in Wave 11)
- Premium but minimal UX
- Avoid generic dating-app feel

## Engineering rules
- Respect ownership boundaries
- Keep implementation minimal and production-oriented
- Do not add placeholder business logic
- Do not add speculative features
- Prefer simple structure over abstraction

## Wave discipline
- Parallelize only where file ownership is clean
- Raise conflicts instead of editing outside scope
- Optimize for easy integration into the next wave

## Harness
Agents, skills, and hooks live in `.claude/`:

| Path | Purpose |
|---|---|
| `.claude/agents/api-builder.md` | FastAPI backend agent |
| `.claude/agents/mobile-builder.md` | Expo RN frontend agent |
| `.claude/agents/qa-reviewer.md` | Read-only review agent |
| `.claude/agents/infra-ops.md` | Docker / CI / deploy agent |
| `.claude/skills/booking-fsm/` | Booking state machine rules |
| `.claude/skills/discovery-feed/` | Feed filtering & scoring rules |
| `.claude/skills/api-contract/` | shared-types sync protocol |
| `.claude/skills/wave-planning/` | Wave task distribution protocol |
| `.claude/hooks/stop-quality-gate.sh` | Lint + typecheck + secret scan on the working diff (Stop hook — **live**) |
| `.claude/hooks/codex-review.sh` | Independent Codex diff review (Stop hook — **live**) |
| `.claude/hooks/pre-commit.sh` | Lint + typecheck + secret scan before commit (**currently inert** — see below) |
| `.claude/hooks/post-edit-lint.sh` | Auto-lint after file edits (**currently inert** — see below) |

> The `PreToolUse` and `PostToolUse` hooks do not fire. `settings.json` passes
> `$CLAUDE_TOOL_INPUT_COMMAND` / `$CLAUDE_TOOL_INPUT_FILE_PATH`, which are never set —
> hook input arrives as JSON on stdin. Both scripts take their empty-argument early exit.
> Only the Stop hooks and CI actually gate anything today. Do not assume a commit was
> linted because the hook is configured.

## Canonical documentation
Repository evidence is authoritative. When docs and code disagree, fix the docs.
These three files are the source of truth, in this order:

| Document | Role |
|---|---|
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Current state, validation evidence, deployment truth, known issues |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Implemented system design and its limitations |
| [`docs/PORTFOLIO_FACTS.md`](docs/PORTFOLIO_FACTS.md) | Verified facts safe for portfolio use, and claims that must not be made |

Update `docs/PROJECT_STATUS.md` when you change what is implemented, and
`docs/PORTFOLIO_FACTS.md` when you change anything it cites.
