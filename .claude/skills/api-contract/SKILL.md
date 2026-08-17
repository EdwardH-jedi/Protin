---
name: api-contract
description: Guide for keeping the API schema and shared-types in sync between backend and frontend
triggers: [shared-types, API schema, type contract, schema change, api-contract]
---

# API Contract Skill

## Source of truth
`packages/shared-types/` — TypeScript types shared between API and mobile app

## Change sequence (always follow this order)
1. **api-builder** changes the FastAPI schema (Pydantic model)
2. **api-builder** updates `packages/shared-types/` in the same commit
3. **mobile-builder** updates imports — never defines its own copy of API types

Skipping step 2 breaks the contract silently. qa-reviewer checks for this.

## Naming convention
| Layer | Convention | Enforced by |
|---|---|---|
| Python / FastAPI | `snake_case` | Pydantic default |
| TypeScript / shared-types | `camelCase` | Type definitions |
| Conversion | `api.ts` `transformKeys` | Do not add conversion elsewhere |

## What belongs in shared-types
- Request/response body shapes
- Enum values used by both sides (e.g., `BookingStatus`, `SportType`)
- Pagination wrapper types

## What does NOT belong in shared-types
- UI-only state (e.g., loading flags, local form state)
- Backend-only internal types (e.g., DB models, service-layer types)

## Validation checklist for any shared-types change
- [ ] Pydantic model matches the TypeScript type field-for-field
- [ ] No `any` in the TypeScript type
- [ ] Mobile imports updated (no stale references)
- [ ] If enum changed: migration exists on the backend
