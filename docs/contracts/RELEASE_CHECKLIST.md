# Pre-Release Contract Consistency Checklist

Run this checklist before merging any branch that touches API schemas, shared-types,
or mobile API usage. Confirm each item before marking the branch ready for staging.

---

## 1. API schema → shared-types alignment

For every changed `apps/api/app/schemas/{domain}.py`:

- [ ] Every field in the API response schema has a matching camelCase field in `packages/shared-types/src/{domain}.ts`
- [ ] Optional fields (`| None = None` in Python) are marked optional (`?`) in the TypeScript interface
- [ ] Required fields (`str`, no default) are non-optional in the TypeScript interface
- [ ] New enum values in API `Literal[...]` are added to the corresponding TypeScript string union
- [ ] Removed API fields are removed from shared-types (no phantom fields)
- [ ] New API response schemas that are mobile-facing are exported from `packages/shared-types/src/index.ts`

---

## 2. Field name parity check

For each modified entity, verify the snake_case ↔ camelCase mapping is correct:

| API field (snake_case) | Shared-type field (camelCase) | Check |
|---|---|---|
| `created_at` | `createdAt` | [ ] |
| `updated_at` | `updatedAt` | [ ] |
| `user_id` | `userId` | [ ] |
| `match_id` | `matchId` | [ ] |
| `booking_id` | `bookingId` | [ ] |
| `proposer_id` | `proposerId` | [ ] |
| `partner_id` | `partnerId` | [ ] |
| `display_name` | `displayName` | [ ] |
| `birth_year` | `birthYear` | [ ] |
| `sport_profiles` | `sportProfiles` | [ ] |
| `preferred_times` | `preferredTimes` | [ ] |
| `bio_excerpt` | `bioExcerpt` | [ ] |
| `avatar_url` | `avatarUrl` | [ ] |
| `open_to` | `openTo` | [ ] |
| `age_range_min` | `ageRangeMin` | [ ] |
| `age_range_max` | `ageRangeMax` | [ ] |
| `max_distance_km` | `maxDistanceKm` | [ ] |
| `starts_at` | `startsAt` | [ ] |
| `ends_at` | `endsAt` | [ ] |
| `is_active` | `isActive` | [ ] |
| `match_created` | `matchCreated` | [ ] |
| `target_user_id` | `targetUserId` | [ ] |
| `reported_user_id` | `reportedUserId` | [ ] |
| `reporter_id` | `reporterId` | [ ] |
| `reported_id` | `reportedId` | [ ] |
| `blocker_id` | `blockerId` | [ ] |
| `blocked_id` | `blockedId` | [ ] |
| `connected_at` | `connectedAt` | [ ] |
| `calendar_id` | `calendarId` | [ ] |
| `google_event_id` | `googleEventId` | [ ] |
| `sync_status` | `syncStatus` | [ ] |

Add new rows for any field not listed above.

---

## 3. API response shape — enriched vs base types

- [ ] `MatchResponse` always includes `partner` — mobile must use `MatchWithPartner`, never bare `Match`
- [ ] `BookingResponse` always includes `partner` — mobile must use `BookingDetail`, never bare `Booking`
- [ ] `user1_id` / `user2_id` are NOT in the API response — verify no mobile code reads these from a match response

---

## 4. Mobile type duplication check

Search `apps/mobile/src/` for local type definitions that shadow shared-types:

- [ ] `grep -r "interface User " apps/mobile/src/` — should return no results (use shared-type)
- [ ] `grep -r "interface Match " apps/mobile/src/` — local inline definitions are acceptable only in screen files; store files must use shared-types
- [ ] `grep -r "interface Booking" apps/mobile/src/` — same rule
- [ ] `grep -r "interface Message " apps/mobile/src/` — same rule
- [ ] `grep -r "interface PartnerCard" apps/mobile/src/` — same rule
- [ ] `apps/mobile/src/stores/profile.ts` local types (`UserProfile`, `IdentityPreferences`, `SportProfile`) must match the shared-types definitions exactly (field for field)

---

## 5. Key transformation coverage

The `api.ts` `transformKeys` function applies camelCase/snake_case recursively to all request/response bodies.

- [ ] Any new request body field added to shared-types uses camelCase — the transform sends it as snake_case to the API automatically
- [ ] No raw snake_case field names are hardcoded in mobile screen files (e.g., `data.display_name` — should be `data.displayName`)
- [ ] No manual field mapping is needed in screens (if you see `data.some_field`, the transform layer has a bug)

---

## 6. Enum / union value parity

For any changed status or action enum:

- [ ] All values in the Python `Literal[...]` or string enum are present in the TypeScript union
- [ ] No extra values exist in TypeScript that are not in the Python schema
- [ ] Mobile `switch` or `map` statements that exhaustively handle status values are updated

Specific enums to re-verify on any booking, match, or notification change:

- [ ] `BookingStatus`: `'proposed' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show'`
- [ ] `MatchStatus`: `'active' | 'archived'`
- [ ] `NotificationType`: `'proposal_received' | 'booking_confirmed' | 'booking_declined' | 'booking_cancelled' | 'reminder'`
- [ ] `ReportReason`: `'spam' | 'inappropriate' | 'fake' | 'harassment' | 'other'`
- [ ] `PushPlatform`: `'ios' | 'android' | 'web'`

---

## 7. Paginated response envelope

Any new list endpoint must use the standard envelope:

- [ ] API response schema includes `items`, `total`, `limit`, `offset`
- [ ] Shared-type uses `Paginated<T>` or an equivalent inline shape with those four fields
- [ ] Mobile screen passes explicit `?limit=N&offset=N` query parameters

---

## 8. No speculative types

- [ ] No new types added to shared-types without a corresponding API schema
- [ ] `calendar.ts` types (`AvailabilityWindow`, `CalendarSlot`, `CalendarSyncRequest`, `CalendarSyncStatus`, `CalendarExportRequest`) are NOT used in any mobile screen — they remain future-scope only
- [ ] No new sports added beyond `'gym' | 'golf'` without a product decision

---

## 9. Index barrel export

- [ ] Every public type in `packages/shared-types/src/{domain}.ts` that mobile consumers need is exported from `packages/shared-types/src/index.ts`
- [ ] Removed types are removed from the barrel export
- [ ] The barrel comment at the top of `index.ts` reflects the current domain map

---

## 10. Known mobile-side mismatches (to track until fixed)

These are mismatches in `apps/mobile/` that must be fixed by the Mobile/Backend teammate.
They do not block staging but must be resolved before production release.

| File | Issue | Status |
|---|---|---|
| `apps/mobile/src/stores/profile.ts` | Defines local `UserProfile`, `IdentityPreferences`, `SportProfile` instead of importing from `@protin/shared-types` | Open |
| `apps/mobile/src/screens/bookings/BookingDetailScreen.tsx` | Local `BookingDetail` interface defined inline instead of importing `BookingDetail` from `@protin/shared-types` | Open |
| `apps/mobile/src/screens/matches/MatchesScreen.tsx` | Local `Match`, `PartnerSummary`, `MatchListResponse` defined inline instead of using `MatchWithPartner`, `MatchListResponse` from `@protin/shared-types` | Open |
| `apps/mobile/src/screens/chat/ChatScreen.tsx` | Local `Message`, `MessageListResponse` defined inline instead of importing from `@protin/shared-types` | Open |
| `apps/mobile/src/stores/auth.ts` | Local `AuthResponse` has `accessToken`/`tokenType` fields — matches shared-types `TokenResponse` shape but does not import from package | Open |

---

## Sign-off

| Checkpoint | Verified by | Date |
|---|---|---|
| API schema → shared-types alignment | | |
| Field name parity | | |
| Enriched response types | | |
| Mobile type duplication | | |
| Key transformation coverage | | |
| Enum parity | | |
| Paginated envelope | | |
| No speculative types | | |
| Index barrel export | | |
