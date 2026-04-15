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
| `.claude/hooks/pre-commit.sh` | Lint + typecheck + secret scan before commit |
| `.claude/hooks/post-edit-lint.sh` | Auto-lint after file edits |
