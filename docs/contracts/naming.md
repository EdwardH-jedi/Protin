# Naming Conventions

Canonical names for all entities, fields, and concepts in the SportsGang platform.
Follow these consistently across the API (Python/FastAPI), shared-types (TypeScript),
and the mobile client (React Native/TypeScript).

---

## Wire format and key transformation

FastAPI emits `snake_case` JSON by default. Shared types use `camelCase` (TypeScript convention).
The mobile `api.ts` client transforms all keys on request and response:

```
API request (camelCase → snake_case on send)    API response (snake_case → camelCase on receive)
───────────────────────────────────────         ────────────────────────────────────────────────
matchId          →  match_id                    created_at      →  createdAt
startsAt         →  starts_at                   display_name    →  displayName
targetUserId     →  target_user_id              birth_year      →  birthYear
                                                sport_profiles  →  sportProfiles
```

Shared-type field names always reflect the **post-transform camelCase** form.
API schema field names are the canonical source of truth for what the wire carries.

---

## Entity names

| Concept | TypeScript name | Python/DB name | Notes |
|---|---|---|---|
| Authentication identity | `User` | `User` / `users` | Auth fields only: id, email, is_active, created_at |
| User display data | `UserProfile` | `UserProfile` / `user_profiles` | Linked to User via userId |
| Per-sport fitness data | `SportProfile` | `SportProfile` / `sport_profiles` | One per sport per user |
| Partner preferences | `IdentityPreferences` | `IdentityPreferences` / `identity_preferences` | open_to, age range, distance |
| Potential partner summary | `PartnerCard` | `PartnerCardResponse` | Discovery feed item |
| Discovery gesture | `DiscoveryAction` | `DiscoveryAction` / `discovery_actions` | like / pass / save |
| Confirmed mutual interest | `Match` | `Match` / `matches` | Real DB entity; created on mutual like |
| Booked session | `Booking` | `Booking` / `bookings` | Proposed between matched partners |
| Chat message | `Message` | — (no model name) | Scoped to a match |
| Push token | `PushTokenResponse` | `PushToken` / `push_tokens` | Expo push token |
| Report | `ReportResponse` | `Report` / `reports` | Safety: user reporting |
| Block | `BlockResponse` | `Block` / `blocks` | Safety: user blocking |

---

## Field naming

### IDs

| Pattern | TypeScript (camelCase) | Python/JSON (snake_case) | Rule |
|---|---|---|---|
| Primary key | `id` | `id` | Always `id`, never `userId` on a `User` record |
| Foreign key to User | `userId` | `user_id` | `{entityName}Id` pattern |
| Foreign key to Match | `matchId` | `match_id` | Same pattern |
| Foreign key to Booking | `bookingId` | `booking_id` | Same pattern |
| Proposer in a booking | `proposerId` | `proposer_id` | Role-specific ID |
| Partner in a booking | `partnerId` | `partner_id` | Role-specific ID |
| Discovery target user | `targetUserId` | `target_user_id` | In RecordActionRequest |
| Reported user | `reportedUserId` | `reported_user_id` | In CreateReportRequest |

### Timestamps

| TypeScript field | Python field | Format |
|---|---|---|
| `createdAt` | `created_at` | ISO 8601 UTC: `"2025-06-15T09:00:00Z"` |
| `updatedAt` | `updated_at` | ISO 8601 UTC |
| `connectedAt` | `connected_at` | Google Calendar connection time |

Never use `date`, `time`, or `timestamp` as standalone field names. Always `{noun}At`.

### Status fields

Status fields are string union types, not TypeScript enums. Named `{entity}Status` at the type level.

| Entity | Wire field | TypeScript type | Values |
|---|---|---|---|
| `User` | `is_active` | `isActive: boolean` | `true` / `false` — not a string status |
| `Match` | `status` | `MatchStatus` | `'active'` `'archived'` |
| `Booking` | `status` | `BookingStatus` | `'proposed'` `'confirmed'` `'declined'` `'cancelled'` `'completed'` `'no_show'` |
| `CalendarBookingSyncStatus` | `sync_status` | string literal in `SyncBookingResponse` | `'synced'` `'failed'` `'cancelled'` |

The API uses `is_active: bool` for User — there is no `UserStatus` string field on the wire.

### Booking time fields

| TypeScript | Python/JSON | Notes |
|---|---|---|
| `startsAt` | `starts_at` | ISO 8601 UTC |
| `endsAt` | `ends_at` | ISO 8601 UTC |

### Duration and recurring windows (future scope)

```
slotDurationMinutes        — integer, minutes
bufferMinutes              — gap between slots, minutes
startTime: string          — HH:MM 24-hour, for recurring windows only
endTime: string            — HH:MM 24-hour, for recurring windows only
```

### Booleans

Prefix with `is` or `has`. Exception: `matchCreated` follows noun-verb convention.

```
isActive          — User.is_active on the wire
isAvailable       — CalendarSlot availability
matchCreated      — RecordActionResponse field
connected         — GoogleCalendarStatus field
```

### Arrays

Use the plural of the noun:

```
sportProfiles: SportProfile[]      — preferred_times on the wire
preferredTimes: PreferredTime[]    — preferred_times on the wire
openTo: GenderPreference[]         — open_to on the wire
items: T[]                         — paginated list envelope
```

---

## Enum values

String union values use `snake_case` (matching Python convention and JSON wire format).

| Type | TypeScript name | Values |
|---|---|---|
| Sport | `Sport` | `'gym'` `'golf'` `'tennis'` `'running'` |
| Fitness level | `FitnessLevel` | `'beginner'` `'intermediate'` `'advanced'` |
| Preferred time | `PreferredTime` | `'morning'` `'afternoon'` `'evening'` `'flexible'` |
| Gender preference | `GenderPreference` | `'any'` `'male'` `'female'` `'non_binary'` |
| Discovery gesture | `DiscoveryAction` | `'like'` `'pass'` `'save'` |
| Match status | `MatchStatus` | `'active'` `'archived'` |
| Booking status | `BookingStatus` | `'proposed'` `'confirmed'` `'declined'` `'cancelled'` `'completed'` `'no_show'` |
| Push platform | `PushPlatform` | `'ios'` `'android'` `'web'` |
| Report reason | `ReportReason` | `'spam'` `'inappropriate'` `'fake'` `'harassment'` `'other'` |

---

## API route naming (actual implemented routes)

Routes use `kebab-case` for multi-word segments and plural nouns for collections.

| Resource | Routes |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `GET /auth/me` |
| User profile | `GET /users/me/profile` `PUT /users/me/profile` |
| Sport profiles | `GET /users/me/sport-profiles` `POST /users/me/sport-profiles` |
| Identity preferences | `GET /users/me/identity-preferences` `PUT /users/me/identity-preferences` |
| Google Calendar | `GET /users/me/google-calendar/auth-url` `GET /users/me/google-calendar/status` `DELETE /users/me/google-calendar/disconnect` |
| Discovery | `GET /discovery` `POST /discovery/actions` |
| Matches | `GET /matches` `PATCH /matches/:id` |
| Bookings | `GET /bookings` `POST /bookings` `GET /bookings/:id` `POST /bookings/:id/{confirm,decline,cancel,complete,no-show}` |
| Chat | `GET /matches/:id/messages` `POST /matches/:id/messages` |
| Notifications | `POST /notifications/token` `DELETE /notifications/token/:id` |
| Blocks | `POST /blocks/:userId` `DELETE /blocks/:userId` `GET /blocks` |
| Reports | `POST /reports` |
| Google Calendar sync | `POST /bookings/:id/sync-google-calendar` |

Query parameters for filtering use `snake_case`:

```
GET /discovery?sport=gym&level=intermediate&suburb=Bondi&limit=20&offset=0
GET /bookings?status=confirmed&limit=20&offset=0
GET /matches?limit=50&offset=0
```

---

## Casing summary

| Context | Convention | Example |
|---|---|---|
| TypeScript interface names | PascalCase | `UserProfile` |
| TypeScript field names | camelCase | `displayName` |
| TypeScript union values | snake_case | `'non_binary'` |
| Python class names | PascalCase | `UserProfileResponse` |
| Python field names | snake_case | `display_name` |
| Database table names | snake_case plural | `user_profiles` |
| Database column names | snake_case | `display_name` |
| API route segments | kebab-case | `/sport-profiles` |
| Query parameters | snake_case | `?preferred_time=morning` |
| JSON keys (wire format) | snake_case (FastAPI default) | `"display_name"` |
| TypeScript field names (after client transform) | camelCase | `displayName` |

---

## Terms aligned to product

These terms keep mobile copy and codebase consistent with what SportsGang is:
a booking-first workout partner app, not a trainer marketplace.

| Context | Use | Do not use |
|---|---|---|
| Another user in the feed or match | "partner" | "trainer", "coach", "client" |
| Confirmed mutual interest | "match" | "connection", "appointment" |
| Per-sport fitness data | "sport profile" | "trainer profile", "client profile" |
| Swipe/like gesture | "like" / "pass" / "save" | "swipe", "approve" |
| Discovery sports in scope | `'gym'`, `'golf'`, `'tennis'`, or `'running'` | unapproved sport types |
| Booked session | "booking" | "session" (as DB entity), "appointment" |

---

## Terms to avoid

| Avoid | Use instead | Reason |
|---|---|---|
| `trainer` / `coach` | `partner` | No trainer marketplace |
| `client` | `user` | All users are workout seekers |
| `TrainerProfile` | `UserProfile` + `SportProfile` | No trainer role exists |
| `ClientProfile` | `UserProfile` + `SportProfile` | No client role exists |
| `TrainerCard` | `PartnerCard` | Discovery shows partners, not trainers |
| `SportType` (broad union) | `Sport` (`'gym'` \| `'golf'` \| `'tennis'` \| `'running'`) | Use the canonical discovery-sport contract |
| `SessionFormat` | — | No virtual/in-person distinction |
| `UserStatus` (string enum) | `isActive: boolean` | API uses a boolean, not a status string |
| `user1Id` / `user2Id` in API responses | — | DB-internal fields; not exposed in API responses |
| `session` (as DB entity) | `booking` | The entity is `Booking` |
| `appointment` | `booking` | Consistent with booking-first architecture |
