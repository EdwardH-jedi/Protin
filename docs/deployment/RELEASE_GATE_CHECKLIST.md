# Protin - Release Gate Checklist

Canonical go/no-go artifact for moving Protin between release stages. Use this
document to decide one question: **is Protin ready to move to the next release
stage yet?**

It does not teach release mechanics (see the runbook), it does not define App
Store metadata (see the submission doc), and it does not set product strategy.
It tells a human whether to **stop, continue verification, or advance** to the
next gate.

This document is based strictly on **committed, canonical repo state**.
Work-in-progress on feature branches that has not yet merged is called out
separately under "Pending branch-local work" in section 6 and is never
presented as Implemented in Repo.

---

## 1. Purpose and Scope

This checklist decides stage readiness. It does not redesign release strategy
or rewrite the existing runbook and submission docs.

Three gates, in order:

- **Gate 1 - Internal Beta.** Company-side humans can exercise the app
  against a usable backend.
- **Gate 2 - TestFlight.** The iOS binary and its Apple-side distribution
  path are real, and core flows are proven on a real iPhone.
- **Gate 3 - Submission Prep.** Everything a reviewer touches is verified,
  every user-visible feature has proof, and App Store Connect is complete.

Status vocabulary used throughout:

| Status       | Meaning |
|---           |---|
| implemented  | Code or config is present in the canonical (committed) repo. Does not imply it works on a device. |
| verified     | Proven by a dated device or staging run. Evidence captured in this doc. |
| required     | Apple-side or external setup that must be completed before a given gate. |
| blocked      | A concrete gap that prevents the stated gate from passing today. |
| risky        | Present in the app but unproven; must be verified or hidden before its gate. |
| pending      | Work exists on a feature branch but is not yet canonical; cannot be relied on. |

Unknown status is treated as **not ready**. Never default to "probably fine".

---

## 2. How to Use This Checklist

Rules for reading this document:

- Repo implementation alone never passes a gate. Every implemented item must
  be paired with a "does not prove" line. Readiness comes from the verified
  and required columns, not the implemented one.
- "Implemented in Repo" means committed on the canonical branch. Uncommitted
  or untracked work on feature branches does not count and lives in section 6
  under "Pending branch-local work".
- A gate passes only when **every must-pass item** in that gate's section is
  satisfied. Partial is not a pass.
- If a line item's status is unknown, treat it as **blocked** for the gate in
  question until someone records evidence.
- Do not copy claims from companion docs. If `APP_STORE_SUBMISSION.md` says a
  thing is implemented and you cannot see the evidence in the committed repo
  or in a dated device run, record it as `verify` here.
- When an item is verified, write the date and the owner into the evidence
  field. Verification without a date is not verification.

---

## 3. Implemented in Repo

Only items whose evidence lives in the committed repo (current HEAD on the
canonical branch). "Does not prove" is mandatory - it is the gap this
checklist is here to close.

### 3.1 Auth / account lifecycle

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Email / password register and login | `POST /auth/register`, `POST /auth/login` in `apps/api/app/routers/auth.py`; mobile uses `useAuthStore.login/register` in `apps/mobile/src/stores/auth.ts` | That login works against the staging backend from a real device, that session restore survives app relaunch, or that password recovery exists |
| Sign in with Apple | `POST /auth/apple` token verification path in `apps/api/app/routers/auth.py`; mobile button wired in `apps/mobile/src/screens/auth/LoginScreen.tsx` via `expo-apple-authentication`, iOS-gated | That Apple sign-in succeeds on a real iPhone, that the account is linked correctly, or that `APPLE_CLIENT_ID` is configured on the deployed backend |
| Session persistence | Token stored via `expo-secure-store` and restored on init in `apps/mobile/src/stores/auth.ts` (`initialize()` calls `api.get('/auth/me')`) | That re-login after logout, kill-and-reopen, and token expiry all behave correctly on device |
| Logout | `useAuthStore.logout()` clears secure store and token | That the UI consistently returns to the login screen and that server-side token handling matches |

### 3.2 Delete-account

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Server-side account deletion endpoint | `DELETE /auth/me` at `apps/api/app/routers/auth.py:184` | That it removes every owned record on the deployed DB, or that the mobile client actually calls it end-to-end |
| In-app "Delete my account" surface | Action present in `apps/mobile/src/screens/profile/ProfileScreen.tsx` | That a real user can find it, that the confirmation path completes, and that post-delete state (logout, cannot log back in with same credentials) is correct |

### 3.3 Push notifications plumbing

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Expo push integration declared | `expo-notifications` plugin entry and `notification-icon` reference in `apps/mobile/app.config.js` | That a signed build can actually register for push on Apple's APNs |
| iOS background mode for push | `UIBackgroundModes: ["remote-notification"]` in `apps/mobile/app.config.js` | That the entitlement is granted by Apple Developer and that the bundle ID has APNs capability enabled |
| Backend notification API | `POST /notifications/token` and the internal processor in `apps/api/app/routers/notifications.py` and `app/services/notifications.py` | That Expo's push service is reachable from the deployed backend and that pushes actually arrive on a real iPhone |

Note: internal-endpoint hardening for `/internal/process-notifications` (shared
token + staging/prod boot validator) is in progress on a feature branch. It
is not part of canonical repo state yet; see section 6 under "Pending
branch-local work".

### 3.4 Google Calendar integration

| Capability | Repo evidence | Does not prove |
|---|---|---|
| iOS calendar usage description | `NSCalendarsUsageDescription` in `apps/mobile/app.config.js` | That the permission prompt appears at the right moment and is granted |
| Mobile calendar helper | `apps/mobile/src/lib/calendar.ts` (add-to-calendar plumbing) | That calendar events are actually created on a real device after a booking confirmation |
| Backend Google OAuth config path | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` documented in the runbook (Fly secrets) | That OAuth is fully wired for the server-side Google Calendar flow end-to-end |

### 3.5 Backend / staging support

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Staging deploy script | `infra/scripts/deploy.sh` and `infra/scripts/health-check.sh` (both tracked); staging operator guide in `docs/staging/RUNBOOK.md` | That a reviewer-usable staging environment is currently live |
| Encryption and boot guards | `validate_encryption_config()` in `apps/api/app/core/encryption.py` refuses to start without `FIELD_ENCRYPTION_KEY` in staging or prod; wired in `apps/api/app/main.py` lifespan | That secrets are actually present on the deployed host |
| Health endpoint | `/health` handler in `apps/api/app/main.py` | That the external hostname is reachable and HTTPS-only at gate time |

### 3.6 Legal and support surface already present in repo

| Capability | Repo evidence | Does not prove |
|---|---|---|
| Legal links in-app | `apps/mobile/src/lib/legal.ts` consumed by the Register footer and the Profile Legal section | That the URLs referenced are publicly hosted and reachable |
| Privacy and Terms source docs | `docs/legal/PRIVACY_POLICY.md`, `docs/legal/TERMS_OF_SERVICE.md` | That these are hosted at the URLs referenced by the app |

---

## 4. Needs Real-Device Verification

Every item below is **not** proven by repo code. It needs a dated run on a
real iPhone or a dated, human-attended staging run. Empty evidence means not
done.

### 4.1 Auth / account lifecycle

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Email/password register, logout, re-login on real iPhone | mobile | short screen-recording or notes plus account ID | [ ] |
| Session restore across app kill/relaunch | mobile | notes that token persisted via SecureStore | [ ] |
| Sign in with Apple on real iPhone against live backend | mobile | linked account ID, which `APPLE_CLIENT_ID` was active | [ ] |
| Apple account linking if email already exists | mobile / api | documented outcome (link vs reject) | [ ] |
| Logout returns to login screen and clears token | mobile | notes | [ ] |

### 4.2 Delete-account (full end-to-end, device)

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Delete button discoverable from Profile on real device | mobile | screenshot | [ ] |
| Delete completes without error against deployed backend | mobile and api | API log or notes | [ ] |
| Post-delete: user logged out, cannot log back in with same credentials | mobile and api | notes | [ ] |
| Post-delete: owned rows removed or anonymized as policy requires | api | DB-level spot check notes | [ ] |

### 4.3 Push notifications (device proof, not code)

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Permission prompt shown and accepted on real iPhone | mobile | screenshot | [ ] |
| Expo push token returned and registered via `POST /notifications/token` | mobile and api | token prefix plus server log | [ ] |
| Backend-triggered push arrives on real iPhone | api and mobile | timestamp of send plus received | [ ] |
| Tapping a push opens the intended screen | mobile | notes | [ ] |
| Permission denial path handled gracefully | mobile | notes | [ ] |

### 4.4 Google Calendar (optional integration)

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Calendar permission prompt appears on "Add to calendar" | mobile | screenshot | [ ] |
| Event actually lands on the device calendar after a confirmed booking | mobile | screenshot | [ ] |
| Permission denial path does not break booking flow | mobile | notes | [ ] |

### 4.5 Onboarding and session

| Check | Owner | Evidence required | Status / date |
|---|---|---|---|
| Full onboarding (profile -> identity preferences -> sport profiles) on real iPhone | mobile | screen-recording or stepped notes | [ ] |
| App survives a cold start post-onboarding and lands on Discovery feed | mobile | notes | [ ] |

---

## 5. Apple-Side Setup Required

Non-repo dependencies. These cannot be satisfied by merging code. Each line
states the stage it blocks.

| Requirement | Required by gate | Status |
|---|---|---|
| Apple Developer Program enrollment (Team ID captured) | Gate 2 | [ ] |
| App Store Connect app record created (ASC App ID captured) | Gate 2 | [ ] |
| Bundle identifier consistency: `apps/mobile/app.config.js` vs ASC app record vs APNs capability | Gate 2 | [ ] |
| Signing credentials: EAS-managed or team-owned; confirmed on first `eas build` | Gate 2 | [ ] |
| Push entitlement / APNs capability enabled on the bundle ID | Gate 2 (push claim) and Gate 3 | [ ] |
| TestFlight internal tester group with 2 or more humans | Gate 2 | [ ] |
| TestFlight external review (if used) | Gate 3 | [ ] |
| Privacy Policy URL publicly hosted; URL in `apps/mobile/src/lib/legal.ts` updated to final | Gate 3 | [ ] |
| Support URL publicly hosted | Gate 3 | [ ] |
| Reviewer demo account credentials seeded and captured | Gate 3 | [ ] |
| App Review Contact Info (name, email, phone) finalized | Gate 3 | [ ] |
| Review notes block finalized (see `APP_STORE_SUBMISSION.md` section 7) | Gate 3 | [ ] |
| `apps/mobile/eas.json` `ascAppId` and `appleTeamId` filled (non-placeholder) | Gate 2 | [ ] |

Do not treat any of these as "will-do" during a gate review. If the row is
unchecked at decision time, the gate does not pass.

---

## 6. Blocked or Risky

Concrete gaps as of the last update to this document. This section is where
missing proof, known-absent repo artifacts, Apple-side unknowns, and
not-yet-merged feature-branch work live.

### 6.1 Canonical blockers and risks

| Item | Why it blocks or creates risk | Affected gate | Owner | Resolution condition |
|---|---|---|---|---|
| `apps/mobile/assets/` directory does not exist | `app.config.js` references `./assets/notification-icon.png`; `eas build` fails on missing path. App icon, splash, and adaptive icon also not wired | Gate 2 | mobile | Assets committed and referenced in `app.config.js` |
| `apps/api/scripts/seed_review_data.py` does not exist | Reviewers need a pre-populated demo account plus matches plus a pending booking; submission doc assumes this script | Gate 3 | api | Script exists, documented, and run against staging with captured credentials |
| `apps/mobile/eas.json` still contains `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` and `REPLACE_WITH_APPLE_TEAM_ID` placeholders | `eas submit` will refuse | Gate 2 | mobile / release owner | Real values in `eas.json` |
| Push end-to-end on real iPhone not yet proven | Code-and-config readiness is not APNs delivery; claiming push as ready is the single highest rejection risk | Gate 2 push claim, Gate 3 | mobile and api | Section 4.3 rows checked with dated evidence |
| Google Calendar flow not yet proven on real iPhone | Surface is exposed in booking UI; if unverified at Gate 3, hide or mark as optional | Gate 3 (risk) | mobile | Section 4.4 rows checked or feature hidden behind a flag |
| Legal URLs in `apps/mobile/src/lib/legal.ts` still point at unpublished paths | App Store requires reachable Privacy Policy URL; mismatch risks a 5.1.2 rejection | Gate 3 | release owner | URLs live and constant updated |
| Delete-account not verified on real device | Core Apple 5.1.1(v) requirement; code-only is not proof | Gate 2 and Gate 3 | mobile and api | Section 4.2 rows checked |
| Reviewer-usable staging environment not confirmed live | "Backend exists" is not "a reviewer can sign in and see seeded data" | Gate 1, Gate 2, Gate 3 | infra | Captured green health run plus reviewer account login on staging |

### 6.2 Pending branch-local work (not canonical yet)

These items exist only on feature branches and must not be treated as
canonical repo truth. They become either Implemented in Repo or additional
blockers once they merge.

| Item | Current state | Risk if merged without the matching ops step | Gate it would affect once merged |
|---|---|---|---|
| Internal-endpoint shared-token hardening for `/internal/*` | Present on `feature/wave-8-staging-readiness` but not merged; includes a new `internal_api_token` setting and a staging/prod boot validator | Once merged, the deployed API will fail to boot in staging or prod unless the corresponding secret is set on the host and in `.env.staging.example` | Gate 1 reviewer-usable staging |
| `infra/scripts/staging-ops.sh` operator wrapper | Untracked in the canonical repo | Not a canonical blocker today; do not rely on it in gate checks until it is tracked and merged | Gate 1 ops convenience |
| `docs/staging/RUNBOOK.md` updates that reference the above wrapper | Uncommitted | Runbook additions describing `staging-ops.sh` should not be cited as canonical procedure until merged | Gate 1 ops convenience |
| Naive-datetime regression fix in notification processing | Uncommitted on the same feature branch | Not canonical until merged; scheduling correctness on SQLite-backed tests remains the branch's concern | None at Gate level |

Resolution condition for 6.2 is merge to the canonical branch plus a
corresponding deployment checklist update. Until merge, these rows stay here
and are never copied into Section 3.

---

## 7. Release Gates

Three gates only. Each has an entry intent, a must-pass checklist, and
explicit no-go conditions. A gate passes only when **all** must-pass items
are checked and **none** of the no-go conditions are present.

### Gate 1 - Internal Beta

**Entry intent:** Protin team members can install or run the app (simulator
or TestFlight-internal) against a usable backend to exercise core auth,
profile, and discovery flows.

**Must-pass:**

- [ ] Core login (email/password) works against the deployed staging backend.
- [ ] Onboarding completes end-to-end on at least one real device run
  (section 4.5).
- [ ] Reviewer-usable staging confirmed: deploy script completes cleanly and
  `/health` is reachable over HTTPS from outside the host.
- [ ] At least one seed or demo account exists that a human can log into.
- [ ] No placeholder values in `.env.staging` for any service on the core
  path (API, DB, Redis, encryption key).
- [ ] Delete-account endpoint reachable (not necessarily verified end-to-end
  yet; see Gate 2).

**No-go conditions:**

- Staging backend is down, on localhost-only, or booted with placeholder
  secrets.
- Login cannot complete against the deployed backend.
- There is no working demo account a human can use.

Push and Google Calendar may be **partial** at this gate if they are
explicitly called non-core for the internal beta; they do not have to be
proven here, but claims about them must read as "not yet verified".

If section 6.2 "pending branch-local work" has landed on the canonical
branch by the time Gate 1 is re-assessed, the deploy configuration must be
updated in the same pass (for example, required secrets added to
`.env.staging` and to `.env.staging.example`). That is tracked as a pre-
redeploy checklist item, not as a no-go driven by canonical state.

### Gate 2 - TestFlight

**Entry intent:** A signed iOS build is in TestFlight, installable by real
testers, and core flows have been proven on a real iPhone against the
deployed backend.

**Must-pass:**

- [ ] Section 4.1 auth rows checked on a real iPhone.
- [ ] Section 4.2 delete-account rows checked on a real iPhone.
- [ ] Section 4.3 push rows: at minimum permission prompt, token
  registration, and one successful real-device delivery logged.
- [ ] Section 4.5 onboarding row checked on a real iPhone.
- [ ] Apple Developer Program enrollment, App Store Connect app record,
  Team ID, and ASC App ID all captured (section 5).
- [ ] Bundle identifier matches across `app.config.js`, the ASC app record,
  and APNs capability.
- [ ] `apps/mobile/eas.json` `ascAppId` and `appleTeamId` non-placeholder.
- [ ] `apps/mobile/assets/` exists with the files referenced by
  `app.config.js` and by the first App Store visual pass.
- [ ] TestFlight internal tester group populated with 2 or more humans.
- [ ] Reviewer-usable staging (from Gate 1) is still live and healthy.

**No-go conditions:**

- Push is claimed ready without section 4.3 delivery evidence on a real
  iPhone.
- Delete-account is unverified on device.
- `eas build` cannot produce a green artifact.
- Any `REPLACE_WITH_*` placeholder remains in `eas.json`.
- APNs capability is not enabled for the bundle ID.

### Gate 3 - Submission Prep

**Entry intent:** Every user-visible feature is either proven or hidden, App
Store Connect is complete, and a reviewer can get to the core loop with the
supplied demo account.

**Must-pass:**

- [ ] All of Gate 2 still true.
- [ ] Sections 4.1 through 4.5 rows fully checked with dated evidence,
  including Google Calendar (section 4.4) if the feature is exposed in the
  shipped UI; otherwise the feature is hidden behind a flag.
- [ ] Section 5 Apple-side setup entirely checked, including reviewer demo
  account, review notes block, support URL, privacy URL, contact info.
- [ ] Legal URLs in `apps/mobile/src/lib/legal.ts` are live and reachable.
- [ ] Reviewer demo account exercised end-to-end by a team member against
  the production build from TestFlight.
- [ ] `apps/api/scripts/seed_review_data.py` exists, is documented, and has
  been executed against staging with captured credentials.
- [ ] Section 6 has no rows flagged "affected gate: Gate 3" still open.

**No-go conditions:**

- Any user-visible feature remains unverified on a real device without being
  hidden or disclosed in review notes as limited.
- Delete-account not verified end-to-end on a real iPhone.
- Privacy Policy URL or Support URL unreachable.
- Any placeholder in `eas.json`, legal URLs, or reviewer notes.
- Demo account credentials not captured or not working.

---

## 8. Companion Docs

Short pointers only. Do not duplicate their content here.

- Release mechanics (Fly deploy, EAS build, TestFlight promotion, rollback):
  `docs/deployment/RELEASE_RUNBOOK.md`.
- App Store Connect field-by-field metadata, review notes template, and
  screenshot plan: `docs/deployment/APP_STORE_SUBMISSION.md`.
- Staging operations, env vars, QA, and setup: `docs/staging/RUNBOOK.md`,
  `docs/staging/ENV_VARS.md`, `docs/staging/QA_CHECKLIST.md`,
  `docs/staging/SETUP.md`, `docs/staging/KNOWN_ISSUES.md`.
- Legal source-of-truth: `docs/legal/PRIVACY_POLICY.md`,
  `docs/legal/TERMS_OF_SERVICE.md`.

---

## 9. Merge Acceptance Criteria

This document itself must satisfy the following before being treated as the
canonical gate artifact:

- One reader can decide **stop**, **continue verification**, or **advance to
  next gate** in a single pass, without opening any other doc.
- Every "Implemented in Repo" row cites committed canonical evidence only.
  Uncommitted or untracked work is never presented as implemented.
- Every "Implemented in Repo" row is paired with a "does not prove" line.
- Every "Needs Real-Device Verification" row has an owner and an explicit
  evidence field, not prose.
- Every "Apple-Side Setup Required" row states which gate it blocks.
- Every "Blocked or Risky" row names the affected gate and a concrete
  resolution condition. "Pending branch-local work" rows name the branch
  state plus the merge/config step that would retire the risk.
- No gate section claims a feature is ready without a matching checked row
  in section 3 and section 4 (or section 5 where Apple-side).
- The doc does not repeat procedural content from `RELEASE_RUNBOOK.md` or
  `APP_STORE_SUBMISSION.md`.
- No aspirational items ("polish UX", "improve onboarding"): every line
  maps to a go/no-go decision.
- Text uses plain ASCII punctuation and plain-text checkboxes so the file
  renders consistently across terminals, editors, and git viewers.
