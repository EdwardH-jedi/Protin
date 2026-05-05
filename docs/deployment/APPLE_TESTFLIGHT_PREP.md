# Protin - Apple / TestFlight Preparation

Practical, conservative status artifact for moving Protin toward internal
TestFlight. Answers four operational questions at a glance:

- What is **configured** in the repo today?
- What is **blocked** (a concrete gap we can see right now)?
- What **Apple-side setup** is still required (external, not code)?
- What is waiting on **real-device** proof?

This document is scoped to Apple / TestFlight preparation. It does not
redesign strategy, rewrite App Store metadata, or make new feature claims.
Every "Next action" below is a pointer for a future slice, not a change this
document performs.

---

## 1. Purpose and Scope

This prep doc exists so one reader can decide, on one pass, whether the
project is ready to kick off an internal TestFlight build. It explicitly
does **not**:

- rewrite `APP_STORE_SUBMISSION.md` (the metadata / reviewer-notes artifact)
- rewrite `RELEASE_GATE_CHECKLIST.md` (the go/no-go gate artifact)
- act as release strategy or marketing copy
- produce App Store screenshots, keywords, or descriptions

The seven prep areas covered here are exactly:

1. iOS app identity and bundle consistency
2. EAS build, signing, and APNs path
3. App Store Connect app-record readiness
4. Privacy policy and support URL readiness
5. Reviewer notes, reviewer contact, and demo account path
6. TestFlight internal readiness
7. Explicit separation from still-missing real-device verification

---

## 2. How to Use This Prep Doc

Status vocabulary used throughout. Pick the one that honestly fits:

| Status                        | Meaning |
|---                            |---|
| configured                    | Already set in the repo or already configured on the Apple side. Cite evidence. |
| blocked                       | A concrete gap in the repo or on the Apple side that prevents this item from moving forward today. |
| Apple-side setup required     | Not satisfiable by code: requires Apple Developer / App Store Connect / APNs work. |
| verify on real device         | Code or config looks right, but a real-iPhone run is required before it can be claimed as working. |

If an item's status is unknown, treat it as `blocked` until someone captures
evidence. Do not use this doc to claim something is configured when the only
evidence is "it should be."

When recording future evidence, include a date and an owner. Evidence
without a date is not evidence.

---

## 3. Current Prep-Status Summary

Snapshot of where the seven areas stand right now, in plain present tense.

- **Bundle identity** is `com.edh1223.protin` in both `apps/mobile/app.config.js`
  (iOS) and the Android package field. Same identifier is assumed by
  `APP_STORE_SUBMISSION.md`. It is `configured` in the repo; the matching
  App Store Connect app record and APNs capability on that bundle ID remain
  `Apple-side setup required`.
- **EAS build path** has three profiles (development, preview, production).
  Production targets `https://protin-api.fly.dev` and `autoIncrement: true`.
  The `submit.production.ios` block still has placeholders for `ascAppId`
  and `appleTeamId`; until those are replaced, `eas submit` cannot run.
  Signing credentials and APNs entitlement are `Apple-side setup required`.
- **App Store Connect app record** is `Apple-side setup required`. No ASC
  App ID is captured anywhere in the repo. `APP_STORE_SUBMISSION.md` has a
  one-time prerequisites block that captures what needs doing.
- **Privacy policy / support URLs** are `hosted, env wiring pending`. The
  static site at `apps/web/site/` is deployed to Netlify and all four
  canonical routes resolve over HTTPS today:
  - `https://sportgang.netlify.app/`
  - `https://sportgang.netlify.app/privacy/`
  - `https://sportgang.netlify.app/terms/`
  - `https://sportgang.netlify.app/support/`
  The sources at `docs/legal/PRIVACY_POLICY.md` and
  `docs/legal/TERMS_OF_SERVICE.md` remain the markdown reference. The
  `apps/mobile/src/lib/legal.ts` constants and the EAS env values
  (`EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`,
  `EXPO_PUBLIC_SUPPORT_URL`) are not yet pinned to the live URLs in this
  slice — see §4.4 and the Legal/support URL verification checklist
  below for the exact values and the `eas env:create` commands.
- **Reviewer notes / contact / demo account** are `blocked`. The notes
  template exists in `APP_STORE_SUBMISSION.md` section 7, but it requires a
  seeded review account that depends on `apps/api/scripts/seed_review_data.py`,
  which does not exist yet.
- **TestFlight internal readiness** is `blocked` on two of: `eas.json`
  placeholders and the reviewer demo account path. `apps/mobile/assets/`
  now contains placeholder `icon.png`, `splash.png`, and
  `notification-icon.png` so config evaluation no longer fails on missing
  files. Final App Store artwork must replace these placeholders before
  public submission.
- **Real-device verification** is `verify on real device` across the five
  priority areas listed in `RELEASE_GATE_CHECKLIST.md` section 4. No
  real-iPhone run has been recorded.

Detailed area-by-area tables follow.

---

## 4. Area-by-Area Status

### 4.1 iOS app identity / bundle consistency

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| iOS `bundleIdentifier` | configured | `apps/mobile/app.config.js:49` -> `ios.bundleIdentifier = "com.edh1223.protin"` | Use this exact string when creating the App Store Connect app record. |
| Android `package` matches | configured | `apps/mobile/app.config.js:61` -> `android.package = "com.edh1223.protin"` | None. |
| App name / slug / version | configured | `app.config.js` -> `name: "Protin"`, `slug: "protin"`, `version: "1.0.0"`, `ios.buildNumber: "1"` | Bump `version` only for user-visible release; `autoIncrement` handles build number on production profile. |
| ASC app record uses same bundle | Apple-side setup required | No ASC App ID captured in-repo | Create the ASC app record with `Bundle ID = com.edh1223.protin`. Capture the generated ASC App ID. |
| APNs capability enabled on the bundle ID | Apple-side setup required | Not verifiable from the repo | Enable "Push Notifications" on the bundle ID in the Apple Developer portal once the app record exists. |

### 4.2 EAS build / signing / APNs path

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| EAS production profile | configured | `apps/mobile/eas.json` -> `build.production` sets `autoIncrement: true` and `EXPO_PUBLIC_API_URL = https://protin-api.fly.dev` | None. |
| EAS preview profile | configured | `eas.json` -> `build.preview` uses internal distribution against `https://protin-api.fly.dev` | None. |
| HTTPS API URL enforcement | configured | `app.config.js` `resolveApiUrl()` throws at config-eval when `APP_ENV=production` and the URL is missing / not `https://` | None. |
| Expo notifications plugin | configured | `app.config.js` declares `expo-notifications` with an icon + color | Icon path depends on `apps/mobile/assets/notification-icon.png` (see 4.6 blockers). |
| iOS `UIBackgroundModes` for push | configured | `app.config.js:57` -> `infoPlist.UIBackgroundModes = ["remote-notification"]` | None until APNs entitlement lands. |
| Signing credentials | Apple-side setup required | Not verifiable from the repo | On first `eas build --platform ios --profile production`, accept the EAS-managed credentials flow (or upload a team-owned cert). Capture the Team ID into `eas.json`. |
| `ascAppId` in `eas.json` | blocked | `eas.json:30` still has `"REPLACE_WITH_APP_STORE_CONNECT_APP_ID"` | Replace with the real ASC App ID after the App Store Connect record is created. |
| `appleTeamId` in `eas.json` | blocked | `eas.json:31` still has `"REPLACE_WITH_APPLE_TEAM_ID"` | Replace with the real Apple Team ID. |
| APNs delivery to a real iPhone | verify on real device | Backend notification path is covered by tests; APNs is not | After the bundle-ID APNs capability is enabled and an EAS build is installed on a device, exercise `POST /notifications/token` then trigger a send and confirm arrival. |

### 4.3 App Store Connect app-record readiness

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| Apple Developer Program enrolled | Apple-side setup required | Not verifiable from the repo | Enroll ($99/yr); capture the Team ID. |
| ASC app record created | Apple-side setup required | Not verifiable from the repo | Create `Protin`, Platform `iOS`, Primary language `English (Australia)`, Bundle ID `com.edh1223.protin`, SKU `protin-ios-1` (or equivalent). See `APP_STORE_SUBMISSION.md` section 1. |
| ASC App ID captured | Apple-side setup required | Not in `eas.json` | After record creation, paste into `eas.json` `submit.production.ios.ascAppId` and confirm `eas submit --platform ios --latest` resolves. |
| App Privacy questionnaire answered | Apple-side setup required | `APP_STORE_SUBMISSION.md` section 4 holds the intended answers | Enter the answers exactly as documented; if Sentry DSN is not shipped, switch the two Sentry rows to `No`. |
| Age rating questionnaire | Apple-side setup required | Template in `APP_STORE_SUBMISSION.md` section 5 | Answer per the template (user-generated content is `Infrequent/Mild`, everything else `None`; target rating 12+). |

### 4.4 Privacy policy / support URL readiness

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| Privacy policy source in repo | configured | `docs/legal/PRIVACY_POLICY.md` | None. |
| Terms of service source in repo | configured | `docs/legal/TERMS_OF_SERVICE.md` | None. |
| Static site published | configured | `apps/web/site/` deployed to Netlify; canonical host `https://sportgang.netlify.app/`. Routes `/`, `/privacy/`, `/terms/`, `/support/` all serve `200 OK` HTML. | None for the Netlify deployment. **Open:** swap to a final custom domain if/when the operator pins one. |
| Privacy Policy public URL | configured | Live at `https://sportgang.netlify.app/privacy/` | Pin into `EXPO_PUBLIC_PRIVACY_URL` on EAS production + preview (and update `apps/mobile/src/lib/legal.ts` defaults if/when the env-driven flow is replaced). Rebuild. |
| Terms public URL | configured | Live at `https://sportgang.netlify.app/terms/` | Pin into `EXPO_PUBLIC_TERMS_URL`. Rebuild. |
| Support URL | configured | Live at `https://sportgang.netlify.app/support/` | Pin into `EXPO_PUBLIC_SUPPORT_URL`. Same address must appear in App Store Connect "App Review Contact" form once a real `support@` mailbox exists. |
| URLs reachable from outside the build environment | configured | Confirmed live by the operator after Netlify deploy. | Re-verify after any custom-domain switch — see the Legal/support URL verification checklist below. |
| EAS env values pinned | blocked | `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_URL` not yet set on EAS profiles. | Run the `eas env:create` commands in `APP_STORE_METADATA.md` §8 against `--environment production` and `--environment preview`. |

### 4.5 Reviewer notes / contact / demo account path

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| Review notes block | configured | Template verbatim in `APP_STORE_SUBMISSION.md` section 7 | Fill in real email, phone, and the seeded credentials at submission time. |
| Reviewer demo account | blocked | `apps/api/scripts/seed_review_data.py` does not exist; `apps/api/scripts/` directory does not exist | Write the seed script, run against staging, capture the generated credentials for the review notes. |
| Required review test data (2 seeded partners + pending booking + 1 chat history) | blocked | Same script dependency | Same as above; seed data shape is described in `APP_STORE_SUBMISSION.md` section 6. |
| Reviewer contact info | Apple-side setup required | Not in repo | Capture real name + email + phone for the ASC App Review Contact form. |
| Sign in with Apple path for reviewers | configured (but not verified on device) | Backend `POST /auth/apple` + mobile `LoginScreen.tsx` button, iOS-gated, plus `APPLE_CLIENT_ID` documented in `.env.staging.example` | Set `APPLE_CLIENT_ID = com.edh1223.protin` on the deployed backend; then `verify on real device`. |

### 4.6 TestFlight internal readiness

| Item | Status | Evidence / what is missing | Next action |
|---|---|---|---|
| `apps/mobile/assets/` directory | configured (placeholder) | Directory exists with placeholder `icon.png` (1024x1024), `splash.png`, and `notification-icon.png`. `app.config.js` wires `icon` + `splash.image`. Android `adaptiveIcon.foregroundImage` is intentionally not wired yet — Expo falls back to `icon` for the adaptive icon, which is acceptable for internal TestFlight | Replace placeholder PNGs with final App Store artwork (see §6.1) and wire `android.adaptiveIcon.foregroundImage` before public submission. |
| Production API URL available over HTTPS | verify on real device | `eas.json` production profile points at `https://protin-api.fly.dev`; no session has probed it | Run `curl -I https://protin-api.fly.dev/health` after the next deploy and record the status code + version header. |
| `eas build --platform ios --profile production` produces a green IPA | blocked | Missing assets + placeholders make the first build predictably fail | Land assets, fill `eas.json` identifiers, then run the build. |
| `eas submit --platform ios --latest` | blocked | Depends on the green build + real ASC/Team IDs | Run after the build, gated by the Apple-side setup rows above. |
| TestFlight internal tester group | Apple-side setup required | No group exists yet | In App Store Connect -> TestFlight -> Internal Testing, add at least 2 humans to an internal group and associate the build. |
| At least one dated internal tester run on device | verify on real device | No dated run recorded | Have an internal tester install via TestFlight and exercise the core flow end to end; capture the date and any blockers. |

### 4.7 Explicit separation from still-missing real-device verification

Items in this table are **not** Apple-side setup. They only move forward once
the build is on a real iPhone and exercised. Apple-side items in 4.1-4.6
above can in principle be prepared in parallel.

| Device check | Status | Depends on |
|---|---|---|
| Email / password register, logout, re-login on real iPhone | verify on real device | Deployed backend + TestFlight build |
| Session restore across app kill and relaunch | verify on real device | Same |
| Sign in with Apple against live backend | verify on real device | Backend has `APPLE_CLIENT_ID` set + TestFlight build |
| Delete-account full flow on device | verify on real device | TestFlight build |
| Push permission prompt | verify on real device | EAS build + APNs capability enabled |
| Expo push token registered via `POST /notifications/token` | verify on real device | Same |
| Backend-triggered push arrives on device | verify on real device | Same + backend can reach Expo push service |
| Tap on push opens the intended screen | verify on real device | Same |
| Calendar permission prompt and add-to-calendar flow | verify on real device | TestFlight build |
| Onboarding end-to-end on real iPhone | verify on real device | TestFlight build |

None of these can be `configured`. Each needs a dated run, an owner, and a
pass / fail note in `RELEASE_GATE_CHECKLIST.md` section 4 before the matching
Apple / TestFlight gate passes.

---

### 4.8 Legal/support URL verification

The static legal/marketing site is deployed to Netlify at
`https://sportgang.netlify.app/`. Run this checklist any time the host
changes (e.g. custom-domain swap), the `apps/web/site/` content is
re-deployed, or before submitting a new TestFlight build that depends on
the in-app legal links.

Canonical URLs to verify:

- `https://sportgang.netlify.app/`
- `https://sportgang.netlify.app/privacy/`
- `https://sportgang.netlify.app/terms/`
- `https://sportgang.netlify.app/support/`

Checklist:

- [ ] Open `https://sportgang.netlify.app/` in a desktop browser; page
      loads, `200 OK`, no console errors.
- [ ] Open `https://sportgang.netlify.app/privacy/`; page renders the
      Privacy Policy.
- [ ] Open `https://sportgang.netlify.app/terms/`; page renders the
      Terms of Service.
- [ ] Open `https://sportgang.netlify.app/support/`; page renders the
      Support / contact page.
- [ ] From a TestFlight or local mobile build with the env vars below set,
      tap each legal link in `Profile -> Legal` and confirm the in-app
      browser opens the correct hosted page.
- [ ] Confirm EAS env values are set on the **production** profile:
      ```
      EXPO_PUBLIC_PRIVACY_URL=https://sportgang.netlify.app/privacy/
      EXPO_PUBLIC_TERMS_URL=https://sportgang.netlify.app/terms/
      EXPO_PUBLIC_SUPPORT_URL=https://sportgang.netlify.app/support/
      ```
- [ ] Confirm the same three EAS env values are set on the **preview**
      profile so internal-distribution builds also resolve the legal
      links.

Example EAS commands (run from a shell with `eas-cli` authenticated to
the project; values are public and safe to log):

```
eas env:create --environment production --name EXPO_PUBLIC_PRIVACY_URL --value https://sportgang.netlify.app/privacy/
eas env:create --environment production --name EXPO_PUBLIC_TERMS_URL   --value https://sportgang.netlify.app/terms/
eas env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL --value https://sportgang.netlify.app/support/

eas env:create --environment preview    --name EXPO_PUBLIC_PRIVACY_URL --value https://sportgang.netlify.app/privacy/
eas env:create --environment preview    --name EXPO_PUBLIC_TERMS_URL   --value https://sportgang.netlify.app/terms/
eas env:create --environment preview    --name EXPO_PUBLIC_SUPPORT_URL --value https://sportgang.netlify.app/support/
```

If any value is already set, use `eas env:update` (same flags) instead of
`:create`. Re-run this whole checklist after a custom-domain swap.

---

## 5. Immediate Blockers Before Internal TestFlight

An internal TestFlight build is not producible today. The minimum set of
blockers to clear, in dependency order:

1. **`apps/mobile/assets/` populated.** Done with placeholder PNGs
   (`icon.png` 1024x1024, `splash.png`, `notification-icon.png`) and
   `app.config.js` now wires `icon` and `splash.image`. Final App Store
   artwork must replace these placeholders before public submission.
   Android `adaptiveIcon.foregroundImage` is still TODO; the fallback to
   `icon` is acceptable for internal TestFlight.
2. **Apple Developer Program enrollment.** Needed to create the ASC app
   record, generate signing credentials, and enable APNs on the bundle ID.
3. **ASC app record created with `com.edh1223.protin`.** Capture the ASC
   App ID and Team ID. Paste both into `apps/mobile/eas.json`, replacing
   the `REPLACE_WITH_*` placeholders.
4. **APNs capability enabled on the bundle ID.** Without this, any claim
   of push readiness is unsupportable.
5. **Signing credentials accepted on first `eas build`.** EAS-managed is
   the default; a team-owned certificate is acceptable.
6. **First green `eas build --platform ios --profile production`.**
7. **Upload via `eas submit --platform ios --latest`.**
8. **TestFlight internal tester group with at least 2 humans** associated
   with that build.

Items 1, 3 (the placeholder swap), and the `APPLE_CLIENT_ID` on the
deployed backend are the three things a contributor can do inside the repo
or its immediate config surface. Items 2, 4, 5, 7, and 8 are Apple-side.

Gate 3 (submission prep) additionally requires the privacy/terms/support
URLs and the reviewer demo account path from sections 4.4 and 4.5.

---

## 6. Waiting on Real-Device Verification

These do not block internal TestFlight setup, but they block claims of
readiness. The full list lives in `RELEASE_GATE_CHECKLIST.md` section 4
(subsections 4.1 through 4.5). Summary pointer:

- Auth lifecycle on real iPhone (email+password, Apple sign-in, session
  restore, re-login, logout).
- Delete-account end-to-end on device and post-delete state.
- Push: permission prompt, token registration via `POST /notifications/token`,
  backend-triggered delivery, tap routing, denial path.
- Google Calendar: permission prompt, event landing on device calendar,
  denial-path non-regression.
- Onboarding: full three-step flow + cold-start land on Discovery feed.

Until each row has a dated device run, the matching `verify on real device`
entries in sections 4.1-4.6 above do not flip to `configured`.

---

## 6.1 Placeholder asset replacement before public submission

`apps/mobile/assets/icon.png`, `apps/mobile/assets/splash.png`, and
`apps/mobile/assets/notification-icon.png` are placeholder PNGs generated
for internal config validation. They are intentionally minimal (lime
brand background + dark "SG" wordmark) and are **not** the final
App Store artwork. Before public submission:

- Replace `assets/icon.png` with a final 1024x1024 RGB PNG (no
  transparency, no rounded corners — Apple applies the iOS mask).
- Replace `assets/splash.png` with the final centered splash artwork.
  Keep the surrounding canvas the brand lime (`#C6FF3D`) so it tiles
  seamlessly with the native splash background.
- Replace `assets/notification-icon.png` with the final monochrome
  notification icon (white silhouette on transparent — Android tints
  it with the notification accent color).
- Add `android.adaptiveIcon.foregroundImage` once the Android adaptive
  icon foreground is finalized.

No fake App Store / Apple Team ID values were introduced for this slice.
The `eas.json` `submit.production.ios.ascAppId` and `appleTeamId`
placeholders remain `REPLACE_WITH_*` and are documented as Apple-side
setup in §4.2; both must be filled before `eas submit` can run.

No fake Firebase credential files were introduced. `app.config.js`
already gates `googleServicesFile` resolution behind `isStrictBuild()`
so a missing `google-services.json` / `GoogleService-Info.plist` does
not break local config evaluation; it only throws on
`APP_ENV=staging|production` or `EAS_BUILD_PROFILE=preview|production`.

---

## 7. Relationship to Companion Docs

Short pointers only. Do not duplicate content from these here.

- `docs/deployment/APP_STORE_SUBMISSION.md` - field-by-field ASC metadata,
  the reviewer notes template, and the screenshot plan. This prep doc does
  not rewrite any of that; if the current submission doc has conflicting
  details about assets, seed script, or placeholder identifiers, treat this
  prep doc as the current source of truth for prep status and update the
  submission doc in a separate slice.
- `docs/deployment/RELEASE_GATE_CHECKLIST.md` - the go/no-go artifact.
  Section 4 tracks device verification; section 5 tracks Apple-side setup;
  section 6 tracks blockers. This prep doc does not duplicate that tracking;
  it provides a more detailed, prep-focused view of the same items that
  maps directly to `configured | blocked | Apple-side setup required |
  verify on real device` so a contributor can act on them this week.
- `docs/deployment/RELEASE_RUNBOOK.md` - the build and submit mechanics.
  Use it when running the actual `fly deploy`, `eas build`, and `eas submit`
  commands once the blockers above are cleared.
- `docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS_OF_SERVICE.md` -
  source-of-truth markdown for the legal pages that still need a public URL.
