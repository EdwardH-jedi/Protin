# Protin — Release Runbook

Command-by-command path from a green `main` to a TestFlight build, and
from TestFlight to the App Store.

Assumes:

- `flyctl` installed, `fly auth login` completed.
- `eas-cli` installed (`npm i -g eas-cli`), `eas login` completed.
- Apple Developer account enrolled; App Store Connect app record created.

---

## 1. Backend — Fly.io deploy

### First-time app creation

See `infra/fly/README.md` for the full bootstrap (postgres attach, redis,
secrets). Short version:

```bash
fly launch --no-deploy --copy-config --name protin-api --region syd
fly postgres create --name protin-pg --region syd
fly postgres attach protin-pg --app protin-api
fly redis create --name protin-redis --region syd
fly secrets set REDIS_URL="<url>" SECRET_KEY="<...>" FIELD_ENCRYPTION_KEY="<...>" \
  GOOGLE_CLIENT_ID="<...>" GOOGLE_CLIENT_SECRET="<...>" --app protin-api
fly deploy --app protin-api
fly ssh console -C 'alembic upgrade head' --app protin-api
```

Confirm:

```bash
curl -fsS https://protin-api.fly.dev/health
# {"status":"ok", ...}
```

### Subsequent deploys

```bash
# From a clean main branch:
git pull --ff-only
fly deploy --app protin-api

# If the release includes new Alembic revisions:
fly ssh console -C 'alembic upgrade head' --app protin-api
```

### Rollback

```bash
fly releases --app protin-api
fly deploy --image <previous-image-ref> --app protin-api
# If a migration shipped, roll it back manually:
fly ssh console -C 'alembic downgrade -1' --app protin-api
```

---

## 2. Mobile — EAS build to TestFlight

### Preflight (once per release)

1. Confirm `apps/mobile/eas.json` production `EXPO_PUBLIC_API_URL` points
   to the actual Fly hostname (default `https://protin-api.fly.dev`).
2. Confirm `apps/mobile/eas.json` `submit.production.ios.ascAppId` and
   `appleTeamId` are real values (placeholders will fail `eas submit`).
3. Confirm `apps/mobile/app.config.js` has `ios.bundleIdentifier` set.
   EAS will refuse to build otherwise.
4. Bump `expo.version` in `apps/mobile/app.config.js` if this is a
   user-visible release. `autoIncrement: true` handles build number.

### Build

```bash
cd apps/mobile

# Production iOS build (unsigned binary → signed by EAS using stored creds).
eas build --platform ios --profile production

# First time on a machine EAS will prompt to generate/upload signing
# credentials — accept the managed-credentials flow unless your team
# uses an external cert store.
```

Wait for the build to finish (link is printed; also visible at
`https://expo.dev/accounts/<org>/projects/protin/builds`).

### Submit to TestFlight

```bash
eas submit --platform ios --latest
```

This uploads the `.ipa` to App Store Connect. Apple's processing
typically completes in 5-30 minutes. Once processed, the build appears
under **App Store Connect → Your App → TestFlight**.

### Add internal testers

1. App Store Connect → TestFlight → Internal Testing → **+** next to a
   group → add the build.
2. Testers receive the invite email; they install via the TestFlight iOS
   app.

### Promote external testers (optional)

TestFlight → External Testing → add the build → fill out the test info
form → submit for Beta App Review (typically <24h).

---

## 3. Promoting from TestFlight to the App Store

1. App Store Connect → **App Store** tab → **+ Version or Platform** →
   enter the new version number (matches `expo.version`).
2. In the version screen:
   - **Build**: select the TestFlight build to promote.
   - Fill in What's New, screenshots (if changed), review notes.
3. **Save** → **Add for Review** → **Submit for Review**.
4. Apple review SLA is typically 24-48h. On approval, the release will
   be available in the App Store according to the release option chosen
   (manual release or automatic).

---

## 4. Post-release checks

```bash
# API health
curl -fsS https://protin-api.fly.dev/health

# Tail production logs for errors in the first 30 minutes
fly logs --app protin-api
```

If a regression is found:

- Backend: `fly deploy --image <prev>` (see rollback above).
- Mobile: pull the App Store version (Apple → "Remove from Sale"), or
  ship a patch build via TestFlight → promote.
