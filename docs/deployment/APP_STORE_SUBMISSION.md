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
- Hosted URLs for the legal docs (currently placeholder `https://protin.app/...` in `apps/mobile/src/lib/legal.ts`) - publish the markdown and swap the constants.
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

- **Privacy Policy URL** (required): host `docs/legal/PRIVACY_POLICY.md` and paste the public URL. Default placeholder: `https://protin.app/privacy`.

[1] Sentry only initialises when `EXPO_PUBLIC_SENTRY_DSN` is set at build time (`apps/mobile/App.tsx`). If you ship without a DSN, switch the two Sentry rows to **No** in the App Privacy questionnaire - collecting nothing is fine; mis-declaring is what triggers a 5.1.2 rejection.

---

## 5. Age Rating questionnaire

Answer **None** to everything, with two exceptions:

| Question | Answer | Why |
|---|---|---|
| Unrestricted Web Access | None | No in-app webviews for arbitrary URLs |
| User Generated Content (chat, profiles, bookings) | **Infrequent/Mild** | You have a chat and a bio field. Say "Infrequent/Mild" - triggers the 12+ rating, not 17+. Do NOT say None; Apple will catch it and reject. |
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

Expected rating: **12+** (driven by the user-generated-content flag).

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

```
TEST ACCOUNT
------------
Email: review-tester@protin.app
Password: [paste-at-submission-time]

GETTING STARTED
---------------
1. Open the app - you'll see a splash, then the login screen.
2. Tap "Log in" and use the credentials above.
3. The account is already onboarded. You'll land on the Discovery feed.

WHAT TO TRY
-----------
- Discovery: swipe through users. "Like", "Pass", and "Save" are the actions.
- Matches tab: you have pre-seeded mutual matches. Tap any to chat or propose a booking.
- Bookings: one booking is awaiting your confirmation. Tap it to confirm,
  decline, or see the calendar integration option (iOS calendar permission
  is requested on first tap of "Add to Calendar").
- Profile tab: view your profile, identity preferences, sport profiles, and
  the "Delete my account" action at the bottom.

SIGN IN WITH APPLE
------------------
Also available on the login screen. If you use it, the app creates or
links a new account - the test data above is tied to the email/password
account, so Apple sign-in will show an empty state.

PUSH NOTIFICATIONS
------------------
Push tokens are per-device. Seeded accounts will not send you real pushes
during review. All push flows are covered by unit tests in the repo.

DATA DELETION
-------------
Profile -> "Delete my account" removes the test account and all of its
data. If you delete, the credentials above will no longer work.

CONTACT
-------
[your-email@domain] - happy to provide clarification within 1 business day.
```

---

## 8. Marketing metadata

| Field | Character limit | Guidance |
|---|---|---|
| Promotional Text | 170 | Editable without a new build - use for time-sensitive messaging. Skip for launch. |
| Description | 4000 | Draft below |
| Keywords | 100 (comma-separated) | Draft: `workout partner,gym buddy,golf partner,fitness,training,matchmaking,sydney,tennis,running,accountability` |
| Support URL | - | `[https://protin.app/support]` - can be a simple contact page |
| Marketing URL | - | Optional; leave blank at launch |

### Description draft

```
Protin helps you find a workout partner who actually turns up.

- Match by sport. Gym, golf, tennis, or running - add as many as you like,
  and tell us your level, preferred times, and where you train.
- Swipe to like, pass, or save. When you and someone else both like each
  other, you match.
- Chat when you match. Real-time messaging, no read receipts, no tracking.
- Book a session. Propose a time, your partner confirms, and if you link
  Google Calendar we'll drop it straight onto your schedule.
- Sydney-first. We match people in the same city so sessions are actually
  possible. More cities coming.

Protin does not do background checks. Meet in public places and use
common sense. You must be 18 or over to use Protin.

Sign in with Apple or email. Delete your account any time from the
profile screen.
```

(Edit to your voice before submission.)

---

## 9. Screenshots

Required sizes for the 2024+ App Store:

| Device class | Resolution | Count |
|---|---|---|
| iPhone 6.9" (Pro Max, 16 Pro Max) | 1290 x 2796 px, portrait | 3-10 |
| iPhone 6.5" (Plus / Pro Max pre-16) | 1242 x 2688 px, portrait | 3-10 |
| iPad (optional since we set `supportsTablet: false`) | - | skip |

### Suggested screenshot lineup (6 screenshots in this order - Apple shows the first 3 in search results)

1. **Discovery feed** - three partner cards visible, caption overlay: "Find a workout partner by sport."
2. **A match + chat** - match celebration screen or a chat with 2 messages and the "Propose booking" CTA visible. Caption: "Chat. Plan. Train."
3. **Booking detail, confirmed** - booking card showing sport, date, time, location, and the "Add to Calendar" button. Caption: "Booked in. See you at the gym."
4. **Onboarding step 3 (sport setup)** - the sport picker with gym/golf/tennis/running chips visible. Caption: "Gym, golf, tennis, or running."
5. **Profile screen** - your own profile with identity preferences and sport profiles filled in. Caption: "Your profile, your preferences."
6. **Sign in screen** - email/password fields with the Sign in with Apple button below (iOS-only, rendered via `expo-apple-authentication`). Caption (small): "Private sign-in. Delete any time."

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
- [ ] Privacy Policy and Terms of Service hosted at final public URLs
- [ ] Legal doc URLs updated in `apps/mobile/src/lib/legal.ts`
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
| 4.2 - minimum functionality / feels like a web wrapper | Protin is native; this shouldn't apply. If it does, emphasise the booking + push notification flows in review notes. |
| 5.1.2 - mismatched privacy answers vs actual data collection | Re-check section 4 against the privacy policy. |

If rejected, respond via Resolution Center with a concrete fix plan + ETA. Do not argue. Fix, rebuild, resubmit.
