---
name: wave-planning
description: Protocol for planning and distributing work across waves, managing parallelization and ownership boundaries
triggers: [wave, 웨이브, task planning, 작업 계획, parallel, 병렬, 태스크 분배]
---

# Wave Planning Skill

## Wave discipline (from CLAUDE.md)
- Parallelize **only** where file ownership is clean
- Raise conflicts instead of editing outside scope
- Optimize for easy integration into the next wave

## Parallelization decision tree

```
Is the task touching a single agent's ownership?
  YES → safe to parallelize with other single-owner tasks
  NO  → can it be split into sub-tasks with clean ownership?
    YES → split and assign; each sub-task runs independently
    NO  → run sequentially; do not parallelize
```

## Merge conflict risk assessment
| Risk | Condition |
|---|---|
| Low | Each agent owns distinct directories |
| Medium | Both agents touch `packages/shared-types/` |
| High | Two agents need to edit the same file |

High-risk tasks must run sequentially with an explicit handoff point.

## Wave structure
- **Wave N**: implement features (api-builder + mobile-builder in parallel if ownership clean)
- **Wave N review**: qa-reviewer validates all Wave N output before Wave N+1 starts
- **Shared-types changes**: api-builder first → mobile-builder after merge, not before

## Task template for a new wave item
```
Task: <short name>
Agent: <api-builder | mobile-builder | qa-reviewer | infra-ops>
Files: <list of files to be changed>
Depends on: <prior task or "none">
Risk: <low | medium | high>
```
