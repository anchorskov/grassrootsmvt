1) Updated project tree (reference)
# GrassrootsMVT – Volunteer Hub & Field Tools

This repository provides a lightweight volunteer-facing UI and Pages Functions to help campaign volunteers contact voters. It is built to run locally for development (with a local SQLite sidecar) and to deploy to Cloudflare Pages + Pages Functions backed by a Cloudflare D1 database in production.

Project goal
------------
- Provide an easy-to-use UI for campaign volunteers to call or canvass voters.
- Data lives in a D1 database named `wy` (or in local SQLite when developing).
- Secure the UI and API with Cloudflare Access (Zero Trust) so only authorized volunteers can reach the Pages Functions.

Key concepts
------------
- UI: static site under `ui/` that contains the volunteer hub (call/canvass flows).
- Pages Functions: server-side handlers under `ui/functions/` that implement `/api/*` endpoints.
- Data backend: `d1` (production) with binding `wy`, `sqlite-dev` for local development (sidecar).
- Auth: Cloudflare Access tokens validated inside Pages Functions (see `ui/functions/_utils/verifyAccessJWT.js`).

Quickstart — local development
-----------------------------
Prerequisites
- Node 18+ (or compatible LTS)
- `wrangler` v4.x (for Pages dev)
- `jq` (optional, for JSON formatting)
- Local voter DB (not included in repo), e.g. `/home/anchor/projects/voterdata/wyoming/wy.sqlite`

Install dependencies
```bash
npm ci
```

Configure local env (example `.dev.vars`)
```bash
cat > .dev.vars <<'ENV'
DEV_EMAIL=dev@local
DATA_BACKEND=sqlite-dev
LOCAL_SQLITE_API=http://127.0.0.1:8787
SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite
ENV
```

Start the local SQLite sidecar (dev-only)
```bash
PORT=8787 SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite \
  node scripts/dev-sqlite-api.mjs
```

Start Pages dev (serves `ui/` on :8788)
```bash
wrangler pages dev ./ui --compatibility-date=2025-09-30
```

Smoke tests
```bash
curl -s http://127.0.0.1:8788/api/ping | jq .
curl -s -X POST http://127.0.0.1:8788/api/call/next | jq .

# Local verification helper
# You can run the post-deploy verifier locally against your Pages dev or a real deployment.
# Configure retry behavior with environment variables:
# VERIFY_RETRIES=10 (default), VERIFY_INTERVAL=30 (seconds, default)
# Example (against Pages dev):
#
#   wrangler pages dev ./ui --compatibility-date=2025-09-30 &
#   VERIFY_RETRIES=5 VERIFY_INTERVAL=15 node scripts/verify_deploy.mjs
```

Where to look
--------------
- UI entry: `ui/index.html` and supporting static assets.
- Pages Functions: `ui/functions/` (handlers live under `ui/functions/api/*`).
- Common helpers: `ui/functions/_utils/cors.js`, `ui/functions/_utils/verifyAccessJWT.js`.
- Local SQLite sidecar: `scripts/dev-sqlite-api.mjs`.

Deployment notes
----------------
- The root `wrangler.toml` configures Pages with `pages_build_output_dir = "ui"` and `functions = "ui/functions"`. A correct Pages deployment should set `uses_functions: true` on the deployment metadata when functions are included.
- CI workflows should install dependencies deterministically (`npm ci --prefix ui/functions`) so the functions bundle includes required node modules (for example `jose` used by the JWT verifier).
- Ensure the repository has the following Pages secrets configured (do not commit secrets):
  - `CLOUDFLARE_API_TOKEN` (used by post-deploy checks and scripts)
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` / `CF_ACCESS_ISSUER` (for Access verification)

Security
--------
- Cloudflare Access (Zero Trust) is used to gate the Pages UI and API. Pages Functions verify Access tokens using the JWKS flow.
- Do not commit any local voter data, SQLite files, or secrets. Add them to `.gitignore` if needed (`*.sqlite`, `.env*`, `.dev.vars`).

Scripts & CI checks
-------------------
- `scripts/test_api_endpoints.mjs` — probes `/api/*` endpoints (used in CI to validate deployments).
- `scripts/check_cf_routes_conflicts.mjs` — enumerates Worker routes vs Pages hostnames to detect route conflicts.
- GitHub Actions workflows live under `.github/workflows/` and include Pages deploy + post-deploy verification steps.

Artifacts & debugging
---------------------
- The deploy workflow uploads the verification logs (verify__api_*.txt) as a workflow artifact named `verification-results` so you can inspect API responses from CI runs.

Further documentation
---------------------
- `docs/DEVELOPMENT.md` — longer development notes and examples (generated from README content).
- `docs/ARCHITECTURE.md` — architecture overview and request flow.
- `docs/API.md` — API contracts used by the UI and functions.

Contact / next steps
--------------------
If you'd like, I can:
- Run a local wrangler Pages deploy to reproduce CI failures (requires your Cloudflare token in the environment).
- Inspect the failing GitHub Actions run and extract the wrangler output (I can fetch logs with a GitHub token), or give you the exact curl commands to fetch the logs locally.

Thank you — this README is intentionally concise. Tell me if you want more details in any area (examples, auth flows, D1 schema, or CI wiring).
