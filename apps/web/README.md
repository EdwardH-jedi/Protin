# @sportsgang/web

SportsGang's official marketing site. Vite + React + Tailwind v4 + anime.js.

This app is the public homepage at the SportsGang marketing domain. The
mobile app and FastAPI backend live elsewhere in the monorepo
(`apps/mobile`, `apps/api`) and are not used by the marketing site.

## Local development

```bash
cd apps/web
npm install            # only first time, or after dep changes
npm run dev            # http://localhost:5173
npm run typecheck
npm run build          # tsc --noEmit && vite build → dist/
npm run preview        # serves the built output for smoke checking
```

This package is part of the repo's npm workspaces (`apps/*`), so a root
`npm install` also installs it. There are no `web:*` shortcut scripts on
the root `package.json` today — run commands from `apps/web/`.

## Brand alignment

The homepage, npm workspaces, repository documentation, and local development
identifiers use **SportsGang** / `sportsgang`. Registered mobile identities
such as `com.edh1223.protin` remain unchanged so this repository-only rename
does not create a different App Store or Play application. The deployed
domain and mailbox names also remain external migration work.

## Waitlist (prototype, no backend)

`WaitlistForm` uses client-only validation and persists submissions to
`localStorage` (`sportsgang.waitlist.v1`) so the same browser cannot submit
twice and so a returning visitor sees the "you're on the list" state on
reload. The reader migrates the legacy storage key on first access.

This is **temporary**. Before public launch, swap
`src/lib/waitlist.ts::submitWaitlistEmail` for a real backend or hosted
service (Mailchimp, ConvertKit, Loops, Supabase, our own API, etc.) and
keep `localStorage` as a UX cache only. No third-party service is wired
up in this pass.

## Privacy / Terms / Contact

The footer's Privacy, Terms, and Contact links open accessible dialogs
with placeholder copy from `src/content/legal.tsx`. Each policy panel
carries a banner reading **"Draft policy — final legal review required
before launch."** The Contact panel lists `hello@`, `support@`,
`partnerships@` `protin.app` placeholders.

Before public release:

- Replace `PrivacyContent` and `TermsContent` with text approved by
  qualified counsel (Australian Privacy Act, GDPR if EU-facing, App
  Store / Google Play requirements).
- Confirm the placeholder email addresses are routed to real inboxes.
- Decide whether Privacy / Terms should live on dedicated routes
  (e.g. `/privacy`, `/terms`) — that becomes worth a router only when
  the policies are stable and need shareable URLs.

## Animation

`anime.js` powers three meaningful interactions:

1. **Hero entrance timeline** — wordmark, headline word stagger,
   subtitle, CTA group, and gently floating activity chips
   (`HeroSection.tsx`).
2. **Scroll-revealed sections** — `useAnimeReveal` +
   `IntersectionObserver` stagger cards/steps as they enter the
   viewport (`ActivityCards`, `HowItWorks`, `SafetySection`,
   `GroupEvents`, `FinalCTA`).
3. **Sequential rank badge reveal** — Bronze → Diamond cascade
   (`RankSystem.tsx`).

`useReducedMotion` short-circuits all anime.js calls when the user has
`prefers-reduced-motion: reduce`; everything is rendered in its final
visible state instead. If anime ever throws, hidden reveal targets are
also snapped visible so JS errors can never leave the page blank.

## Reference: Figma Make draft

The folder `apps/web/SportsGang Landing Page Design/` is the original Figma
Make export. It is left in place as a visual reference and is **excluded
from this project's build, type-check, and Tailwind class scan** — see
`vite.config.ts`, `tsconfig.json`, and the `source(none)` directive in
`src/styles/index.css`. Do not edit it from this app; treat it as
read-only. It also has its own `package.json` named
`@figma/my-make-file` that is not part of the repo's workspace glob.

## Deployment

Recommended path (any static host works):

| Setting          | Value                       |
| ---------------- | --------------------------- |
| Source repo      | this repository             |
| Project root     | `apps/web/`                 |
| Install command  | `npm install` (root) *or* `npm install --workspace=@sportsgang/web` |
| Build command    | `npm run build` (from `apps/web/`) |
| Output directory | `apps/web/dist`             |
| Node version     | 18.x or 20.x LTS            |

Two known-good targets:

- **Vercel** — set the project root to `apps/web`, build command
  `npm run build`, output `dist`. Use Vercel's monorepo support so the
  install runs at the repo root (the workspace registers the package).
- **Cloudflare Pages** — same root, same build command, output `dist`,
  framework preset "Vite".

### Pre-launch TODOs (do not ship without these)

- [ ] Replace draft Privacy / Terms with counsel-approved copy.
- [ ] Wire `WaitlistForm` to a real waitlist backend or service.
- [ ] Set `og:url` + `og:image` + `twitter:image` in `index.html` once
      the production domain and 1200×630 share image are finalised.
- [ ] Remove any remaining experimental "MoveMate" copy before public launch.
- [ ] Decide whether to add a router (`/privacy`, `/terms`,
      `/contact`) — only worth it once policies stabilise.
- [ ] Verify the placeholder `hello@`, `support@`, `partnerships@`
      `protin.app` mailboxes resolve.
