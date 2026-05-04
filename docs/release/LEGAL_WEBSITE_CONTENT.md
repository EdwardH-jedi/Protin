# Legal Website Content Draft

**Status:** draft. The content outlines below are starting points for the
operator's website. They are **not final legal claims** and have **not** been
reviewed by counsel. Do not publish any of this verbatim. Where final
operator/company details are unknown the placeholder is `<TBD>`; replace
each `<TBD>` with a real value before publishing.

This document covers what the *site* must say; the in-app links wired in
Step 2 (`apps/mobile/src/lib/legal.ts`) point at the URLs hosted here.

---

## 1. Website route plan

The mobile app reads three URLs from EAS env (`EXPO_PUBLIC_PRIVACY_URL`,
`EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_URL`). The hosted site that
backs those URLs has four canonical routes:

| Route | Purpose | Linked from |
|---|---|---|
| `/` | Home / brand landing | Optional Marketing URL in App Store Connect; not linked from the in-app UI. |
| `/privacy` | Privacy Policy | `EXPO_PUBLIC_PRIVACY_URL`, App Store Connect "Privacy Policy URL". |
| `/terms` | Terms of Service | `EXPO_PUBLIC_TERMS_URL`. |
| `/support` | Support / contact | `EXPO_PUBLIC_SUPPORT_URL`, App Store Connect "Support URL". |

Each route should resolve over plain HTTPS, return `200 OK`, and have a
`Content-Type` of `text/html`. Apple's reviewer fetches these URLs on
review; an HTML 200 is the bar.

Recommended: keep the four routes on the *same* domain so the App Store
Connect "Privacy Policy URL" and "Support URL" both belong to a domain the
operator demonstrably controls. Mixed domains pass review but raise
attention.

---

## 2. Home page (`/`) content outline

Brand landing only. No marketing claims about features hidden in v1.

- Site title: `<TBD final brand spelling — SportGang vs SportsGang>` —
  see metadata draft, item §1.
- Headline: "Find your sports partner."
- One-paragraph description, in plain present tense, of what the app does
  *today*:
  - Match with sports partners near you.
  - Chat 1:1 to plan a session.
  - Safety-first matching: report, block, delete account from inside the app.
- Sports list: `Gym, Golf, Tennis, Running.` (Match what `Discovery`
  actually offers in v1 — do not list any sport not in the app.)
- City: "Sydney first."
- Footer: links to `/privacy`, `/terms`, `/support`, plus optional
  contact email.

**Do not** mention any of the v1-hidden features as available: tournaments,
in-app rank/honor guide, calendar add-to-session, push notifications as a
shipped capability, automatic precise-location/nearby venue discovery, or
group/open chat. Step 1 hid those exact surfaces; the public site must not
advertise them.

---

## 3. Privacy Policy (`/privacy`) draft outline

Section headings only. Each section's actual copy must be reviewed before
publish; what follows is a structural map, not legal text.

1. **Introduction.** Who operates the app (`<TBD operator name>`), the
   product name, the app's purpose in one sentence, and the effective date
   placeholder.
2. **Information we collect.** Mirror the categories in
   `APP_PRIVACY_LABEL_DRAFT.md` §2 (email, profile photos, profile fields
   including suburb, chat content, reports/blocks, account/session
   identifiers, optional crash diagnostics). Be explicit that v1 does not
   collect precise location.
3. **How we use information.** Limited to: account login, profile presentation,
   matching, 1:1 chat delivery, safety/abuse moderation, account deletion,
   and (if Sentry ships) crash diagnostics. No advertising, no
   sale-of-data.
4. **Profile and sports matching.** Suburb-level matching, no precise
   location, profile shown only to other authenticated users with a sport
   in common.
5. **Chat and messages.** 1:1 only. Visible to the two participants and to
   the operator's moderation pipeline if a report is filed. Server-side
   retention period: `<TBD — confirm with backend owner>`.
6. **Reports, blocks, and safety.** Report payload contents, retention
   policy `<TBD>`, who can see a report, what a block does (no future
   contact / matching) and how long the block persists.
7. **Location, suburb, and venue information.** Only the suburb the user
   types into onboarding is collected. The app does not request foreground
   or background location permissions in v1.
8. **Account deletion.** What deleting from `Profile > Delete my account`
   does today: clears the local session, calls `DELETE /auth/me` on the
   server, and removes the user record. Disclose any retention exceptions
   (reports, server logs) and their durations once the backend owner
   confirms them.
9. **Data retention.** Per category, with concrete durations once
   confirmed. Where unknown today, mark `<TBD — confirm with backend
   owner>` rather than write a number.
10. **Data security.** General-purpose statement (transport encryption,
    access controls). Do not write specific certifications/claims unless
    the operator can substantiate them.
11. **Children / minors / age eligibility.** Placeholder `<TBD age
    eligibility — operator decision>`. Until decided, no claim about under-
    18 use should appear.
12. **International users / Australia contact note.** Operator is based in
    `<TBD jurisdiction>`. If Australian, include the standard Australian
    privacy contact statement. For users outside Australia, link to local
    rights references appropriate to the operator's jurisdiction.
13. **Contact / privacy email placeholder.** `<privacy@TBD>`.
14. **Last updated placeholder.** `<TBD effective date>`. Bump every time
    the policy materially changes.

Cross-references the policy must stay consistent with:
- `APP_PRIVACY_LABEL_DRAFT.md` (categories collected).
- `APP_STORE_METADATA.md` §11 ("Open items before submission").
- The backend's actual deletion / retention behavior.

---

## 4. Terms of Service (`/terms`) draft outline

Section headings only. Final wording must be reviewed before publish.

1. **Introduction.** Operator name `<TBD>`, product name, one-line scope:
   the app helps adult users find sports partners and coordinate
   real-world sessions.
2. **Eligibility.** Minimum age `<TBD — operator decision; align with the
   privacy policy section 11>`. Account creation requires accepting these
   Terms.
3. **Account responsibilities.** The user is responsible for the accuracy
   of profile information, the security of their login credentials, and
   their conduct on the platform.
4. **Acceptable use.** No harassment, no impersonation, no sexually
   explicit content, no illegal activity, no commercial spam, no
   recruitment for unrelated services. Violations may result in
   suspension or account termination.
5. **Sports activity and real-world meeting risk disclaimer.** The app
   helps two adults find each other; **the operator does not vet
   participants, supervise sessions, or assume responsibility for what
   happens at a session**. Users must apply normal care when meeting a
   stranger.
6. **User conduct and safety.** The user agrees to use the in-app report
   and block tools rather than off-app retaliation. The operator may
   review reported content for moderation.
7. **Chat and user content.** The user retains ownership of content they
   post; grants the operator a limited license to host and deliver that
   content for the duration of their account; agrees not to post content
   that violates §4.
8. **Sessions / bookings coordination disclaimer.** The app helps two
   matched users coordinate a sports session at a basic level (time,
   place). The app does not act as a venue, a gym, or a tour operator and
   does not guarantee that a partner will show up.
9. **Reports, blocks, and moderation.** The operator may suspend or
   remove accounts that violate these Terms or platform policies. The
   operator may, but is not required to, respond to every report.
10. **Account deletion / termination.** The user can delete their account
    at any time from `Profile > Delete my account`. The operator may
    terminate or suspend an account for material violation of these
    Terms.
11. **Disclaimers and limitation of liability.** The product is provided
    "as is", to the maximum extent allowed by applicable law. The
    operator is not liable for indirect/consequential damages arising
    from real-world session participation. Final wording requires legal
    review.
12. **Changes to terms.** The operator may update the Terms; material
    changes will be notified inside the app or on this page.
13. **Contact.** `<legal@TBD>` for questions about these Terms.

Do **not** label any of this as "lawyer-approved" or "binding legal
guidance" before counsel has signed off.

---

## 5. Support page (`/support`) draft outline

This is the single page Apple's reviewer (and a real user) lands on when
they tap "Support" inside the app or the App Store record.

Sections:

1. **Contact support.** Plain English: how to reach the operator. Provide
   `<support@TBD>` as the canonical channel.
2. **Report a user.** Step-by-step: open the user's chat → header → ⋯ More
   options → Report → choose a reason → submit. Mirrors Step 3
   hardening.
3. **Block a user.** Step-by-step: open the user's chat → header → ⋯ More
   options → Block → confirm. Confirms the success/failure copy added in
   Step 3.
4. **Delete account.** Step-by-step: Profile → Delete my account →
   confirm. Note that deletion is permanent. Mirrors Step 4 hardening.
5. **Privacy and data requests.** How to email the operator about a data
   request (export, correction, deletion-confirmation). Link to
   `/privacy`.
6. **Safety guidelines.** Short bullet list aligning with the Terms §5
   real-world meeting disclaimer: meet in public, tell a friend, trust
   your gut, use the report/block tools, do not share financial details.
7. **FAQ.** Short, factual entries:
   - What sports does the app support today? (Gym, Golf, Tennis,
     Running.)
   - Is the app available outside Sydney? (Sydney first; coverage may
     expand.)
   - Why can't I see profile X? (Either you haven't matched, or one of
     you blocked the other.)
   - Why didn't I receive a push? (Push is best-effort in v1.)
8. **Response time placeholder.** `<TBD — operator decision; e.g. "We aim
   to respond within X business days.">` Do not promise an SLA the
   operator cannot keep.
9. **Support email placeholder.** `<support@TBD>`. The same address must
   appear in App Store Connect's "App Review Contact" form.

Do **not** list tournaments, the rank/honor guide, in-app calendar
integration, automatic nearby-venue discovery, or open chat events as
v1 capabilities. They are intentionally hidden surfaces (Step 1).

---

## 6. Cross-doc consistency

When updating any section above, also re-read:

- `APP_STORE_METADATA.md` §4 (full description), §10 (demo account), §12
  (open items) — copy must be consistent.
- `APP_PRIVACY_LABEL_DRAFT.md` §2 / §6 / §7 — categories listed in the
  privacy policy must match exactly.
- `APPLE_TESTFLIGHT_PREP.md` §4.4 — the prep doc is the operational
  tracker for "URLs reachable from outside the build environment".

If any of those four documents disagrees with this one, update them
together in the same slice; do not let drift accumulate.
