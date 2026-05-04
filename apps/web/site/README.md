# SportGang official website (static)

Plain-HTML/CSS marketing + legal surface for the SportGang mobile app.
Lives at `apps/web/site/` so it does not collide with the existing
Vite + React + Tailwind project at `apps/web/` (which is the older
Protin-branded marketing site and is **not** modified by this slice).

## Files

| Path | Purpose |
|---|---|
| `index.html` | Marketing home page — hero, app journey, problem, features, safety, CTA. Canonical home. |
| `privacy/index.html` | Privacy Policy. |
| `terms/index.html` | Terms of Service. |
| `support/index.html` | Support / contact page. |
| `styles.css` | Shared stylesheet for all four pages. |
| `README.md` | This file. |

No `assets/` folder, no images, no fonts, no JavaScript, no build step.
Every visual is inline SVG.

> **Note on `Home.html`.** The previous slice shipped the home page as
> `Home.html`. This slice renames it to `index.html` so static hosts
> serve `/` directly. There is no `Home.html` symlink or compatibility
> file; nothing in the repo or the in-app legal links points at the old
> name, so the rename is safe.

## Routes

When the site is served (e.g. via `python -m http.server` from
`apps/web/site/`), the canonical URLs are:

| URL | File served |
|---|---|
| `/` | `index.html` |
| `/index.html` | `index.html` |
| `/privacy/` | `privacy/index.html` |
| `/terms/` | `terms/index.html` |
| `/support/` | `support/index.html` |

The mobile app's `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
`EXPO_PUBLIC_SUPPORT_URL` env vars (Step 2 of the v1 mobile-hardening
work) point at the hosted versions of these three folder-style routes.

## How to view locally

There is no build step. No `npm install`. No dependencies.

```
cd apps/web/site
python -m http.server 8080
```

Then visit:

- `http://localhost:8080/`
- `http://localhost:8080/index.html`
- `http://localhost:8080/privacy/`
- `http://localhost:8080/terms/`
- `http://localhost:8080/support/`

Direct `file://` open of `index.html` works for the home page itself,
but the inter-page links (`./privacy/`, `./terms/`, `./support/`) won't
auto-resolve to a directory `index.html` under `file://`. Use the local
HTTP server above for full link checking; that's the same behaviour you
get on a static host in production.

## Visual design

Translated from the Claude Design export at
`apps/web/claude_design/SportGang.html` (untracked, reference-only).

### Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E1013` | Page background |
| `--bg-2`, `--bg-3` | `#14171C`, `#1C2026` | Card surfaces |
| `--charcoal` | `#2A2D33` | Hairline accents |
| `--fg`, `--fg-2`, `--fg-3` | `#F4F5F7`, `#B7BDC7`, `#6E7480` | Text scale |
| `--accent` | `#A8E61A` | Neon green primary accent |
| `--accent-glow` | `rgba(168,230,26,0.55)` | Drop-shadow glow |
| `--radius` / `--radius-lg` | `18px` / `28px` | Card corners |
| `--container` | `1240px` | Page max-width |

### Motion

- Three-layer ambient background (radial-gradient hot-spots + diagonal
  speed-line pattern + 80×80 court grid) — subdued on legal pages.
- `neonSweepLR` / `neonSweepRL` thin neon line travelling across section
  connectors and card top edges, staggered per-card.
- `neonPulse` small neon dot pulsing on connectors and the "live" eyebrow.
- `neonScan` vertical scanline drifting down each phone screen,
  `mix-blend-mode: screen`.
- Hero diagonal "speed lines" rotated −14° with varied durations.
- Calm safety-section drift on a slower cycle.
- Everything respects `@media (prefers-reduced-motion: reduce)` and stops
  immediately when the OS asks for it.

### Typography

The design references Russo One, Space Grotesk, and JetBrains Mono from
Google Fonts. We intentionally do **not** load any external font. System
stacks are used instead:

- Display: `"Helvetica Neue", "Arial Black", system-ui, sans-serif`
- Body: `system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
- Mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`

The SG lockup is inline SVG so it does not depend on a font being
installed. A future slice can wire a self-hosted brand font without
changing the HTML.

## Content rules — v1 safety

The public pages do not claim shipped support for any of the following.
None of these terms appear in the live HTML or CSS as marketing copy:

- tournaments
- battles, rank, honor
- city ladder, leaderboard
- push notifications
- calendar sync
- automatic nearby / distance / GPS-based filters
- open chat rooms
- subscriptions
- public/private event rooms

Where the source design's vocabulary used v2 concepts, this build
translated them:

| Design concept | Site copy |
|---|---|
| Battle | Plan session |
| Rank | Safety / Profile |
| Honor | Trust / Safety |
| Gangs | Players / Sports partners |
| Challenges | Sessions |
| City ladder / nearby gangs | Removed (no leaderboard, no GPS, no map) |

## Before public deployment

Treat each item below as a **deployment blocker** for the public
website. Where a value is unknown today, the public pages have been
written to avoid raw `<TBD …>` markers — they fall back to neutral
language. The list here is the source of truth for what still needs a
real answer before the site is announced.

- [ ] **Brand spelling.** Confirm `SportGang` (this site) vs
      `SportsGang` (current `apps/mobile/app.config.js` `expo.name`).
      The mobile config is intentionally untouched in this slice. Same
      open question as `docs/release/APP_STORE_METADATA.md` §1.
- [ ] **Final domain.** Pick the public domain that will host this
      site. Static hosts that serve directory-style URLs (Cloudflare
      Pages, Netlify, Vercel, GitHub Pages, S3 + CloudFront, etc.) are
      all compatible with the file layout here.
- [ ] **Real contact addresses.** Choose the real `support@`,
      `privacy@`, and `legal@` addresses on a domain the operator
      controls. Update §1 of the Support page to publish the real
      `support@` once it exists. Update App Store Connect's "App
      Review Contact" form to use the same address.
- [ ] **Operator legal name.** If a registered operator entity is
      formed, Privacy §1 and Terms §1 can mention it explicitly. Until
      then, the public pages refer to the product simply as
      "SportGang" rather than naming a legal entity.
- [ ] **Jurisdiction.** Confirm the country/state of operation and
      governing law. Privacy §10/§11 currently uses neutral wording
      ("applicable law", "the country we operate from"); replace with
      a named jurisdiction once decided.
- [ ] **Minimum age.** Confirm a specific minimum age and update Terms
      §2 and the matching Privacy section. Until decided, Terms §2
      defers to "the age required by applicable law in your country
      of residence" rather than naming a number.
- [ ] **Retention durations.** Replace the general retention language
      in Privacy §9 with specific durations (chat messages, reports,
      blocks, server access logs, crash diagnostics). Confirm with
      the backend owner before publishing numbers.
- [ ] **Liability language.** Terms §11 currently says liability is
      limited "to the maximum extent permitted by applicable law".
      Confirm with counsel whether a specific cap (e.g. amount paid
      in the last 12 months) should be inserted.
- [ ] **Counsel review.** Privacy and Terms drafts are intentionally
      not lawyer-approved. Counsel must review the final wording
      before public publication. The visible "Draft / not reviewed by
      counsel" banners that previous slices carried have been removed
      so the pages read as a normal public site once the values above
      are filled in.
- [ ] **Effective date.** Replace "To be confirmed before launch" in
      both Privacy and Terms hero meta + Privacy §13 with an actual
      ISO date (or a Month-Year label) on the day the public site
      goes live.
- [ ] **Mobile EAS env.** Pin the public URLs into the mobile build:
      `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`,
      `EXPO_PUBLIC_SUPPORT_URL`. The in-app legal links read these at
      build time (Step 2 of the v1 mobile-hardening work).
- [ ] **App Store badge.** The home page ships a CSS-only "Coming soon
      on the App Store" badge with an inline SVG glyph. Apple's
      official marketing badge artwork is copyrighted and requires
      Apple Developer Program approval; swap it in once approved.
- [ ] **App screenshots / artwork.** No real App Store screenshots
      are embedded in the home page. The phone mockups are inline SVG.
      Step 5 placeholder PNGs in `apps/mobile/assets/` are pending
      real artwork too.

## Reference design (untracked)

`apps/web/claude_design/SportGang.html` is a local Claude Design export
used as a visual reference for the colour, layout, and motion language
of this site. It is **not** committed to the repo and **should not be**
unless the operator explicitly decides it belongs in source control.
The build only reads it; nothing on the live site links to it.

## What this slice did NOT touch

By design, kept hands off:

- `apps/mobile/**` — no runtime, config, or asset changes.
- `apps/api/**` — no backend changes.
- `apps/web/index.html`, `apps/web/package.json`, `apps/web/src/**`,
  `apps/web/vite.config.ts`, `apps/web/tsconfig.json`,
  `apps/web/README.md` — the existing Vite project is untouched.
- `apps/web/Protin Landing Page Design/` — older Figma export.
- `apps/web/claude_design/` — read-only reference, not modified or
  committed.
- Root `package.json`, `package-lock.json` — untouched.

## Cross-doc consistency

When this site changes, also re-read:

- `docs/release/LEGAL_WEBSITE_CONTENT.md` — the structural outline
  these pages were written from.
- `docs/release/APP_PRIVACY_LABEL_DRAFT.md` — categories collected;
  Privacy §2 must stay in sync.
- `docs/release/APP_STORE_METADATA.md` — App Store Connect copy.
- `docs/deployment/APPLE_TESTFLIGHT_PREP.md` §4.4 — operational tracker
  for "URLs reachable from outside the build environment".
