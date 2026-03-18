# Naming Conventions

Canonical names for all entities, fields, and concepts in the Protin platform.
Follow these consistently across the API (Python), mobile (TypeScript), and any future clients.

---

## Entity names

| Concept | TypeScript name | Python/DB name | Notes |
|---|---|---|---|
| Authentication identity | `User` | `User` / `users` | Thin record — auth fields only |
| User display data | `UserProfile` | `UserProfile` / `user_profiles` | Extends User via `userId` FK |
| Per-sport fitness data | `SportProfile` | `SportProfile` / `sport_profiles` | One per sport per user; replaces TrainerProfile/ClientProfile |
| Partner preferences | `IdentityPreferences` | `IdentityPreferences` / `identity_preferences` | Who the user wants to partner with (Wave 2) |
| Available time slot | `Availability` | `Availability` / `availability` | Wave 3+ scope |
| Booked session | `Booking` | `Booking` / `bookings` | Wave 3+ scope |
| Confirmed mutual interest | `Match` | `Match` / `matches` | Real DB entity; created when two users mutually like |
| Recurring schedule block | `AvailabilityWindow` | `AvailabilityWindow` / `availability_windows` | Future scope |
| External calendar connection | `CalendarSyncStatus` | — | Future scope |

---

## Field naming

### IDs

| Pattern | Example | Rule |
|---|---|---|
| Primary key | `id` | Always `id`, never `userId` on a `User` |
| Foreign key to User | `userId` (TS) / `user_id` (Python) | `{entityName}Id` |
| Foreign key to Match | `matchId` / `match_id` | Same pattern |

### Timestamps

| Field | Type | Format |
|---|---|---|
| `createdAt` | `ISODateString` | ISO 8601 UTC: `"2025-06-15T09:00:00Z"` |
| `updatedAt` | `ISODateString` | ISO 8601 UTC |
| `lastSyncedAt` | `ISODateString` | External sync timestamp |

Never use `date`, `time`, `timestamp` as standalone field names. Always `{noun}At`.

### Status fields

Status fields are string union types, not TypeScript enums. Name them `{entity}Status`.

| Entity | Field | Values |
|---|---|---|
| `User` | `isActive` | `boolean` |
| `Match` | `status` | `'active'` `'archived'` |

When adding a new status value: add it to the union, then search for exhaustive
switch statements in the mobile codebase that need updating.

### Duration and time

```
durationMinutes: number    — integer, always in minutes
slotDurationMinutes        — same, more specific
bufferMinutes              — gap between slots
startTime: string          — HH:MM (24-hour), for recurring windows only
endTime: string            — HH:MM (24-hour), for recurring windows only
```

### Booleans

Prefix with `is` or `has`:
```
isActive
isAvailable
matchCreated
```

### Arrays

Use the plural of the noun:
```
sportProfiles: SportProfile[]
preferredTimes: PreferredTime[]
openTo: GenderPreference[]
```

---

## Enum values

String unions use `snake_case` values (matching Python convention and JSON wire format).

| Type | Values |
|---|---|
| `Sport` | `'gym'` `'golf'` |
| `FitnessLevel` | `'beginner'` `'intermediate'` `'advanced'` |
| `PreferredTime` | `'morning'` `'afternoon'` `'evening'` `'flexible'` |
| `GenderPreference` | `'any'` `'male'` `'female'` `'non_binary'` |
| `DiscoveryAction` | `'like'` `'pass'` `'save'` |
| `MatchStatus` | `'active'` `'archived'` |
| `CalendarProvider` | `'google'` `'apple'` `'outlook'` |

---

## API route naming

Routes use `kebab-case` for multi-word segments and plural nouns for collections.

| Resource | Routes |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `GET /auth/me` |
| User profiles | `GET /profiles/me` `PUT /profiles/me` |
| Sport profiles | `GET /sport-profiles` `PUT /sport-profiles/:sport` |
| Identity preferences | `GET /identity-preferences` `PUT /identity-preferences` |
| Discovery | `GET /discovery` `POST /discovery/actions` |
| Matches | `GET /matches` `PATCH /matches/:id` |
| Calendar | `GET /calendar/sync-status` `POST /calendar/sync` `POST /calendar/export` |

Query parameters for filtering always use `snake_case`:
```
GET /discovery?sport=gym&level=intermediate&suburb=Bondi&limit=20&offset=0
```

---

## Casing summary

| Context | Convention | Example |
|---|---|---|
| TypeScript interface names | PascalCase | `UserProfile` |
| TypeScript field names | camelCase | `displayName` |
| TypeScript union values | snake_case | `'non_binary'` |
| Python class names | PascalCase | `UserProfile` |
| Python field names | snake_case | `display_name` |
| Database table names | snake_case plural | `user_profiles` |
| Database column names | snake_case | `display_name` |
| API route segments | kebab-case | `/sport-profiles` |
| Query parameters | snake_case | `?preferred_time=morning` |
| JSON keys (wire format) | snake_case (FastAPI default) | `"display_name"` |
| TypeScript field names (after client transform) | camelCase | `displayName` |

---

## Terms aligned to product

These terms keep the mobile copy and codebase consistent with what Protin actually is:
a workout partner app, not a trainer marketplace.

| Context | Use | Do not use |
|---|---|---|
| UI copy for another user | "partner" | "trainer", "coach", "client" |
| Confirmed mutual interest | "match" | "booking", "appointment" |
| Per-sport fitness data | "sport profile" | "trainer profile", "client profile" |
| Swipe gesture | "like" / "pass" / "save" | "swipe", "approve", "book" |
| Sports in scope | `'gym'` or `'golf'` only | any other sport type in MVP |

---

## Terms to avoid

| Avoid | Use instead | Reason |
|---|---|---|
| `trainer` / `coach` | `partner` | No trainer marketplace — users seek workout partners |
| `client` | `user` | All users are workout seekers, not clients of trainers |
| `TrainerProfile` | `UserProfile` + `SportProfile` | Replaced in Wave 2 |
| `ClientProfile` | `UserProfile` + `SportProfile` | Replaced in Wave 2 |
| `TrainerCard` | `PartnerCard` | Discovery shows partners, not trainers for hire |
| `SportType` (broad union) | `Sport` (`'gym'` \| `'golf'`) | Only gym and golf in current scope |
| `SessionFormat` | — | No virtual/in-person distinction for partner matching |
| `like` / `swipe` (in code identifiers) | `DiscoveryAction` | Use the type; `'like'` is a valid action value |
| `session` (as DB entity) | `booking` | Wave 3+ scope; not yet in the model |
| `appointment` | `booking` | Consistent with booking-first architecture (Wave 3+) |
