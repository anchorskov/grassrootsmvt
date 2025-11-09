# GrassrootsMVT – Unified Worker (UI + API)

GrassrootsMVT is a volunteer hub and field toolkit delivered via a single Cloudflare Worker.  
The Worker serves the static UI, exposes JSON APIs, and talks to a Cloudflare D1 database (or wrangler's local dev DB) so canvassers and callers can work from one authenticated endpoint.

## Project Goal
- Provide an authenticated UI for volunteers to canvass, call, and record notes quickly.
- Keep all logic inside one Worker so deployments are a single `wrangler deploy`.
- Store data in a D1 database (binding `d1`), with migrations under `worker/db/migrations`.
- Rely on Cloudflare Access for authentication; local dev bypasses Access automatically.

## Key Components
- `worker/`: Cloudflare Worker source. `src/index.js` wires routing, auth, and static asset handling. `worker/wrangler.toml` defines assets, D1 bindings, and environments.
- `ui/`: static assets (HTML/CSS/JS). Mounted as Worker assets (see `[assets]` in `worker/wrangler.toml`), so every request hits the Worker first.
- `worker/src/router.js` + `worker/src/api/*`: API endpoints (contact form, canvass, admin tools, etc.).
- `worker/db/migrations`: schema + data migrations for D1.
- `scripts/`: helper tooling (`dev_start.sh`, `deploy_all.sh`, verification scripts, etc.).

## Quickstart (Local Development)

### Prerequisites
- Node 18+
- `npm` and `npx`
- Cloudflare `wrangler` (installed globally or use `npx wrangler`)
- (Optional) A local `.env` for deploy tokens (see **Environment config** below)

### Install dependencies
```bash
npm ci
```

### Launch the unified Worker locally
```bash
npm run dev          # runs scripts/dev_start.sh
```
- Starts `wrangler dev` against `worker/`, serving assets from `../ui`.
- Uses local D1 state via `--persist-to worker/.wrangler/state`.
- Auth is bypassed automatically (see `scripts/dev_start.sh`).
- UI + API are reachable at `http://localhost:8787`.

Stop the dev processes with:
```bash
npm run dev:stop
```

### Useful local probes
```bash
curl http://localhost:8787/api/ping
curl http://localhost:8787/api/auth/config
curl http://localhost:8787/api/whoami        # returns mocked user when auth is bypassed
```

## Where to Look
- `ui/index.html` – volunteer landing page and shared layout.
- `ui/canvass/index.html`, `ui/volunteer/*` – canvass + phone flows.
- `ui/contact-form/*.html` – data-entry forms that now post back to the Worker.
- `worker/src/router.js` – attaches handlers defined under `worker/src/api`.
- `worker/src/auth.js` – Cloudflare Access validation + helper guards.
- `worker/src/utils/*` – environment detection, CORS, response helpers.
- `worker/db/migrations/*.sql` – run with `wrangler d1 migrations apply`.

## Deployment Notes
- `worker/wrangler.toml` is the source of truth. `[assets]` points at `../ui`, so static files deploy with the Worker automatically.
- Production routes (`volunteers.grassrootsmvt.org/*`) are configured under `[env.production]`.
- Secrets (Access AUD/ISS, admin emails, etc.) live in Wrangler secrets per environment.
- `scripts/deploy_all.sh` runs the full production deploy + smoke checks.

### One-line production deploy
```bash
./scripts/deploy_all.sh
# or manually:
cd worker && npx wrangler deploy --env production
```

After deployment:
1. Visit `https://volunteers.grassrootsmvt.org` (should redirect through Cloudflare Access).
2. Verify API health: `curl -I https://volunteers.grassrootsmvt.org/api/ping`.
3. Tail logs if needed: `cd worker && npx wrangler tail --env production`.

## Environment Config
- `.env` (repo root) is used when deploying via scripts for account IDs / API tokens. Do **not** commit it.
- Example entries:
  ```ini
  CLOUDFLARE_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxx
  CLOUDFLARE_API_TOKEN=cf_live_***
  ```
- Local dev relies on wrangler's persisted state + default bindings, so no Access token is required.

## Tooling & Scripts
- `npm run dev` / `npm run dev:stop` – start/stop unified Worker locally.
- `npm run deploy` – alias for `scripts/deploy_all.sh`.
- `npm run logs` – `wrangler tail` helper.
- `scripts/test_api_endpoints.mjs` – smoke tests against a deployed Worker.
- `scripts/deploy_and_verify.sh`, `scripts/verify_production.sh` – extended deploy/verify flows for CI or manual ops.

## Authentication
- Production requests hit Cloudflare Access; Worker reads `Cf-Access-*` headers inside `requireAuth`.
- Local dev sets `DISABLE_AUTH=true`, so routes assume a mock `dev@localhost`.
- `/api/auth/config` exposes the team domain + AUD so the UI can drive the Access login flow.

---

This README reflects the current unified Worker architecture. If you extend the deployment process or split services again, update this document so future contributors know which commands to run. Contributions and pull requests are welcome! 👍
