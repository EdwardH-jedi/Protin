# SportGang official website (static)

Plain-HTML/CSS marketing + legal surface for the SportGang mobile app.
Lives at `apps/web/site/` so it does not collide with the existing
Vite + React + Tailwind project at `apps/web/` (which is the older
Protin-branded marketing site and is **not** modified by this slice).

## Files

| Path | Purpose |
|---|---|
| `Home.html` | Marketing home page — hero, app journey, problem, features, safety, CTA. |
| `privacy/index.html` | Privacy Policy (draft). |
| `terms/index.html` | Terms of Service (draft). |
| `support/index.html` | Support / contact page. |
| `styles.css` | Shared stylesheet for all four pages. |
| `README.md` | This file. |

No `assets/` folder, no images, no fonts, no JavaScript, no build step.
Every visual is inline SVG. Open the pages directly in a browser and they
render.

## Routes

When the site is served (e.g. via `python -m http.server`), the canonical
URLs are:

| URL | File served |
|---|---|
| `/Home.html` | `Home.html` |
| `/privacy/` | `privacy/index.html` |
| `/terms/` | `terms/index.html` |
| `/support/` | `support/index.html` |

The mobile app's `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
`EXPO_PUBLIC_SUPPORT_URL` env vars (Step 2 of the v1 mobile-hardening
work) point at the hosted versions of these three folder-style routes.

## How to view locally

Pick whichever is easiest:

- **Open `Home.html` directly in a browser.** Double-click
  `apps/web/site/Home.html`. Inter-page links (`./privacy/`, `./terms/`,
  `./support/`) won't auto-resolve under `file://` because browsers
  don't auto-serve `index.html` from a directory in file mode — you'd
  see a folder listing or 404. For full link checking, use the local
  HTTP server below.
- **One-line HTTP server** (recommended; matches production behavior):
  ```
  cd apps/web/site
  python -m http.server 8080
  ```
  Then visit:
  - `http://localhost:8080/Home.html`
  - `http://localhost:8080/privacy/`
  - `http://localhost:8080/terms/`
  - `http://localhost:8080/support/`

There is no build step. No `npm install`. No dependencies.

## Visual design

Translated from the Claude Design export at `apps/web/claude_design/SportGang.html`.

### Tokens (preserved from the design)

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

### Motion (preserved from the design)

- Three-layer ambient background: radial-gradient hot-spots, –72° diagonal
  speed-line pattern, 80×80 court grid masked to a center fade.
- `neonSweepLR` / `neonSweepRL` — thin neon line travelling across section
  connectors and card top edges, staggered per-card.
- `neonPulse` — small neon dot pulsing on connectors and the "live" eyebrow.
- `neonScan` — vertical scanline drifting down each phone screen,
  `mix-blend-mode: screen`.
- Hero diagonal "speed lines" rotated –14° with varied durations.
- Calm safety-section drift on a slower cycle.
- Everything respects `@media (prefers-reduced-motion: reduce)` and stops
  immediately when the OS asks for it.

### Typography (substituted — design used external CDN fonts)

The design references **Russo One**, **Space Grotesk**, and **JetBrains Mono**
from Google Fonts. This slice intentionally does **not** load any external
font (per the task brief). System stacks are used instead:

- Display: `"Helvetica Neue", "Arial Black", system-ui, sans-serif` (heavy weight)
- Body: `system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
- Mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`

The SG lockup is inline SVG so it does not depend on a font being installed.
A future slice can wire a real brand font (self-hosted) without changing the
HTML.

## Content rules

The site is intentionally v1-safe. None of the following appears anywhere
in the live HTML or CSS:

- tournaments
- battles, rank, honor
- city ladder, leaderboard
- push notifications
- calendar sync
- automatic nearby / distance / GPS-based filters
- open chat rooms
- subscriptions
- public/private event rooms

Where the source design's component vocabulary used those v2 concepts, this
build translated:

| Design concept | Site copy |
|---|---|
| Battle | Plan session |
| Rank | Safety / Profile |
| Honor | Trust / Safety |
| Gangs | Players / Sports partners |
| Challenges | Sessions |
| City ladder / nearby gangs | Removed (no leaderboard, no GPS, no map) |

## Brand spelling

This site uses **`SportGang`** (no inner `s`) as the public-website brand.
The mobile app config (`apps/mobile/app.config.js`) still ships
**`SportsGang`**. Final public spelling **must be confirmed before App
Store submission** — see `docs/release/APP_STORE_METADATA.md` §1
("Identity and naming") for the same open question. This slice does not
modify any mobile config.

## Placeholders that need real values before public launch

- **App Store badge.** This slice ships a CSS-only "Coming soon on the App
  Store" badge with an inline SVG glyph. It is **not** Apple's official
  marketing badge artwork, which is copyrighted and requires Apple
  Developer Program approval. Swap in the official PNG once approved.
- **Contact emails.** `support@example.com`, `privacy@example.com`,
  `legal@example.com` are placeholder addresses everywhere they appear
  (header, footer, Privacy §12, Terms §13, Support §1, §5, §9). Replace
  with the real operator-controlled addresses before the site goes
  public, and update App Store Connect's "App Review Contact" form to
  use the same `support@` address.
- **Final domain URLs.** The hosted versions of `/privacy/`, `/terms/`,
  `/support/` must be reachable over HTTPS at the operator's chosen
  domain before App Store submission. Update the mobile EAS build
  profile's `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
  `EXPO_PUBLIC_SUPPORT_URL` to those final URLs at the same time.
- **Brand spelling.** See above.
- **Legal placeholders.** Each Privacy and Terms page contains
  `<TBD …>` placeholders for the operator name, jurisdiction, effective
  date, retention durations, age eligibility, liability cap, and a
  Support page response-time SLA. None of those should ship as `<TBD>`
  to a public audience. The drafts are intentionally not "lawyer-
  approved"; counsel review is required before public publication.
- **App icon / screenshots.** No App Store screenshots are embedded in
  the page (Step 5 placeholder PNGs in `apps/mobile/assets/` are also
  pending real artwork). The page uses purely abstract phone mockups
  rendered as inline SVG.

## What this slice did NOT touch

By design, kept hands off:

- `apps/mobile/**` — no runtime, config, or asset changes.
- `apps/api/**` — no backend changes.
- `apps/web/index.html`, `apps/web/package.json`, `apps/web/src/**`,
  `apps/web/vite.config.ts`, `apps/web/tsconfig.json`,
  `apps/web/README.md` — the existing Vite project is untouched.
- `apps/web/Protin Landing Page Design/` — older Figma export, untouched.
- `apps/web/claude_design/` — the Claude Design export was read as
  visual reference only and not modified.
- Root `package.json`, `package-lock.json` — untouched.

## Reference

- Design source (read-only): `apps/web/claude_design/SportGang.html`.
- Copy / structure brief: see the task description for this slice.
- Cross-doc consistency: the home page is the public-facing surface for
  the in-app `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and
  `EXPO_PUBLIC_SUPPORT_URL` documented in `apps/mobile/src/lib/legal.ts`
  (Step 2) and in `docs/release/LEGAL_WEBSITE_CONTENT.md` (Step 6A).
