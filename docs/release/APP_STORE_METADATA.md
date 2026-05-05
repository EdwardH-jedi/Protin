# App Store Metadata Draft

**Status:** draft. Every field on this page is provisional and must be reviewed
by the operator (and where applicable by counsel) before it is pasted into
App Store Connect or submitted for review. Nothing here has been approved
for public publication.

This document is the single point of truth for the wording the App Store
record will carry. It does **not** replace `APP_STORE_SUBMISSION.md`, which
captures the field-by-field ASC submission mechanics; this file captures the
*content* of those fields in draft form so the operator can iterate on copy
without touching app code.

---

## 1. Identity and naming

| Field | Draft value | Notes |
|---|---|---|
| App Store display name | `SportsGang` | **Resolved 2026-05-05: public brand spelling is `SportsGang` / `sportsgang`** (the inner `s` better implies multiple sports and future multi-sport expansion). The mobile config (`app.config.js` `expo.name`) already uses `SportsGang` and is unchanged. Technical identifiers remain unchanged for v1: slug `protin`, iOS `bundleIdentifier` `com.edh1223.protin`, Android `package` `com.edh1223.protin`, npm workspace names `@protin/*`, EAS project `@edwardh1234/protin`. |
| App Store subtitle (≤30 chars) | `Find your sports partner` | Working draft. Subtitle must remain under 30 characters in App Store Connect. |
| Bundle identifier | `com.edh1223.protin` | Already wired in `app.config.js`. Document only — do not change in Step 6A. |
| SKU (App Store Connect, internal) | `protin-ios-1` | Suggestion. Must be unique within the developer account. |
| Primary language | English (Australia) | Sydney-first product; confirm before submission. |

## 2. Promotional text (≤170 chars)

> Match with sports partners near you. Plan a session, chat to confirm the
> details, and show up. Built for Sydney first.

Draft only. The promotional text field can be updated after release without
a new build.

## 3. Short description / preview line

> Find a partner for your next gym, golf, tennis, or running session.

## 4. Full description draft

```
SportsGang helps you find a partner for your next sports session.

What you can do today:
- Create a profile with your sport, level, and the suburb you train in.
- Match with other partners in Sydney.
- Chat one-to-one with a matched partner.
- Plan a session together at a basic level — pick a time and place to meet.
- Report or block any user that doesn't feel safe.
- Delete your account from inside the app at any time.

Sports we currently support:
- Gym
- Golf
- Tennis
- Running

Safety first:
- Every match is two-sided — you only chat with partners who matched with you.
- You can report or block at any time from inside a chat.
- You can delete your profile and chat history from your Profile screen.

SportsGang is built in Sydney. Suburb-level matching is the default; nothing
in the app exposes your real-time location to anyone else.
```

**Do not** add any of the following to this description before they ship: a
public tournaments tab, an in-app rank/honor guide, calendar add-to-calendar
on bookings, push notifications as a feature claim, automatic nearby venue
discovery, or open-chat sports events. Each of those is intentionally hidden
in v1 (see Step 1 hardening) and must not be advertised.

## 5. Keywords draft

App Store keyword field is a single 100-character comma-separated string.
Draft set (uppercase letters, spaces, and stop-words such as "the" can be
dropped — App Store also auto-includes the app name and category):

```
sports,partner,match,gym,tennis,golf,running,session,workout,sydney,australia,safe,chat
```

Reviewer note: avoid keyword-stuffing competitor brand names; Apple rejects
those.

## 6. Category recommendation

- **Primary category:** `Health & Fitness` (matches the actual product).
- **Secondary category:** `Social Networking` (matching + 1:1 chat is the
  social-networking surface that justifies safety controls).

Confirm both selections in App Store Connect at submission time.

## 7. Age rating considerations

The product surfaces user-generated content (display name, bio, profile
photos, 1:1 chat). The expected Age Rating questionnaire answers are
captured in `APP_STORE_SUBMISSION.md` section 5; the working assumption is
**12+** based on:

- "Infrequent / Mild — User-Generated Content" (chat).
- All other content categories: `None`.

Confirm against the official questionnaire wording at submission time.

## 8. URLs

The static legal/marketing site is deployed to Netlify at the canonical
host below. All four App Store Connect URL fields point at this host today;
all routes return `200 OK` HTML over HTTPS.

| Field | Value | Owner action |
|---|---|---|
| Marketing / Website URL (optional) | `https://sportgang.netlify.app/` | Site root; optional in ASC. |
| Privacy Policy URL | `https://sportgang.netlify.app/privacy/` | Pin into `EXPO_PUBLIC_PRIVACY_URL` on the EAS production + preview profiles. |
| Terms of Service URL | `https://sportgang.netlify.app/terms/` | Pin into `EXPO_PUBLIC_TERMS_URL`. |
| Support URL | `https://sportgang.netlify.app/support/` | Pin into `EXPO_PUBLIC_SUPPORT_URL`. Same address must align with the App Store Connect "App Review Contact" form once a real `support@` mailbox exists. |

Notes:
- `https://sportgang.netlify.app/` is the **current Netlify-hosted production
  URL**.
- **Open item:** replace the Netlify-subdomain URLs with a final custom
  domain (e.g. `https://sportgang.app/...`) if/when the operator pins one.
  Update this section, the EAS env values, and the env example files
  (`apps/mobile/.env.example`, `apps/mobile/.env.staging.example`,
  `.env.example`) together if it changes.

The three `EXPO_PUBLIC_*_URL` env vars are read by
`apps/mobile/src/lib/legal.ts` (Step 2). The mobile build will treat each
link as "not available" until the env var is set on the EAS build profile.
Do **not** ship the App Store record with the URLs unset.

### Mobile env values (EAS — applied)

```
EXPO_PUBLIC_PRIVACY_URL=https://sportgang.netlify.app/privacy/
EXPO_PUBLIC_TERMS_URL=https://sportgang.netlify.app/terms/
EXPO_PUBLIC_SUPPORT_URL=https://sportgang.netlify.app/support/
```

These values are public and safe to commit; they live in the env example
files (`apps/mobile/.env.example`, `apps/mobile/.env.staging.example`,
`.env.example`) so local Expo runs resolve the same URLs, and they have
been pinned on the EAS `preview` and `production` environments. Verify
with:

```
eas env:list --environment preview
eas env:list --environment production
```

If a custom domain is later pinned, update with `eas env:update` (not
`:create`) on both environments. Full verification checklist + failure
triage live in `docs/deployment/APPLE_TESTFLIGHT_PREP.md` §4.8.

## 9. Review notes draft

Draft text for the App Store Connect "Notes" field (kept short — one
paragraph plus an optional credentials block):

```
SportsGang is a Sydney-based 1:1 sports-partner matching app. Account
registration uses email + password (Sign in with Apple is also available).
After registration you'll be guided through a three-step onboarding to
set sport, level, and suburb, then dropped on the Discovery feed.

To exercise the core flow:
1. Register or use the demo credentials below.
2. Complete onboarding.
3. Like a profile from Discovery.
4. When matched, open the Chat tab and exchange a message.
5. From the chat header > More options > Report or Block — both are wired.
6. From Profile > Delete my account — the account is hard-deleted.

If anything is unclear, the contact email below is monitored.
```

## 10. Demo account section

A reviewer demo account is **required** for App Store review when the app
gates content behind login (this app does). The reviewer demo account has
**not** been seeded yet — see `APPLE_TESTFLIGHT_PREP.md` §4.5 ("Reviewer
demo account") and `APP_STORE_SUBMISSION.md` §6/§7.

| Field | Placeholder | Notes |
|---|---|---|
| Demo email | `<reviewer-demo-email-TBD>` | Use a domain controlled by the operator. |
| Demo password | `<reviewer-demo-password-TBD>` | **Do not commit real credentials to this repo.** Provide them inside App Store Connect's "App Review Information" panel only. |
| Seed data | 2 seeded partners + 1 pending booking + 1 chat with history | To be produced by the seed script flagged as missing in the prep doc. |

When the seed script is created, this draft must be updated to point at the
real seeded credentials in App Store Connect (not in-repo).

## 11. App Store screenshot checklist

Apple requires a coherent set per device class. Confirm device-class
requirements with Apple's screenshot specs at submission time.

| Surface | Screen | Why it ships |
|---|---|---|
| Auth / onboarding | `AuthEntryScreen`, `OnboardingStep1Screen` | Establishes brand and the suburb/sport/level setup that drives matching. |
| Discovery / matching | `DiscoveryScreen` | The product's core loop — partner cards filtered by sport. |
| Chat | `ChatScreen` | Demonstrates the 1:1 conversation surface and the safety overflow. |
| Profile / safety / support | `ProfileScreen` | Shows the Privacy / Terms / Support links and the destructive Delete-account affordance. |

Do **not** screenshot any of the v1-hidden surfaces (Tournaments tab,
RankHonorGuide route, Add-to-Calendar, disabled discovery filter,
Google Calendar Integrations card). Step 1 confirmed those are hidden;
shipping a screenshot of any of them would mis-advertise.

## 12. Open items before submission

| # | Item | Blocker type | Owner |
|---|---|---|---|
| 1 | Apple Developer Team ID | Apple-side setup | Operator (after Apple Developer Program enrollment). |
| 2 | App Store Connect App ID | Apple-side setup | Operator (after ASC app record creation). |
| 3 | Final domain URLs for privacy / terms / support | Hosting | Live today on `https://sportgang.netlify.app/{,privacy,terms,support}/`. Open: optional swap to a final custom domain. |
| 4 | Final app icon + splash artwork | Design | Designer; replaces Step 5 placeholder PNGs. |
| 5 | Final App Store screenshots per device class | Design + dated device run | Designer + tester. |
| 6 | ~~Final app name spelling (`SportGang` vs `SportsGang`)~~ | Brand decision | **Resolved 2026-05-05: public brand spelling is `SportsGang` / `sportsgang`. Technical identifiers (slug, bundle ID, package names, EAS project) remain unchanged for v1.** |
| 7 | App Privacy Label confirmation against actual SDK behavior | Privacy review | Operator (see `APP_PRIVACY_LABEL_DRAFT.md`). |
| 8 | Reviewer demo account credentials (in ASC, not in repo) | Seed data | Operator + backend owner. |
| 9 | Final review-notes copy in ASC | Operator | Operator. |
| 10 | Privacy policy / terms / support pages reachable over HTTPS | Hosting | Done on Netlify (see §8). Re-verify after any custom-domain switch. |

Until all ten lines are resolved, the App Store record is not ready to
submit, even if the build itself passes review.
