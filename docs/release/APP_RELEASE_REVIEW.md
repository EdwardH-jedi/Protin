# App Release Review

## Summary

- **Automated QA is currently passing** across mobile and API.
- **The app is not yet ready for public App Store / Google Play release** until the remaining manual device checks and production configuration checks are completed.
- **The app may be ready for internal testing / TestFlight-style review** after the manual device checks pass.
- This review reflects the repository state on the QA-stabilization branch following the overnight QA pass and the Codex strict-fix follow-up.

## Current QA Status

| Check | Result |
|---|---|
| Mobile typecheck (`npm run typecheck`) | **PASS** |
| Mobile tests (`npm run test:ci -- --runInBand`) | **PASS — 244 / 244** |
| API tests (`python -m pytest -q`) | **PASS — 199 / 199** |
| Backend import check (`from app.main import app`) | **PASS** (46 routes registered) |
| Route smoke check (no-auth GET on critical paths) | **PASS** (`/health` → 200, all protected → 401) |
| Mobile lint (`npm run lint`, `--max-warnings 0`) | **PARTIAL** — 0 errors, ~46 pre-existing soft warnings (`require()` in test scaffolding, `Array<T>` style, one `useCallback` deps shape). No blocker; cleanup deferred to a follow-up. |

The QA pass also fixed a brittle `ReportScreen` test by adding `accessibilityLabel="Submit report"` to the Submit Pressable, and stabilised several backend test files (`test_discovery.py`, `test_auth.py`, `test_bookings.py`, `test_chat.py`, `test_matches.py`, `test_safety.py`, `test_health.py`) so missing-token paths accept either `401` or `403` and authenticated-but-forbidden paths assert exactly `403`. Codex reviewed those changes and required two strict-contract corrections (`test_chat.py` non-participant exact `403`, `test_health.py` degraded exact `503`); both are in.

## Core Feature Readiness

| Area | Status | Evidence | Remaining work |
|---|---|---|---|
| Login / auth | **PASS** | `LoginScreen.test.tsx` (15), `RegisterScreen.test.tsx` (12), `AuthEntryScreen.test.tsx` (5), `SplashScreen.test.tsx` (6) all green. Routing gate (no token → AuthEntry, token + Step-1 fields → Main, token + 404/blank → OnboardingStep1) covered. | Real Apple Sign-in on iOS device. Real Google sign-in if/when wired. |
| Onboarding | **PASS** | `OnboardingStep1Screen.test.tsx` (16) covers display name + birth year + suburb validation and persistence — explicitly covers the previously-regressed display-name bug. `OnboardingStep2Screen.test.tsx` (13) covers 2–4 photo bound + bio. Steps 3 + 4 also covered. | Manual full-flow walkthrough on device. |
| Profile | **PASS** | `ProfileScreen.test.tsx` (20) + `EditProfileScreen.test.tsx` (12). Bio-clearing-as-`null` fix is asserted; `birthYear` preservation through Edit is asserted. | Manual edit + restart pass. |
| Photo handling | **PARTIAL → NEEDS MANUAL CHECK** | Permission Alert paths + min/max bounds covered in onboarding/edit tests. Discovery card has graceful fallback to brand-blue initials when `avatarUrl` is missing (verified by code read). API photo upload covered by `test_profile_photos.py` (9). | Real photo library + camera permission flow on a physical device; HEIC/large-image handling. |
| Home / discovery / matching | **PASS** | `DiscoveryScreen.test.tsx` (19) + `useDiscovery.test.tsx` (8) cover loading / error / empty / sport-tab switch / like-pass-save / match banner. Backend `test_discovery.py` (18) covers feed shape, scoring, blocks, action recording, mutual-like → match creation. `test_matches.py` (5) covers match listing. | Manual visual pass with seeded bots in Expo Go. |
| Groups / events | **NOT IMPLEMENTED** | Not part of MVP — no mobile screens or backend routes. Reference Figma export contains group/event UIs but none was translated per the UI-pass scope rules. | Out of scope for first release. Ensure launch copy does not promise group events until implemented. |
| Google Calendar integration | **PARTIAL → NEEDS MANUAL CHECK** | Backend route + service fully implemented: `/auth-url`, `/callback`, `/status`, `/disconnect`, per-booking sync. `/status` now returns `configured: bool` so the mobile gates the Connect button when `GOOGLE_CLIENT_ID` is empty (`test_google_calendar_status.py` covers both branches). `test_google_calendar.py` (17) covers OAuth callback + token storage + disconnect + booking sync. Mobile surfaces an inline error if `/auth-url` fails despite `configured=true`. | Real OAuth consent with real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on a device. |
| Notifications | **PARTIAL → NEEDS MANUAL CHECK** | `test_notifications.py` (13) verifies token registration + processing + dedupe. Internal-token gating in router preserved (fail-closed in non-local). Mobile registration is best-effort and wrapped in try/catch in `RootNavigator.tsx` so failures cannot block auth. | Real push permission prompt + Expo push token landing in backend on device. |
| Safety / reporting | **PASS** | `ReportScreen.test.tsx` (14) covers all reasons, validation, submission, success and error paths, and the disabled/enabled state guard (the brittle test was fixed via a new accessibility label). Backend `test_safety.py` (12) covers report + block + unblock. | Confirm reporting copy + escalation policy with stakeholder; ensure App Store reviewers can see the in-app reporting flow. |
| Backend API | **PASS** | All 199 backend tests green. `test_health.py` covers degraded-state path strictly. `test_seed_bots.py` (12) covers idempotent local seed. | Verify staging/prod env at deploy time; rate-limit + slowapi behavior under load (not in scope here). |
| Config / security | **PARTIAL** | No secrets leaked from grep over `apps/mobile/src` for `Bearer` / `access_token` / `console.log`. `apps/api/.env.example` documents `GOOGLE_CLIENT_ID`, `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, `INTERNAL_API_TOKEN`. `core/security.py` and notifications router fail-closed in `staging`/`production`. | Verify production secret rotation policy; verify CORS origins for staging/prod; verify `bcrypt<4` pin survives CI venv rebuilds. |

## Manual Device Checklist

Execute on a fresh Expo Go install on a real device (iOS first, then Android if available). Check off as completed.

**Cold start**
- [ ] App opens in Expo Go without a crash on a fresh install (no token).
- [ ] Splash shows the current app wordmark briefly, then routes to AuthEntry.
- [ ] AuthEntry renders the dark-blue hero with `Get started` and `Log in` CTAs.

**Auth**
- [ ] Login screen renders with email + password fields.
- [ ] Login with wrong password shows an inline error and does not crash.
- [ ] Login cancel / no-network does not crash; error message is human-readable.
- [ ] Register flow creates an account and routes to OnboardingStep1.
- [ ] Apple Sign-In on iOS opens the native sheet and either signs in or cancels cleanly.
- [ ] Logout returns the user to AuthEntry.

**Onboarding**
- [ ] Step 1: blocked when display name is blank, when birth year is missing, when suburb is missing.
- [ ] Step 1: pick the most-recent birth year (top of the list) — submit succeeds (regression check on the prior `birth_year` schema bug).
- [ ] Step 1: trim whitespace on display name.
- [ ] Step 2: blocked with 0 or 1 photos; allowed with 2–4 photos + bio.
- [ ] Step 2: blocked with whitespace-only bio.
- [ ] Step 3 + 4 complete and route to Main.
- [ ] Killing the app mid-onboarding and reopening returns the user to OnboardingStep1, not Main.

**Profile**
- [ ] Profile tab loads after onboarding and renders display name + suburb + bio + photos.
- [ ] Edit Profile pre-populates fields.
- [ ] Edit Profile saves display name change.
- [ ] Edit Profile saves suburb change via the Select.
- [ ] Edit Profile clears bio (whitespace-only) and the cleared bio survives a restart (sends `null`, not `undefined`).
- [ ] Replace photos picker accepts 2–4 new images.
- [ ] After save, return to Profile shows updated values.
- [ ] Restart app — updated values persist.

**Photos / camera**
- [ ] Photo library permission allow → picker opens.
- [ ] Photo library permission deny → friendly Alert appears, picker does not open, no crash.
- [ ] *(If camera capture is included in this release)* Camera permission allow → camera opens.
- [ ] *(If camera capture is included in this release)* Camera permission deny → friendly Alert, no crash.
- [ ] Profile with missing avatar_url does not crash; brand-blue initials render.

**Discovery**
- [ ] Discovery feed renders with seeded bots after running `python -m scripts.seed_bots` against the same DB.
- [ ] Sport pill chips switch correctly (Gym / Golf / Tennis / Running).
- [ ] Like / Pass / Save actions hit the backend without UI freeze.
- [ ] Empty state renders with the brandSoft glyph + Refresh CTA when no candidates remain.
- [ ] Match banner appears when a mutual like is recorded.

**Safety / reporting**
- [ ] Report screen submit button is disabled before any reason is selected.
- [ ] Report screen submit button is enabled after a reason is selected.
- [ ] Report submission shows the success screen.
- [ ] Report submission failure shows an inline error and does not crash.

**Notifications**
- [ ] Notification permission prompt appears once after first login and not on every relaunch.
- [ ] On allow, push token registers with the backend (verifiable in API logs).
- [ ] On deny, the app continues to function without crashing.

**Google Calendar**
- [ ] With unconfigured backend (no `GOOGLE_CLIENT_ID` in `apps/api/.env`): Profile → Integrations renders the disabled "Calendar sync isn't configured for this build" row. Tapping does not call `/auth-url` (verifiable in API logs).
- [ ] With configured backend: Connect Google Calendar opens the OAuth web view, completes consent, returns to the app, and the row flips to "Disconnect".
- [ ] Disconnect flips back to "Connect Google Calendar".

**Re-entry**
- [ ] Logout, then log back in → same account, same data, same Step-1 gate.
- [ ] Force-quit, relaunch → splash → Main without re-running onboarding.

## Backend / Environment Checklist

**Required env vars** (see `apps/api/.env.example`):

| Variable | Local | Staging | Production |
|---|---|---|---|
| `APP_ENV` | `local` | `staging` | `production` |
| `POSTGRES_URL` | local Postgres | staging | production |
| `REDIS_URL` | local Redis | staging | production |
| `SECRET_KEY` | optional (default warns) | **required** (fail-closed in `core/security.py`) | **required** |
| `FIELD_ENCRYPTION_KEY` | optional (Fernet plaintext sentinel allowed) | **required** before release rehearsal — staging should be production-like so encrypted-at-rest paths are exercised end-to-end | **required** |
| `INTERNAL_API_TOKEN` | optional | **required** for `/internal/*` routes | **required** |
| `GOOGLE_CLIENT_ID` | optional (gates feature) | optional (gates feature) | required if shipping calendar sync |
| `GOOGLE_CLIENT_SECRET` | optional | optional | required if shipping calendar sync |
| `GOOGLE_REDIRECT_URI` | localhost default | staging URL | production URL |
| `APPLE_CLIENT_ID` | empty (Apple disabled) | required if Apple Sign-In on | **required** for App Store |
| `EXPO_PUSH_URL` | default `https://exp.host/...` | default | default or rotated |
| `CORS_ORIGINS` | empty (wildcard) | comma-separated | comma-separated |
| `MEDIA_ROOT` | `media` | container path | object-storage prefix when migrated |
| `MEDIA_URL_PREFIX` | `/media` | `/media` | `/media` (until S3/GCS migration) |

**Other config / runtime checks**:
- [ ] Auth secret is at least 32 bytes (current local default is shorter — `jwt` warns `InsecureKeyLengthWarning`). Production must rotate to a strong random.
- [ ] CORS origins are explicit on staging/prod; wildcard only in local.
- [ ] All migrations applied: `python -m alembic upgrade head` (see `alembic.ini`; em-dash in comments fixed earlier so the CLI works under cp949 default codec).
- [ ] Media storage: local filesystem under `apps/api/media/profile_photos/<user_id>/`. Plan for cloud object storage (S3 / GCS) before scale; the URL-prefix shape stays the same.
- [ ] Google OAuth credentials are Google Cloud Console–issued, the redirect URI is allow-listed, and the backend's `GOOGLE_REDIRECT_URI` matches.
- [ ] Apple auth: `APPLE_CLIENT_ID` matches the iOS bundle identifier; the Sign in with Apple capability is enabled on the App Store Connect provisioning profile.
- [ ] Push notifications: Expo project ID is set in `app.json`; the `EXPO_PUSH_URL` is reachable from the API host; tokens are stored encrypted (Fernet-protected when `FIELD_ENCRYPTION_KEY` is set).
- [ ] Internal token: `/internal/*` routes are protected by `INTERNAL_API_TOKEN` and fail-closed when unset in non-local envs.
- [ ] `bcrypt<4` is honoured by the production venv (the QA pass discovered local venv had `bcrypt 5.0.0`; the pyproject pin is correct, but CI must re-resolve).

## Security and Privacy Review

| Item | Status |
|---|---|
| No obvious mobile-side secret leakage | **PARTIAL** — checked `apps/mobile/src/` for token/header logging; only `Bearer ${_token}` set in `lib/api.ts` (header-only). A full repository secret scan should still be run before public release. |
| No hardcoded tokens or production keys | **PASS** — `.env.example` files document all required keys with empty values. |
| Auth routes protected | **PASS** — every protected route correctly returns 401 without a token (route smoke confirmed). |
| Report / safety flow exists | **PASS** — `/reports`, `/blocks`, `ReportScreen.tsx`, App Store reportability covered. |
| User-generated content / reporting risk | **PARTIAL** — reporting flow exists; moderation policy + escalation SLA are organisational decisions outside this code review. |
| Photo upload / storage risk | **PARTIAL** — photos are stored on the API host's filesystem under `media/profile_photos/<user_id>/`. No object-store yet. Min/max + multipart bounds enforced; size limits left to the FastAPI default. Consider explicit upload size cap before public release. |
| Calendar OAuth data minimisation | **PASS** — only `calendar.events` scope; tokens stored encrypted with Fernet; tokens deleted on `disconnect`. |
| Production logging — no token leakage | **PASS** — no `console.log` of `_token` or `Authorization`; backend logs do not echo password / token bodies. The dev-only `console.warn` in `apps/mobile/src/lib/api.ts` for non-JSON responses prints the URL but truncates the body to 500 chars and never includes the bearer header. |
| Account deletion (Apple Guideline 5.1.1(v)) | **PASS** — `DELETE /auth/me` performs a hard delete across every table that references `users.id`; covered in `test_auth.py`. |

## Known Risks

- **External OAuth flows cannot be fully verified from CLI.** Apple Sign-In and Google Calendar OAuth need a real device + real provider credentials.
- **Physical-device permission flows require manual testing.** Photo library, camera, push notification prompts only fire on actual devices and cannot be exercised from Jest.
- **Pre-existing mobile lint warnings.** `npm run lint` exits non-zero under `--max-warnings 0` due to ~46 soft warnings (test `require()`, `Array<T>` style, one `useCallback` deps shape). Zero errors. Clean-up is a follow-up, not a release blocker.
- **Local / generated folders that must stay untracked.** `apps/api/.venv_win/`, `apps/api/media/`, and `references/` are local/generated artefacts (Windows venv, runtime-written profile photos, Figma reference dump) and must remain untracked.
- **Untracked files belonging to a separate slice.** `apps/mobile/index.js` and `apps/mobile/src/__tests__/RootNavigator.test.tsx` appear to belong to a separate Expo-entrypoint / notification-hardening slice (paired with the dirty `apps/mobile/package.json`, `apps/mobile/src/lib/notifications.ts`, and `apps/mobile/src/navigation/RootNavigator.tsx`). They are not generated; they need their own review before commit and are out of QA scope.
- **Notification / Expo entrypoint dirty-tree changes.** `apps/mobile/package.json`, `apps/mobile/src/lib/notifications.ts`, `apps/mobile/src/navigation/RootNavigator.tsx` carry pre-existing modifications (Expo entrypoint refactor + push-handler hardening). They are out of QA scope and need a separate review pass before they ship.
- **`bcrypt` venv drift.** Pyproject pins `bcrypt<4`; some local venvs have installed `bcrypt 5.x`, which causes 90+ false-failing backend tests via `passlib`. CI/staging must re-resolve from `pyproject.toml` to avoid the same trap.
- **Media on local filesystem.** No object-store migration yet; profile photos persist under the API container's volume. Acceptable for MVP, not for scale.

## Blockers Before Public Release

1. **Real-device auth check** — Apple Sign-In on a provisioned iOS device.
2. **Real-device photo permission check** — allow + deny flows on iOS and Android.
3. **Real-device camera permission check** (only if camera capture is wired in the release scope).
4. **Google Calendar OAuth check** — full connect / disconnect / event-sync round trip with real credentials.
5. **Push notification device check** — token registration end-to-end.
6. **Production / staging env review** — every env var in the table above present, `SECRET_KEY` rotated, `FIELD_ENCRYPTION_KEY` set, `INTERNAL_API_TOKEN` set, CORS origins explicit.
7. **Privacy policy / Terms of Service / safety reporting policy** — copy linked from `apps/mobile/src/lib/legal.ts`, hosted at `PRIVACY_URL` and `TERMS_URL` (Apple Guideline 5.1.1, App Store metadata).
8. **App Store metadata and screenshots** — App Store Connect listing, age rating, support URL, marketing URL, screenshots per device size.
9. **Crash monitoring / logging decision** — Sentry or equivalent on mobile + API; redaction of any PII.
10. **Final clean git status** — only intentional release docs / commits on the release branch; no stray local files.
11. **Run a full repository secret scan** (e.g. `gitleaks`, `trufflehog`, GitHub secret scanning) across all branches before publishing — the reviewer's grep above only covered `apps/mobile/src/`.

## Release Decision

**Current decision: PARTIAL / INTERNAL TESTING CANDIDATE**

**Reason:** Automated tests are passing, but public release should wait until manual device checks and production configuration checks are completed.

The app is suitable for **internal testing** (TestFlight / internal-track Google Play) once a production-shaped backend is reachable and the manual checklist above has been worked through at least once on a single device.

## Next Steps

1. **Complete the manual Expo Go / device checklist** above on at least one iOS device. Record results and any new bugs.
2. **Review and either commit or revert the remaining unrelated mobile dirty files** (`apps/mobile/package.json`, `apps/mobile/src/lib/notifications.ts`, `apps/mobile/src/navigation/RootNavigator.tsx`, `apps/api/pyproject.toml`, untracked `apps/mobile/index.js`, untracked `apps/mobile/src/__tests__/RootNavigator.test.tsx`). They look like a separate Expo-entrypoint + push-handler hardening slice that needs its own review.
3. **Verify staging / prod environment variables** against the table above. Rotate `SECRET_KEY` and set `FIELD_ENCRYPTION_KEY` in production.
4. **Prepare privacy policy / terms / safety reporting notes** — confirm `PRIVACY_URL` and `TERMS_URL` resolve to live, accurate documents.
5. **Prepare App Store / Google Play assets and screenshots** — App Store Connect / Play Console listing. Finalise the app name and branding first; assets and screenshots should be produced after the branding decision is locked so the wordmark, icon, and copy are consistent across stores and in-app surfaces.
6. **Run the full test suite once more before cutting the release branch** — mobile + API + backend route smoke. Re-run after any infra change.
