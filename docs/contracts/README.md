# Protin — Type Contracts

This directory documents the shared type contracts for the Protin platform.
The **authoritative** source of truth is the TypeScript source in `packages/shared-types/src/`.
These docs explain *why* types are shaped the way they are, which the TypeScript files cannot.

---

## Domain map

```
User                   Identity and authentication
  └─ UserProfile         Display data: name, bio, suburb, avatar  (sport-profile.ts)
  └─ IdentityPreferences Who the user wants to partner with       (sport-profile.ts)
  └─ SportProfile        Per-sport fitness data: gym or golf      (sport-profile.ts)

Discovery              Browsing potential workout partners (Discover tab)
  └─ PartnerCard         Summary shown in the discovery feed
  └─ DiscoveryFilter     Query parameters for GET /discovery
  └─ DiscoveryAction     pass / like / save gesture by the current user
  └─ RecordActionRequest POST /discovery/actions payload

Match                  Mutual-interest entity (real DB record)
  └─ Match               Created when two users mutually like each other for the same sport
  └─ MatchWithPartner    Match enriched with the other user's PartnerCard, for mobile rendering

Booking                Core transactional entity — Wave 3+ scope
  └─ Availability        Time slot (future)
  └─ Booking             Booked slot (future)
  └─ BookingDetail       Enriched booking for mobile rendering (future)

Calendar               Scheduling and external sync — future scope
  └─ AvailabilityWindow   Recurring weekly slot block
  └─ CalendarSlot         A single slot view
  └─ CalendarSync*        External provider (Google, Apple, Outlook) sync types
```

---

## Architecture notes

### DiscoveryAction leads to Match when mutual

A `DiscoveryAction` (`'like'` | `'pass'` | `'save'`) is recorded via `POST /discovery/actions`.
When a like action causes a mutual like between two users for the same sport, the API
creates a `Match` entity and returns `matchCreated: true` with a `matchId` in the
`RecordActionResponse`.

```
User A likes User B  →  RecordActionResponse { matchCreated: false }
User B likes User A  →  RecordActionResponse { matchCreated: true, matchId: "..." }
                                              ↓
                                        Match entity created in DB
                                        (user1Id < user2Id, lexicographic)
```

The `Match` is a **real database entity** — not a view or projection. The match persists
independently of any future booking and can be archived by either participant.

### Sports are gym and golf only

`Sport = 'gym' | 'golf'` is the complete set for the current scope. Do not extend this
union speculatively — adding a sport requires product and backend changes together.

### Location is suburb-based, not lat/lng

Discovery filtering uses `suburb: string` (Sydney suburb name). There are no lat/lng
coordinates in the MVP. `GeoLocation` remains in `common.ts` for future use but is not
referenced in any Wave 2 type.

### PartnerCard replaces TrainerCard

The discovery feed returns `PartnerCard` objects — intentionally limited summaries of
potential workout partners. The `bioExcerpt` is truncated at 160 chars by the API.
Full profile detail is fetched separately.

### Wire format

FastAPI emits `snake_case` JSON by default. The shared types in this package use `camelCase`
(TypeScript convention). The mobile API client layer is responsible for field transformation:

```
API response (snake_case)       Mobile types (camelCase)
─────────────────────────       ────────────────────────
created_at        →             createdAt
display_name      →             displayName
birth_year        →             birthYear
sport_profiles    →             sportProfiles
```

If the API is later configured to emit camelCase (via Pydantic `alias_generator`),
the transformation layer can be removed without touching these type definitions.

### Paginated responses

Any endpoint returning a collection uses the `Paginated<T>` envelope:

```typescript
interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

Query parameters are always `limit` and `offset`. Default `limit` is decided by the API
implementation; the mobile client always passes explicit values.

### Timestamps

All timestamps are ISO 8601 UTC strings (`ISODateString`). Timezone conversion for
display is the mobile app's responsibility. Never store or transmit timestamps in
local time across the API boundary.

---

## How to extend these contracts

### Adding a field to an existing entity

Edit the interface in `packages/shared-types/src/{domain}.ts`.
Run `npm run typecheck` from `packages/shared-types` to confirm no consumers break.
Update this README if the field changes the domain's architecture.

### Adding a new domain

1. Create `packages/shared-types/src/{domain}.ts`
2. Export from `packages/shared-types/src/index.ts`
3. Add an entry to the domain map above
4. Add a naming entry in `docs/contracts/naming.md`

### Adding a status value

Status fields are string unions (not TypeScript enums). Add the new value to the union
and search the mobile codebase for exhaustive `switch` statements — they will need updating.

---

## Consuming this package

The package is registered in the npm workspace root (`"packages/*"` in `workspaces`).

Import in mobile or other consumers:

```typescript
import type { User, PartnerCard, Match } from '@protin/shared-types';
```
