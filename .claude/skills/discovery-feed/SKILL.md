---
name: discovery-feed
description: Guide for working with the partner discovery feed, filtering logic, and match scoring
triggers: [discovery, 디스커버리, feed, 피드, matching, 매칭, swipe, 스와이프]
---

# Discovery Feed Skill

## Scope
Current sport scope: **gym and golf only**. Do not add new sports without an explicit wave task.

## Feed filtering rules (in order)
1. **Exclude self** — never show the requesting user their own profile
2. **Exclude blocked users** — both directions (user blocked them, or they blocked user)
3. **Exclude already-actioned** — users already swiped on (liked or passed)
4. **Sport filter** — only show partners with at least one matching sport preference

## Match scoring weights
| Signal | Weight |
|---|---|
| Shared sports count | High |
| Skill level proximity | Medium |
| Distance (km) | Medium |
| Preferred time overlap | Low |

Scoring produces a float 0–1. Feed is sorted descending by score.

## Key files
- `apps/api/app/routers/discovery.py` — endpoint
- `apps/api/app/services/discovery.py` — filtering + scoring logic
- `apps/mobile/src/hooks/useDiscovery.ts` — client-side feed state

## Rules for modifying feed logic
- Filter changes → add/update pytest in `apps/api/tests/test_discovery.py`
- Scoring changes → document weight rationale in a comment above the scorer
- Do not add sport types not in the current allowed list without a wave task
