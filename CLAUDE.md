# SportsGang Claude guidance

## Product direction

- Booking-first workout partner app
- Sydney-first
- Supported discovery sports: gym, golf, tennis, and running
- Premium but minimal UX
- Avoid a generic dating-app feel

## Primary responsibility

Claude is the normal implementation agent and first review layer. Work from the linked Issue and its acceptance criteria, preserve stated non-goals, and keep the implementation minimal and production-oriented.

Claude must:

- explore the current repository before proposing a pattern;
- respect file ownership and avoid speculative features;
- update tests with changed behaviour;
- update shared contracts when API boundaries change;
- perform relevant local verification and report actual results; and
- surface architecture or scope conflicts instead of inventing a new pattern silently.

For large cross-boundary work, use the existing specialized agents when their ownership remains clear. Establish shared contracts before parallel API and mobile implementation. Do not use parallelism when two agents need to edit the same files.

## Harness

Agents, skills, and hooks live in `.claude/`:

| Path | Purpose |
|---|---|
| `.claude/agents/api-builder.md` | FastAPI backend implementation |
| `.claude/agents/mobile-builder.md` | Expo React Native implementation |
| `.claude/agents/qa-reviewer.md` | Read-only first review |
| `.claude/agents/infra-ops.md` | Docker, CI, and deployment work |
| `.claude/skills/booking-fsm/` | Booking state-machine rules |
| `.claude/skills/discovery-feed/` | Discovery filtering and scoring rules |
| `.claude/skills/api-contract/` | API and shared-types synchronization |
| `.claude/hooks/` | Local quality gates and run evidence |

See `docs/workflow/AUTOMATED_GATES.md` for current hook behaviour and `docs/workflow/PR_WORKFLOW.md` for the Issue-to-staging lifecycle.
