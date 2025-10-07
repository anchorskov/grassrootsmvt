1) Updated project tree (reference)
.
├── README.md                         # ← overview & quick start (this file)
├── DEBUG_NOTES.txt
├── api/
│   ├── src/index.ts                  # (Workers API, prod path)
│   └── wrangler.toml
├── db/
│   ├── migrations/
│   └── schema/
│       ├── eligible_view_stub.sql
│       └── volunteer_schema.sql
├── docs/
│   ├── DEVELOPMENT.md                # ← local dev instructions
│   ├── ARCHITECTURE.md               # ← layout, data flow, envs
│   └── API.md                        # ← endpoint contracts
├── infra/
├── scripts/
│   └── dev-sqlite-api.mjs            # ← local SQLite sidecar (port 8787)
├── ui/
│   ├── index.html                    # Volunteer Hub (router/landing)
│   ├── admin/index.html
│   ├── functions/                    # Pages Functions (if used)
│   │   ├── _routes.json
│   │   └── ...
│   └── _worker.js                    # ← Pages _worker with proxy & stubs
└── wrangler.toml                     # Pages config (bucket=./ui)

2) .gitignore safety (don’t commit local voter data)

Append this:

# Local data & secrets
*.sqlite
*.db
*.db-shm
*.db-wal
/dev.vars
.env
.env.*
/home/anchor/projects/voterdata/

3) Ready-to-paste files
README.md
# GrassrootsMVT – Volunteer Hub & Field Tools

A Cloudflare Pages app + Worker providing volunteer calling & canvassing tools.
Runs fully local for dev (SQLite sidecar) and deploys to Cloudflare for prod (D1).

## Quick Start

### Prereqs
- Node 18+
- `wrangler` >= 4.41
- `jq` (for curl examples)
- Local voter DB (not in repo), e.g. `/home/anchor/projects/voterdata/wyoming/wy.sqlite`

### 1) Install deps
```bash
npm install

2) Configure local env (.dev.vars)
cat > .dev.vars <<'ENV'
DEV_EMAIL=dev@local
DATA_BACKEND=sqlite-dev
LOCAL_SQLITE_API=http://127.0.0.1:8787
SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite
ENV

3) Start SQLite sidecar (port 8787)
PORT=8787 SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite \
node scripts/dev-sqlite-api.mjs

4) Start Pages dev (port 8788)
pkill -f "wrangler pages dev" 2>/dev/null || true
wrangler pages dev ./ui --compatibility-date=2025-09-30


Open: http://127.0.0.1:8788

5) Smoke test API
curl -s http://127.0.0.1:8788/api/ping | jq .
curl -s -X POST 'http://127.0.0.1:8788/api/canvass/list' \
  -H 'content-type: application/json' \
  -d '{"filters":{"county":"Natrona","limit":5}}' | jq .

Deploys

main → production (linked to Cloudflare Pages). Push with care.

Use short-lived branches (e.g. vcall, canvass-ui), PR to main.

More detail:

docs/DEVELOPMENT.md

docs/ARCHITECTURE.md

docs/API.md


## docs/DEVELOPMENT.md

```markdown
# Development

## Local modes

- **UI + Worker (Pages dev)** on `:8788`
- **SQLite Sidecar API** on `:8787` (proxies queries against your local `wy.sqlite`)
- Worker switches behavior via `DATA_BACKEND`:
  - `sqlite-dev` → Proxy `/api/*` reads/writes to sidecar.
  - `d1` → (later) Use Cloudflare D1 binding.

### Start sidecar
```bash
PORT=8787 SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite \
node scripts/dev-sqlite-api.mjs

Start Pages dev
wrangler pages dev ./ui --compatibility-date=2025-09-30

Verify wiring
# Debug env
curl -s http://127.0.0.1:8788/api/ping | jq .

# Who am I
curl -s http://127.0.0.1:8788/api/whoami | jq .

# Canvass (GET & POST)
curl -s 'http://127.0.0.1:8788/api/canvass/list?county=Natrona&limit=3' | jq .
curl -s -X POST http://127.0.0.1:8788/api/canvass/list \
  -H 'content-type: application/json' \
  -d '{"filters":{"county":"Natrona","limit":3}}' | jq .

# Call flow
curl -s -X POST http://127.0.0.1:8788/api/call/next | jq .
curl -s -X POST http://127.0.0.1:8788/api/call/complete \
  -H 'content-type: application/json' \
  -d '{"voter_id":"TEST123","outcome":"vm"}' | jq .

Local data

Your SQLite lives outside the repo: /home/anchor/projects/voterdata/wyoming/wy.sqlite

Never commit .sqlite or .dev.vars (see .gitignore)

Contact logs (local write)

Create once:

sqlite3 /home/anchor/projects/voterdata/wyoming/wy.sqlite <<'SQL'
CREATE TABLE IF NOT EXISTS contact_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('call','canvass')),
  outcome TEXT NOT NULL,
  ok_callback INTEGER NOT NULL DEFAULT 0,
  requested_info INTEGER NOT NULL DEFAULT 0,
  dnc INTEGER NOT NULL DEFAULT 0,
  best_day TEXT, best_time_window TEXT,
  optin_sms INTEGER NOT NULL DEFAULT 0,
  optin_email INTEGER NOT NULL DEFAULT 0,
  email TEXT,
  wants_volunteer INTEGER NOT NULL DEFAULT 0,
  share_insights_ok INTEGER NOT NULL DEFAULT 0,
  for_term_limits INTEGER NOT NULL DEFAULT 0,
  issue_public_lands INTEGER NOT NULL DEFAULT 0,
  comments TEXT,
  volunteer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  state TEXT, county TEXT, city TEXT,
  district_type TEXT, district TEXT
);
CREATE INDEX IF NOT EXISTS idx_contact_logs_voter ON contact_logs(voter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_logs_geo ON contact_logs(state, county, city);
SQL


POST /api/call/complete (via sidecar) inserts rows above.


## docs/ARCHITECTURE.md

```markdown
# Architecture

## High level
- **Cloudflare Pages** serves UI from `ui/` and runs a **Pages Worker** (`ui/_worker.js`).
- In dev, the Worker proxies selected `/api/*` calls to a local **SQLite sidecar**.
- In prod, the Worker will target **D1** (binding `wy`) instead of the proxy.

## Key env flags
- `DATA_BACKEND=sqlite-dev | d1`
- `LOCAL_SQLITE_API=http://127.0.0.1:8787`
- `SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite`
- `DEV_EMAIL=dev@local`
- `ACCESS_HEADER=Cf-Access-Authenticated-User-Email` (prod)

## Cloudflare Access / whoami notes

For Pages Functions that validate Cloudflare Access identities, set these Pages Secrets (do NOT commit secrets to source):

- `CF_ACCESS_TEAM` or `CF_ACCESS_TEAM_DOMAIN` — either your short team name (e.g. `acme`) or full domain (e.g. `https://acme.cloudflareaccess.com`). `whoami` prefers `CF_ACCESS_TEAM_DOMAIN` if present.
- `CF_ACCESS_AUD` — the Access application's audience (AUD) to verify tokens against.
- `CF_ACCESS_ENFORCE_ISSUER` — set to `1` to enforce issuer checks against the team domain.
- `CF_ACCESS_ISSUER` — optional custom issuer URL if you need it.

Optional secrets for the admin exchange helper (only for testing):

- `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` — service token credentials used to obtain a CF_Authorization cookie.
- `SERVICE_TOKEN_TARGET_HOST` — the host to target for the exchange (e.g. `volunteers.grassrootsmvt.org`).
- `ADMIN_SECRET` — secret used to protect the `service-token-exchange` Pages Function. Keep this secret and restrict who knows it.

How to obtain a CF_Authorization cookie for testing (admin-only helper):

1. Call the admin endpoint (protected by `X-Admin-Secret`):

   POST https://<your-host>/api/service-token-exchange
   Headers:
     X-Admin-Secret: <ADMIN_SECRET>
     Content-Type: application/json
   Body JSON (optional if creds are in Pages Secrets):
   {
     "client_id": "<CF_ACCESS_CLIENT_ID>",
     "client_secret": "<CF_ACCESS_CLIENT_SECRET>",
     "target_host": "volunteers.grassrootsmvt.org"
   }

   The response will include the raw `set_cookie` value. Use that value in a subsequent `Cookie: CF_Authorization=<value>` header when calling `/api/whoami?debug=1`.

2. Important: the `service-token-exchange` endpoint is for testing only — rotate `ADMIN_SECRET` frequently and consider restricting access by IP or removing the endpoint after use.


## Request flow (dev)


UI (http://127.0.0.1:8788
)
└─ fetch('/api/...') → Pages Worker (_worker.js)
└─ DATA_BACKEND = sqlite-dev ?
└─ YES → proxy to http://127.0.0.1:8787
 (sidecar)
└─ NO → (fallback stub) / future: D1 queries


## Routing
- `ui/index.html` → Volunteer Hub (choose Call or Canvass + filters)
- `ui/_worker.js` → implements/proxies:
  - `GET/POST /api/canvass/list`
  - `GET/POST /api/call/next`
  - `POST /api/call/complete`
  - `GET /api/whoami`, `GET /api/ping`

docs/API.md
# API Contracts (dev & prod)

All responses are JSON. CORS enabled. Cache disabled during dev.

## Common Filter Object
Used by GET query params or POST body at `filters`:
```json
{
  "state": "WY",
  "county": "Natrona",
  "city": "CASPER",
  "district_type": "house|senate",
  "district": "52",
  "q": "MAIN",          // optional search
  "limit": 50
}

GET/POST /api/canvass/list

Request

GET: /api/canvass/list?county=Natrona&limit=5

POST: { "filters": { ... } }

Response

{
  "ok": true,
  "rows": [
    { "voter_id":"...", "name":"LAST, FIRST", "address":"...", "city":"...", "state":"WY", "zip":"...", "senate":"01", "house":"52" }
  ],
  "filters": { ... }
}

GET/POST /api/call/next

Request

Optional filters (same as above)

Response

{
  "ok": true,
  "voter_id":"...",
  "first_name":"...", "last_name":"...",
  "party":"R|D|U|... (if available)",
  "ra_city":"...", "ra_zip":"...",
  "phone_e164":"+1307..."
}

POST /api/call/complete

Request

{
  "voter_id":"XYZ",
  "outcome":"vm|connected|no_answer|wrong_number|refused|follow_up",
  "ok_callback":1,
  "requested_info":0,
  "dnc":0,
  "best_day":"Mon",
  "best_time_window":"Evening",
  "optin_sms":1,
  "optin_email":0,
  "email":"name@example.com",
  "wants_volunteer":0,
  "share_insights_ok":1,
  "for_term_limits":1,
  "issue_public_lands":0,
  "comments":"Left VM",
  "filters": { "state":"WY","county":"Natrona","city":"CASPER","district_type":"house","district":"52" }
}


Response

{ "ok": true, "saved": { ... }, "ts":"2025-10-02T23:15:44.276Z" }

GET /api/whoami
{ "ok": true, "email":"dev@local" }

GET /api/ping
{ "ok": true, "method":"GET", "data_backend":"sqlite-dev", ... }


---

# 4) One-shot shell to create/update docs

Paste this in your project root:

```bash
# 1) .gitignore append (safe)
cat >> .gitignore <<'G'
*.sqlite
*.db
*.db-shm
*.db-wal
/dev.vars
.env
.env.*
/home/anchor/projects/voterdata/
G

# 2) README
cat > README.md <<'MD'
# GrassrootsMVT – Volunteer Hub & Field Tools

A Cloudflare Pages app + Worker providing volunteer calling & canvassing tools.
Runs fully local for dev (SQLite sidecar) and deploys to Cloudflare for prod (D1).

## Quick Start

### Prereqs
- Node 18+
- `wrangler` >= 4.41
- `jq`
- Local voter DB (not in repo), e.g. `/home/anchor/projects/voterdata/wyoming/wy.sqlite`

### 1) Install deps
```bash
npm install

2) Configure local env (.dev.vars)
cat > .dev.vars <<'ENV'
DEV_EMAIL=dev@local
DATA_BACKEND=sqlite-dev
LOCAL_SQLITE_API=http://127.0.0.1:8787
SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite
ENV

3) Start SQLite sidecar (port 8787)
PORT=8787 SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite \
node scripts/dev-sqlite-api.mjs

4) Start Pages dev (port 8788)
pkill -f "wrangler pages dev" 2>/dev/null || true
wrangler pages dev ./ui --compatibility-date=2025-09-30


Open: http://127.0.0.1:8788

5) Smoke test API
curl -s http://127.0.0.1:8788/api/ping | jq .
curl -s -X POST 'http://127.0.0.1:8788/api/canvass/list' \
  -H 'content-type: application/json' \
  -d '{"filters":{"county":"Natrona","limit":5}}' | jq .

Deploys

main → production (Pages). Push with care.

Use short-lived branches (e.g. vcall, canvass-ui) and PR to main.

More detail:

docs/DEVELOPMENT.md

docs/ARCHITECTURE.md

docs/API.md

MD

## Pages Functions verification

After these changes, Cloudflare Pages should detect `ui/functions` and attach a Pages Functions bundle to deployments.

Quick local verification:

```bash
npm run build:functions
npm run deploy:pages
npm run verify:functions
```

The final command should print `true` when the deployment includes functions. Then try:

```bash
curl -i https://<preview>.grassrootsmvt.pages.dev/api/healthz
```

You should receive JSON from the function instead of the static index.html.

Verification note:

Cloudflare Pages will show a banner prompting you to "include a /functions directory" until the first deployment that includes a functions bundle. After the workflow above runs successfully you should see the function routes listed in the Pages project settings and `npm run verify:functions` will return `true`.


3) docs

mkdir -p docs

cat > docs/DEVELOPMENT.md <<'MD'

Development
Local modes

UI + Worker (Pages dev) on :8788

SQLite Sidecar API on :8787 (proxies queries against your local wy.sqlite)

Worker switches behavior via DATA_BACKEND:

sqlite-dev → Proxy /api/* reads/writes to sidecar.

d1 → (later) Use Cloudflare D1 binding.

Start sidecar
PORT=8787 SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite \
node scripts/dev-sqlite-api.mjs

Start Pages dev
wrangler pages dev ./ui --compatibility-date=2025-09-30

Verify wiring
curl -s http://127.0.0.1:8788/api/ping | jq .
curl -s http://127.0.0.1:8788/api/whoami | jq .
curl -s 'http://127.0.0.1:8788/api/canvass/list?county=Natrona&limit=3' | jq .
curl -s -X POST http://127.0.0.1:8788/api/canvass/list \
  -H 'content-type: application/json' \
  -d '{"filters":{"county":"Natrona","limit":3}}' | jq .
curl -s -X POST http://127.0.0.1:8788/api/call/next | jq .
curl -s -X POST http://127.0.0.1:8788/api/call/complete \
  -H 'content-type: application/json' \
  -d '{"voter_id":"TEST123","outcome":"vm"}' | jq .

Local data

Your SQLite lives outside the repo: /home/anchor/projects/voterdata/wyoming/wy.sqlite

Never commit .sqlite or .dev.vars (see .gitignore)

Contact logs (local write)

Create once:

sqlite3 /home/anchor/projects/voterdata/wyoming/wy.sqlite <<'SQL'
CREATE TABLE IF NOT EXISTS contact_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('call','canvass')),
  outcome TEXT NOT NULL,
  ok_callback INTEGER NOT NULL DEFAULT 0,
  requested_info INTEGER NOT NULL DEFAULT 0,
  dnc INTEGER NOT NULL DEFAULT 0,
  best_day TEXT, best_time_window TEXT,
  optin_sms INTEGER NOT NULL DEFAULT 0,
  optin_email INTEGER NOT NULL DEFAULT 0,
  email TEXT,
  wants_volunteer INTEGER NOT NULL DEFAULT 0,
  share_insights_ok INTEGER NOT NULL DEFAULT 0,
  for_term_limits INTEGER NOT NULL DEFAULT 0,
  issue_public_lands INTEGER NOT NULL DEFAULT 0,
  comments TEXT,
  volunteer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  state TEXT, county TEXT, city TEXT,
  district_type TEXT, district TEXT
);
CREATE INDEX IF NOT EXISTS idx_contact_logs_voter ON contact_logs(voter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_logs_geo ON contact_logs(state, county, city);
SQL


POST /api/call/complete (via sidecar) inserts rows above.
MD

cat > docs/ARCHITECTURE.md <<'MD'

Architecture
High level

Cloudflare Pages serves UI from ui/ and runs a Pages Worker (ui/_worker.js).

In dev, the Worker proxies selected /api/* calls to a local SQLite sidecar.

In prod, the Worker will target D1 (binding wy) instead of the proxy.

Key env flags

DATA_BACKEND=sqlite-dev | d1

LOCAL_SQLITE_API=http://127.0.0.1:8787

SQLITE_PATH=/home/anchor/projects/voterdata/wyoming/wy.sqlite

DEV_EMAIL=dev@local

ACCESS_HEADER=Cf-Access-Authenticated-User-Email (prod)

Request flow (dev)

UI → Pages Worker → (sqlite-dev) → Sidecar → SQLite

Routing

ui/index.html → Volunteer Hub (choose Call or Canvass + filters)

ui/_worker.js → implements/proxies:

GET/POST /api/canvass/list

GET/POST /api/call/next

POST /api/call/complete

GET /api/whoami, GET /api/ping
MD

cat > docs/API.md <<'MD'

API Contracts (dev & prod)

All responses are JSON. CORS enabled. Cache disabled during dev.

Common Filter Object
{
  "state": "WY",
  "county": "Natrona",
  "city": "CASPER",
  "district_type": "house|senate",
  "district": "52",
  "q": "MAIN",
  "limit": 50
}

GET/POST /api/canvass/list

GET: /api/canvass/list?county=Natrona&limit=5

POST: { "filters": { ... } }

Response:

{
  "ok": true,
  "rows": [
    { "voter_id":"...", "name":"LAST, FIRST", "address":"...", "city":"...", "state":"WY", "zip":"...", "senate":"01", "house":"52" }
  ],
  "filters": { ... }
}

GET/POST /api/call/next

Optional filters (same as above)

Response:

{
  "ok": true,
  "voter_id":"...",
  "first_name":"...", "last_name":"...",
  "party":"R|D|U|...",
  "ra_city":"...", "ra_zip":"...",
  "phone_e164":"+1307..."
}

POST /api/call/complete

Request:

{
  "voter_id":"XYZ",
  "outcome":"vm|connected|no_answer|wrong_number|refused|follow_up",
  "... other fields ...",
  "filters": { "state":"WY","county":"Natrona","city":"CASPER","district_type":"house","district":"52" }
}


Response:

{ "ok": true, "saved": { ... }, "ts":"2025-10-02T23:15:44.276Z" }

GET /api/whoami

{ "ok": true, "email":"dev@local" }

GET /api/ping

Shows env snapshot useful in dev. slightest no change
MD# Trigger Pages build
