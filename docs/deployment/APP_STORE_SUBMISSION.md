# Protin - App Store submission checklist

> **Scope note.** This document is the **metadata / template reference**
> for the App Store Connect submission forms (field values, reviewer-notes
> copy, screenshot plan). It is not the current prep-status artifact.
> Current Apple / TestFlight preparation status lives in
> `docs/deployment/APPLE_TESTFLIGHT_PREP.md`. Where the two conflict,
> treat APPLE_TESTFLIGHT_PREP.md as the source of truth for *what is
> configured / blocked right now* and treat this file as the source of
> truth for *what values go into which ASC form at submission time*.

Everything you need to fill in App Store Connect, grouped by screen. Pre-filled
where engineering has a defensible answer; `[BRACKETED]` means you decide.

Companion documents:
- Current Apple / TestFlight prep status: `docs/deployment/APPLE_TESTFLIGHT_PREP.md`
- Build and submit mechanics: `docs/deployment/RELEASE_RUNBOOK.md`
- Privacy + terms: `docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS_OF_SERVICE.md`

---

## 0. Implementation status snapshot

Split between what the repo already supports today (no engineering work needed) and what still has to happen before you can submit. Every "still required" item is expanded in section 11 or in its relevant section below.

### Already implemented

| Requirement | Evidence |
|---|---|
| In-app account deletion (Apple rule 5.1.1(v)) | `DELETE /auth/me` in `apps/api/app/routers/auth.py`; "Delete my account" button on the Profile screen |
| Sign in with Apple (rule 5.1.1(c)) | `POST /auth/apple` verifies the identity token and creates-or-links the user; mobile uses `expo-apple-authentication`, `Platform.OS === 'ios'`-gated on the login screen |
| Email / password sign-in | `POST /auth/register`, `POST /auth/login` |
| Legal links visible in-app | `apps/mobile/src/lib/legal.ts`; Register footer + Profile -> Legal section |
| Privacy-compliant crash reporting | `@sentry/react-native/expo` plugin in `apps/mobile/app.config.js` |
| Push notifications plumbing | `expo-notifications` plugin + iOS `UIBackgroundModes: ["remote-notification"]` |
| iOS calendar integration | `NSCalendarsUsageDescription` set; `apps/mobile/src/lib/calendar.ts` |
| HTTPS-only production API URL | `apps/mobile/app.config.js` throws at `eas build` time if `EXPO_PUBLIC_API_URL` is not `https://` under `APP_ENV=production` |
| Staging / production field-encryption enforcement | `validate_encryption_config` refuses to start without `FIELD_ENCRYPTION_KEY` in staging + production (`apps/api/app/core/encryption.py`) |
| Privacy policy + terms docs (source) | `docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS_OF_SERVICE.md` |

### Still required before submission

- `apps/mobile/assets/` does not yet exist in the repo. `app.config.js` directly references `./assets/notification-icon.png` (under the `expo-notifications` plugin) - `eas build` fails on a missing path. App icon, splash image, and Android adaptive-icon foreground are not currently referenced in `app.config.js`, so Expo would fall back to template defaults that will not pass App Store visual review; add them (and the matching `ios.icon`, `android.adaptiveIcon`, `splash.image` keys) before the first production build.
- `apps/api/scripts/seed_review_data.py` does not exist. The review test account + two seed accounts + a pending booking (see section 6) depend on it.
- `apps/mobile/eas.json` still contains `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` and `REPLACE_WITH_APPLE_TEAM_ID` - replace both before `eas submit`.
- Hosted URLs for the legal docs are **live** on Netlify at `https://sportgang.netlify.app/{privacy,terms,support}/`, and the matching `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and `EXPO_PUBLIC_SUPPORT_URL` values are pinned on the EAS `preview` and `production` environments (verify with `eas env:list --environment {preview,production}`). Same values also live in the env example files (`apps/mobile/.env.example`, `apps/mobile/.env.staging.example`, `.env.example`) for local Expo runs. Remaining: a dated real-device tap-through of all five in-app legal/support links — see `docs/deployment/APPLE_TESTFLIGHT_PREP.md` §4.8.
- Fly secrets: `APPLE_CLIENT_ID=com.edh1223.protin`, `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`. Without these the staging / production API refuses to boot and the `/auth/apple` endpoint returns 503.
- Screenshots at both required iPhone sizes (section 9), 6 per size.
- Apple Developer Program enrolment + ASC account (section Prerequisites).
- TestFlight internal test with at least 2 human testers.

Subscriptions / in-app purchases are **not** implemented. Do not select any IAP options in App Store Connect; the privacy answers in section 4 must continue to reflect this.

---

## Prerequisites (one-time)

- [ ] **Apple Developer Program** enrolled - $99/yr, ~24-48h approval. Use an individual or business entity - whichever is on the privacy policy legal entity line.
- [ ] **App Store Connect** account linked to the Developer Program.
- [ ] **Apple Team ID** captured - used in `apps/mobile/eas.json` (`appleTeamId`).
- [ ] **App Store Connect App ID (ASC App ID)** captured after the app record is created - also used in `apps/mobile/eas.json` (`ascAppId`).

---

## 1. App record creation (App Store Connect -> My Apps -> +)

| Field | Value |
|---|---|
| Platform | iOS |
| Name | **Protin** |
| Primary language | English (Australia) |
| Bundle ID | `com.edh1223.protin` (must match `apps/mobile/app.config.js`) |
| SKU | `protin-ios-1` (internal; any unique string) |
| User access | Full access (default) |

After creation, save the generated **ASC App ID** into `apps/mobile/eas.json` -> `submit.production.ios.ascAppId`.

---

## 2. App Information

| Field | Value / guidance |
|---|---|
| Subtitle (30 chars) | `[Find a workout partner]` - iterate on copy; this is shown under the app name |
| Category - Primary | **Health & Fitness** (product-direction fit; "Social Networking" is viable but draws more review scrutiny) |
| Category - Secondary | **Sports** |
| Content Rights | No - app does not contain, show, or access third-party content |
| Age Rating | See section 5 below - answer the questionnaire to generate |

---

## 3. Pricing and Availability

| Field | Value |
|---|---|
| Price | Free |
| Availability | Start with **Australia only** at launch. Expand after 1-2 review cycles. Reduces localisation review scope. |

---

## 4. App Privacy (this is where most rejections happen - fill carefully)

Source of truth: `docs/legal/PRIVACY_POLICY.md` section 2. Apple's privacy questionnaire maps to these answers:

| Data type | Collected? | Linked to user? | Used for tracking? | Purposes |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality |
| Name | Yes (display name; optional Apple name) | Yes | No | App Functionality |
| User ID (Apple / Google sub) | Yes | Yes | No | App Functionality, Authentication |
| Coarse Location | No | - | - | - |
| Precise Location | No | - | - | - |
| Health & Fitness | No | - | - | - |
| Other User Content (chat messages, bio, bookings) | Yes | Yes | No | App Functionality |
| Customer Support | No at launch | - | - | - |
| Crash Data (Sentry) | Yes[1] | No | No | App Functionality, Analytics |
| Performance Data (Sentry) | Yes[1] | No | No | App Functionality, Analytics |
| Other Diagnostic Data | No | - | - | - |
| Purchases | No | - | - | - |
| Search History | No | - | - | - |
| Browsing History | No | - | - | - |
| Identifiers - Device ID | No (Expo push token is a service-scoped push identifier, not IDFA) | - | - | - |

- **Privacy Policy URL** (required): `https://sportgang.netlify.app/privacy/` — live on Netlify; serves the rendered Privacy Policy at the canonical hosted site (`apps/web/site/privacy/index.html`). Replace with a final custom-domain URL if/when one is pinned.

[1] Sentry only initialises when `EXPO_PUBLIC_SENTRY_DSN` is set at build time (`apps/mobile/App.tsx`). If you ship without a DSN, switch the two Sentry rows to **No** in the App Privacy questionnaire - collecting nothing is fine; mis-declaring is what triggers a 5.1.2 rejection.

---

## 5. Age Rating questionnaire

Answer **None** to everything, with two exceptions:

| Question | Answer | Why |
|---|---|---|
| Unrestricted Web Access | None | No in-app webviews for arbitrary URLs |
| User Generated Content (chat, profiles, bookings) | **Frequent/Intense** | Chat is a core, frequently-used surface and the product coordinates real-world meet-ups between strangers. Answering honestly here is the basis for the recommended 17+ target below. Do NOT say None; Apple will catch it and reject under 5.1.2. |
| Contests | None | - |
| Unrestricted Internet Access | None | - |
| Medical / Treatment Information | None | No medical claims |
| Gambling | None | - |
| Horror / Fear Themes | None | - |
| Mature / Suggestive Themes | None | - |
| Profanity or Crude Humor | None | - |
| Alcohol, Tobacco, or Drug Use or References | None | - |
| Violence - Cartoon or Fantasy | None | - |
| Violence - Realistic | None | - |
| Sexual Content or Nudity | None | - |

Recommended conservative age-rating target: **17+** due to user
profiles, chat, and real-world sports session coordination. Final
rating must be confirmed in App Store Connect's age-rating
questionnaire — Apple has not assigned any rating yet. Aligned with
`docs/release/APP_STORE_METADATA.md` §7 and
`docs/deployment/APPLE_TESTFLIGHT_PREP.md` §4.3.

---

## 6. App Review Information

| Field | Value |
|---|---|
| Sign-in required | **Yes** |
| Demo account username | `[review-tester@protin.app]` - create before submission |
| Demo account password | `[generated-strong-password]` |
| Notes | See section 7 "Review notes" below - paste the full block |
| Contact info | Your real name, email, and phone |
| Attachment | Optional; include a 30-second screen-recording of the core flow if the review team has previously requested clarification |

### Required test data (seed before enabling TestFlight review)

The app has no real users at launch - reviewers will bounce if they can't see any activity. Seed at minimum:

- **Reviewer's account** (the one above): already onboarded with a complete profile, 2 sport profiles, and identity preferences set.
- **Two additional seeded accounts** matched with the reviewer: one with a confirmed booking scheduled 2 days out, one with a chat history (3-5 non-offensive messages).
- **One proposed booking** awaiting the reviewer's confirmation (lets them exercise the confirm flow).

A seed script belongs in `apps/api/scripts/seed_review_data.py`. **This script does not exist in the repo today** - the `apps/api/scripts/` directory itself has not been created. Write it (and check it in) before enabling TestFlight external review, and invoke it as a one-shot against the staging database with the review credentials.

---

## 7. Review notes (paste verbatim)

The canonical v1 review-notes block lives in
`docs/release/APP_STORE_METADATA.md` §9. Paste that block verbatim
into the App Store Connect "Notes" field. The metadata doc is kept
in lockstep with the actual shipped flows (Discovery → Connect →
Chat → propose a session → Accept/Decline → Events tab → safety
controls → delete-account); the older version that lived here used
swipe / Add-to-Calendar / push framing that no longer matches the v1
build.

Paste credentials into the App Store Connect "App Review
Information" panel only — never into this repo, this file, or the
review-notes block itself (see §6 Required test data).

---

## 8. Marketing metadata

| Field | Character limit | Source of truth |
|---|---|---|
| Promotional Text | 170 | `APP_STORE_METADATA.md` §2 (editable without a new build). |
| Description | 4000 | `APP_STORE_METADATA.md` §4. The canonical v1 description there reflects the shipped flows: discovery → connect → chat → propose a session with court/venue → Accept/Decline → Events tab → Privacy/Terms/Support. The earlier draft that lived here used "Protin" branding, swipe/like/pass/save framing, and Google Calendar copy that no longer match v1; do not use it. |
| Keywords | 100 (comma-separated) | `APP_STORE_METADATA.md` §5. The earlier draft that lived here (`workout partner,gym buddy,…,matchmaking,…`) carried dating-app vocabulary (`matchmaking`) and is superseded. |
| Support URL | - | `https://sportgang.netlify.app/support/` — live on Netlify (`apps/web/site/support/index.html`). Required field; same address must align with the App Review Contact email once a real `support@` mailbox exists. |
| Marketing URL | - | `https://sportgang.netlify.app/` — optional in ASC; the Netlify-hosted home page is reachable today, so it can be supplied. Replace with a custom domain if/when one is pinned. |

The metadata doc is the single source of truth for App Store text;
this submission doc only carries the field-by-field ASC submission
mechanics. If the two ever diverge, treat `APP_STORE_METADATA.md` as
canonical and update this file in lockstep.

---

## 9. Screenshots

Required sizes for the 2024+ App Store:

| Device class | Resolution | Count |
|---|---|---|
| iPhone 6.9" (Pro Max, 16 Pro Max) | 1290 x 2796 px, portrait | 3-10 |
| iPhone 6.5" (Plus / Pro Max pre-16) | 1242 x 2688 px, portrait | 3-10 |
| iPad (optional since we set `supportsTablet: false`) | - | skip |

### Suggested screenshot lineup (6 screenshots in this order - Apple shows the first 3 in search results)

The final v1 screenshot package is committed at
`docs/release/screenshots/ios/`; surface choices and captions are
defined in `APP_STORE_METADATA.md` §11. The lineup below mirrors
that single source of truth and replaces an earlier draft that
referenced an "Add to Calendar" booking detail and a sign-in
screenshot — neither of which is in the final v1 package.

1. `01-discovery-gym-partners.png` — `DiscoveryScreen` filtered to Gym. The core loop; first impression in the search-results card.
2. `02-matches-message-previews.png` — `MatchesScreen`. Mutual-interest match list with chat previews so the conversion path from match to chat is obvious.
3. `03-chat-confirmed-session.png` — `ChatScreen` with a confirmed session card. Shows the 1:1 chat surface AND the confirmed session card.
4. `04-events-sessions.png` — `EventsScreen`. Upcoming sessions and Pending proposals in one tab.
5. `05-propose-session-form.png` — `BookingComposerScreen` (Propose a session). Date / time / venue picker.
6. `08-profile-legal-account.png` — `ProfileScreen`. Privacy / Terms / Support links and the Delete-account affordance. Visible proof of the §7 review-notes claims for App Review §5.1.1(v).

Per-device-class capture (iPhone 16 Pro Max 6.9", iPhone 14 Plus 6.5") at the resolutions in the table above is still PENDING — the local PNGs are a single capture set, not the per-device variants ASC requires.

### How to capture

- Use the iOS Simulator in Xcode -> **Device** -> **iPhone 16 Pro Max** (6.9") and **iPhone 14 Plus** (6.5").
- Build with the review seed data loaded.
- `File -> Save Screen` (Cmd+S) while the app is in foreground.
- Avoid the system status bar clock drift: run `xcrun simctl status_bar <device> override --time "9:41"` to lock the time to 9:41 (Apple's convention).

---

## 10. Build upload (via EAS)

From `apps/mobile/`:

```
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Full details and rollback in `docs/deployment/RELEASE_RUNBOOK.md`.

---

## 11. Final pre-submit checklist

- [ ] Apple Developer enrolment complete, Team ID captured
- [ ] ASC App ID captured and pasted into `apps/mobile/eas.json`
- [x] Privacy Policy, Terms of Service, and Support pages hosted on Netlify at `https://sportgang.netlify.app/{privacy,terms,support}/` (open follow-up: optional swap to a final custom domain)
- [x] `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_URL` set on EAS preview + production profiles to the Netlify URLs above. Verify with `eas env:list --environment {preview,production}` (see `docs/deployment/APPLE_TESTFLIGHT_PREP.md` §4.8)
- [ ] Legal doc URLs reflected in `apps/mobile/src/lib/legal.ts` defaults if/when the env-driven flow is replaced (env values above are already documented in `apps/mobile/.env.example`, `apps/mobile/.env.staging.example`, and `.env.example`)
- [ ] `apps/mobile/assets/` created and populated. `notification-icon.png` is hard-required by `app.config.js`; app icon (1024x1024 for iOS), splash image, and Android adaptive-icon foreground need to be added and wired into `app.config.js` for App Store visual review to pass.
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set for the production `eas build` profile **iff** you want crash reporting at launch. If unset, downgrade the two Sentry rows in section 4 to "No".
- [ ] `APPLE_CLIENT_ID=com.edh1223.protin` set as a Fly secret
- [ ] `SECRET_KEY` and `FIELD_ENCRYPTION_KEY` set as Fly secrets (app refuses to start without them in staging/prod)
- [ ] Fly deploy green, `/health` returns ok over HTTPS
- [ ] Review test account seeded, credentials captured for section 6 above
- [ ] 6 screenshots rendered at both required sizes
- [ ] `eas build` produces a green artifact
- [ ] TestFlight internal testing with at least 2 real human testers before hitting "Submit for Review"

---

## 12. Rejection recovery

Review takes 24-48h. Common first-round rejections for this app category:

| Rejection reason | Likely fix |
|---|---|
| 5.1.1(v) - no in-app account deletion | Confirm the Delete button is visible and actually calls `DELETE /auth/me`. It's wired - this shouldn't happen. |
| 5.1.1(c) - missing Sign in with Apple | Confirm the button renders on iOS builds. It's `Platform.OS === 'ios'`-gated. |
| 2.1 - app crashes on review | Sentry should capture the trace. Check Sentry dashboard first, then TestFlight crash logs. |
| 4.2 - minimum functionality / feels like a web wrapper | The app is a native React Native build; this shouldn't apply. If it does, point reviewers at the in-app session-proposal flow (Discovery → Chat → propose with court/venue → Accept/Decline → Events) so the multi-screen native UX is clear. Do NOT cite push notifications or calendar sync — those are not v1 marketing claims. |
| 5.1.2 - mismatched privacy answers vs actual data collection | Re-check section 4 against the privacy policy. |

If rejected, respond via Resolution Center with a concrete fix plan + ETA. Do not argue. Fix, rebuild, resubmit.
