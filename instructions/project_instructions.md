GrassrootsMVT – Project Instructions

0. Never invent, assume, guess d1 field names in this project.  

0.1 Alway complete d1 changes locally and test locally before recommending changes to the d1 in production.

0.2  Suggest changes that work both locally first and can be adapted to production later.  

0.3  Review tree.txt before suggesting cmds suggest the proper folder for execution.  e.g execute from root or execute from worker or cd worker

0.4 Migrations naming convention for this project name migrations sequentially 0002(name_varies).sql 0003(name_varies).sql etc. Migrations belong in worker/db/migrations not in db/migrations.  Single source of truth for D1 migrations: worker/db/migrations/

Filenames: zero-padded sequential numbers, then a short slug, for example
0010_v_street_tokens.sql, 0011_streets_index.sql

The top-level db/migrations/ path is deprecated.

1) Project description (what we’re building)

A simple Volunteer Hub (Pages) backed by a single API (Worker) with Cloudflare Zero Trust (Access) protecting only the API. The UI always talks to the API same-origin via /api/... so there’s no CORS pain and no cross-domain redirects.

UI: Cloudflare Pages site (e.g., volunteers.grassrootsmvt.org) serving static HTML/JS/CSS.

API: Cloudflare Worker bound to the domain routes volunteers.grassrootsmvt.org/api/* (and optionally grassrootsmvt.org/api/*) that:

terminates Access (trusts CF injected auth headers),

exposes endpoints like /api/whoami, /api/streets, /api/canvass, etc.

Access (Zero Trust): one application protecting the API routes; the UI remains public.

Source of truth: running code and configuration in the repo + Cloudflare dashboard.
Not a source of truth: any AI notes or docs (including this file). They are snapshots/observations at a point in time.

2) Top goals (keep these in front of us)

Single login + full functionality

Access protects only /api/*, UI is public.

After Access completes, cookies are valid for both volunteers.grassrootsmvt.org and /api/*.

Eliminate CORS and redirect loops

UI must only call fetch('/api/...') built from environmentConfig.getApiUrl('...').

Never hardcode https://api.grassrootsmvt.org/... in UI code.

Keep it simple

Minimal scripts, small diffs, Copilot-friendly “apply patch” workflow.

Use one Worker (grassrootsmvt-production) with clear route assignments.

Repeatable deploys

One deploy script for Worker (API) and Pages (UI).

No local dev required to deploy prod.

3) Current layout & names

Pages project: grassrootsmvt-production

Custom domain: https://volunteers.grassrootsmvt.org

Worker (API): grassrootsmvt-production (name visible in CF Worker list)

Routes:

volunteers.grassrootsmvt.org/api/* → assigned to grassrootsmvt-production

(optional) grassrootsmvt.org/api/* → assigned to grassrootsmvt-production

Zero Trust Access: single application with policy AUD matching the Worker’s POLICY_AUD.

Cookie domain: the Pages domain (volunteers.grassrootsmvt.org) or the zone; not /cdn-cgi/....

4) Doc index (living notes)

These are helpful, but not canonical—treat them as context, not truth.

project_instructions.md (this file): how we work, goals, pitfalls, workflows.

testing.md: short journal entries per change (what changed, quick test results).

tree.txt: curated tree of project files only (no node_modules, no build artifacts).

scripts/deploy_prod.sh: production deployment script (Worker + Pages).

ui/config/environments.js: the only way UI builds API URLs (same-origin).

worker/wrangler.toml: Worker bindings, env, and no /cdn-cgi/* routes.

5) Pitfalls we’ve already found (and how to avoid them)

AUD-in-path / Access redirects showing team-domain/cdn-cgi/...
Cause: browser followed a cross-origin whoami redirect.
Fix: UI must call same-origin /api/whoami (via environmentConfig.getApiUrl('whoami')).

CORS blocked
Cause: hardcoded https://api.grassrootsmvt.org/... in UI.
Fix: never hardcode API origin in UI; use getApiUrl().

“null worker” blocking a route assignment
Cause: stale route assigned to “null”.
Fix: Cloudflare → Workers → Unassign stale route, then redeploy. (If dashboard says “too many deployments”, follow CF doc to prune or delete and recreate the route/project.)

Login loops (401 from /api/whoami)
Causes:

Calling /cdn-cgi/access/cookies manually,

Bad finish URL,

API calls before Access cookie exists.
Fix: Use /api/ping?finish=/api/auth/finish?to=<returnUrl> pattern and only check /api/whoami after Access returns.

WSL / DNS weirdness
Cause: WSL nameserver overrides.
Fix: confirm with dig or curl --resolve ... and wait for local DNS update if needed.

Duplicated component designs (e.g., streetAutocomplete)
Cause: legacy and “new” APIs mixed.
Fix: converge on one component + one API shape. Favor the simple one in this repo (see “UI rules” below).

6) Cloudflare Zero Trust (what works)

Protect only /api/* (Worker routes).

Do not attach Workers to /cdn-cgi/*. Let Cloudflare handle Access endpoints.

Access app AUD in Zero Trust must match POLICY_AUD the Worker expects (and vice versa).

Cookie domain should cover volunteers.grassrootsmvt.org so subsequent same-origin /api/* calls carry the cookie.

In the Worker, normalize /api/... to app routes and do not rewrite or proxy /cdn-cgi/*.

7) How we work with Copilot (simple + repeatable)
A) Requesting a review (Copilot prompt)

“Scan the repo for direct fetch('https://api.grassrootsmvt.org') calls or any cross-origin URLs. Replace all with environmentConfig.getApiUrl('<endpoint>'). Generate a minimal git patch for each file.”

B) Applying a small patch

Use the “apply patch” style:

git checkout -b fix/same-origin-api
git apply -p0 <<'PATCH'
*** Begin Patch
*** Update File: ui/config/environments.js
@@
-const baseOrigin = apiBaseOverride || 'https://api.grassrootsmvt.org';
+const baseOrigin = apiBaseOverride || (isBrowser ? location.origin : 'https://volunteers.grassrootsmvt.org');
*** End Patch
PATCH

git commit -am "use same-origin base for API urls"

C) Undoing an accidental big drop-in
# Revert the working tree to HEAD (preserve untracked):
git restore --source=HEAD --worktree -- .
# Or selectively:
git checkout -- path/to/file.js

8) Repo review workflow (quick and consistent)

Sync & branch

git pull --rebase
git checkout -b chore/review-YYYYMMDD


Project scan (CI-less local)

# Only project files, no vendor
tree -a -I 'node_modules|.git|dist|.wrangler|.cache|.parcel-cache|build' > tree.txt
grep -R "https://api.grassrootsmvt.org" -n ui worker || true
grep -R "/cdn-cgi/access" -n ui worker || true


Sanity checks

ui/config/environments.js returns /api/... for production.

No Worker route on /cdn-cgi/*.

Workers dashboard shows volunteers.grassrootsmvt.org/api/* assigned to the single Worker.

Minimal fixes via patches (see §7B).

Zip only modified files

# create zip of modified files since main
git diff --name-only origin/main...HEAD | zip modified_files_$(date +%Y%m%d_%H%M).zip -@


Commit + PR

git commit -am "scan/fixes: same-origin calls, no cdn-cgi worker, small UI fixes"
git push -u origin HEAD

9) Deployments
A) Production (no local dev required)
# From repo root
bash scripts/deploy_prod.sh


scripts/deploy_prod.sh should:

Deploy Worker to prod (npx wrangler deploy --env production).

Deploy Pages (npx wrangler pages deploy ./ui --project-name grassrootsmvt-production --commit-dirty=true).

Verify:

curl -I https://volunteers.grassrootsmvt.org → 200

curl -I https://volunteers.grassrootsmvt.org/api/ping → 302 (unauth) or 200 (auth session)

curl -I https://volunteers.grassrootsmvt.org/config/environments.js → 200 and shows same-origin base.

If a route says “already assigned to null”: unassign in dashboard (Workers → Overview → Routes), then redeploy.

Local ↔ Production dual-flow (don’t break prod while you test locally).
We support two modes without code churn: (1) Production – UI on Pages (volunteers…) calling the Worker at same-origin /api/* with Cloudflare Access enforced; (2) Local test – UI served by wrangler pages dev and API by wrangler dev with ENVIRONMENT!=production so shouldBypassAuth() is true and CORS allows http://localhost. The UI must always build URLs via environmentConfig.getApiUrl('<endpoint>') (never hardcode full origins); in local mode, you may optionally point the UI at a non-default API with localStorage.GRMVT_API_BASE="http://localhost:8787" (this override is only honored on localhost). The Worker must not intercept /cdn-cgi/* in either mode; Access owns that path. Keep ALLOW_ORIGIN including only Pages in prod and localhost in dev. Never commit local-only toggles as prod defaults (e.g., don’t flip ENVIRONMENT=production off, don’t bake cross-origin URLs into the UI). If local breaks but prod must keep working, revert local toggles, verify /config/environments.js returns same-origin URLs, and confirm the Access app AUD still matches the Worker’s POLICY_AUD.

10) UI rules (to keep everything stable)

Always import ui/config/environments.js and call:

environmentConfig.getApiUrl('whoami') → /api/whoami

environmentConfig.getApiUrl('streets') → /api/streets

Never hardcode api.grassrootsmvt.org in the UI.

No manual hits to /cdn-cgi/access/* from UI code.

One StreetAutocomplete design (the converged one). If legacy code remains, remove it rather than keep two styles.

If a component needs auth: call /api/ping?finish=/api/auth/finish?to=<returnUrl> to “kick” and then wait for Access to return before calling /api/whoami.

11) Worker rules (auth & routes)

Don’t intercept /api/cdn-cgi/* → return fetch(request).

Normalize /api/... internally (/api/whoami → /whoami inside Worker).

Read CF-Access-Authenticated-User-Email to identify the user.

ALLOW_ORIGIN for prod must include only the Pages domain (https://volunteers.grassrootsmvt.org).

12) Create a bundle of modified files (zip)

Since last commit:

git diff --name-only > /tmp/changed.txt
zip modified_$(date +%Y%m%d_%H%M).zip -@ < /tmp/changed.txt


Compared to main:

git fetch origin
git diff --name-only origin/main...HEAD | zip modified_vs_main_$(date +%Y%m%d_%H%M).zip -@

13) Update GitHub (short & sweet)
git add -A
git commit -m "deploy: worker+pages; same-origin env; Access-stable auth flow"
git push
# open PR from your branch with a 2-3 bullet summary


Add a short journal entry in testing.md:

What changed (1-2 bullets)

Smoke tests you ran (URLs, expected vs actual)

Any follow-ups

Example entry:

## 2025-10-19
- Switched UI to same-origin API calls via environmentConfig.
- Assigned Worker to volunteers.grassrootsmvt.org/api/*; removed cdn-cgi routes.
- Tests: /config/environments.js 200, /api/ping 302 (unauth), login → /api/whoami 200.

14) “If things go sideways” checklist

Network tab shows any api.grassrootsmvt.org calls? → Fix UI code to same-origin.

Seeing skovgard.cloudflareaccess.com/cdn-cgi/... in responses? → A UI call followed a redirect; ensure you never call cross-origin & let /api/ping handle forwarding.

401 on /api/whoami after login?

Confirm Access cookie present for volunteers.grassrootsmvt.org.

Confirm Worker routes on /api/* not /cdn-cgi/*.

Confirm Access policy AUD matches Worker POLICY_AUD.

15) Open items (keep list short)

 Remove legacy “second design” of Street Autocomplete; keep the converged one.

 Restore “New Contact Entry” form using /api/contact-staging.

 Confirm whoami display shows real email post-auth.

## Deliverables

1. **Interactive Landing Page**
   - Entry point for volunteers. Allows selection of activity (canvass, call, new contact) and targeting method (city or district).
   - Linked to activity pages: Canvass, Call, and New Contact.

2. **Canvass Page**
   - Door-to-door canvassing interface for volunteers.
   - Features voter search, address autocomplete, contact status integration, and data persistence.
   - Uses schema: `voters`, `voters_addr_norm`, `streets_index`, `wy_city_county`, and `voter_phones`.

3. **New Contact Page**
   - Rich contact form for adding or updating volunteer interactions.
   - Integrates with canvass page and contact status tracking.
   - Uses schema: `voters`, `voter_contacts`, `voter_contact_staging`, `voter_phones`.

4. **Call Page**
   - Phone banking interface for volunteers.
   - Handles authentication, fetches next voter, and records call outcomes.
   - Uses schema: `voters`, `voter_phones`, `call_activity`.

## Documentation Consolidation

- All deliverable pages (Landing, Canvass, New Contact, Call) are documented in the `docs` folder:
  - `grassrootsmvt_ui_goals.md`: UI flow, landing page, activity selection, integration points.
  - `canvass_page_documentation.md`: Canvass page features, filters, workflow, schema usage.
  - `contact_system_comprehensive.md`: Contact page, form logic, integration with canvass and contact status, schema references.
  - `call_page_loop_prevention.md`: Call page authentication, workflow, schema usage.
  - `SEEDED_DATA_GUIDE.md`, `LOCALHOST_FUNCTIONALITY_SUMMARY.md`: Usage examples, schema references for all pages.

- All documentation should reference the current schema as described in `instructions/Local_D1_Schema_Snapshot_wy_local_20251026.md`:
  - Key tables: `voters`, `voters_addr_norm`, `streets_index`, `wy_city_county`, `voter_phones`, `voter_contacts`, `voter_contact_staging`, `call_activity`.
  - Ensure all page documentation and examples use the latest schema and field names.

16) Use tree.txt

Regenerate after structural changes if the tree changes include it in the zip folder (no vendor folders):

tree -a -I 'node_modules|.git|dist|.wrangler|.cache|build|.parcel-cache' > tree.txt

## 17) Local D1 Database Access (Custom Mirror Setup)

**Overview**: This project uses a **non-standard** local D1 configuration that mirrors the production database for development. This is not a typical Cloudflare setup but provides access to real Wyoming voter data during local development.

### wrangler.toml Configuration Requirements

The `worker/wrangler.toml` file must include a **local default section** to enable D1 access during `wrangler dev`:

```toml
# Local default (used by: wrangler dev --local)
[vars]
ENVIRONMENT = "local"
DATA_BACKEND = "d1"
ALLOW_ORIGIN_DEV = "http://127.0.0.1:8788,http://localhost:8788,http://localhost:5173"

[[d1_databases]]
binding = "d1"                    # must match your code: env.d1
database_name = "wy_local"        # local file-backed DB is auto-managed by wrangler
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
migrations_dir = "db/migrations"
```

### Development Environment Access

**Standard Environments** (dev/production):
- `[env.dev]` and `[env.production]` use remote Cloudflare D1 databases
- Require `wrangler dev --env dev` or production deployment
- May have connectivity/auth limitations in local development

**Local Environment** (local database mirror):
- Default `wrangler dev` (no --env flag) uses local D1 configuration
- Provides full access to mirrored production data (274,656+ voter records)
- Enables testing with real street names, addresses, and geographic data
- **Requirement**: Must have local database file synchronized with production

### Database Schema & Usage

**Full schema documentation**: See `instructions/database_schema_reference.md`

**Key tables available locally**:
- `voters` - Core voter registration (274,656 records)
- `v_voters_addr_norm` - Complete voter + address view
- `voter_contacts` - Volunteer interaction tracking
- `voter_contact_staging` - New contact verification pipeline

**Testing database connectivity**:
```bash
# Test D1 binding and data access
curl -s "http://localhost:8787/api/test-d1" | jq

# Test street autocomplete with real data
curl -s -X POST "http://localhost:8787/api/streets" \
  -H "Content-Type: application/json" \
  -d '{"q":"main","county":"ALBANY","city":"LARAMIE","limit":10}' | jq
```

### Important Notes

1. **Non-Standard Setup**: This local D1 mirror configuration is **not documented** in Cloudflare's standard practices
2. **Data Sync**: Local database must be manually synchronized with production periodically
3. **Environment Detection**: Worker code detects `env.ENVIRONMENT === "local"` to use appropriate query logic
4. **Fallback Behavior**: If D1 fails, APIs fall back to static test data for development continuity
5. **Production Safety**: Local configuration does not affect production deployments

### Troubleshooting

**D1 not accessible**: Ensure `wrangler dev` runs without `--env` flag to use local configuration
**Empty results**: Verify database sync and check `instructions/database_schema_reference.md` for correct table/column names
**Connection errors**: Check wrangler.toml syntax and database_id matches your local setup

## 18) Common Module Script Issues

### MIME Type Error: "Expected JavaScript but got text/html"

**Error Message**: 
```
Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.
```

**Root Cause**: 
Incorrect script paths in HTML files that include `/ui/` prefix when files are served from the UI root directory.

**Common Examples**:
- ❌ `<script type="module" src="/ui/canvass/canvass.js"></script>`
- ❌ `<script type="module" src="/ui/shared/streetAutocomplete.js"></script>`
- ✅ `<script type="module" src="/canvass/canvass.js"></script>`
- ✅ `<script type="module" src="/shared/streetAutocomplete.js"></script>`

**Resolution**:
1. **Remove `/ui/` prefix** from script paths in HTML files
2. **Verify file structure**: UI files are served from `ui/` directory root
3. **Check _routes.json**: Ensure module files aren't excluded from serving
4. **Add explicit MIME types** to `_headers` file if needed:

```plaintext
# Add to ui/_headers if needed
*.js
  Content-Type: application/javascript; charset=utf-8
```

**Related Files to Check**:
- `ui/canvass/index.html` - Canvass page module imports
- `ui/volunteer/canvass.html` - Volunteer canvass interface  
- `ui/index.html` - Main landing page scripts
- `ui/_routes.json` - Route inclusion/exclusion rules
- `ui/_headers` - MIME type configurations

**Testing Fix**:
```bash
# Test module script loads correctly
curl -I http://localhost:8788/canvass/canvass.js
# Should return: Content-Type: application/javascript

# Test in browser console
fetch('/canvass/canvass.js').then(r => console.log(r.headers.get('content-type')))
# Should return: "application/javascript; charset=utf-8"
```

## Local-Dev First (current working mode)

**Status:** We are developing and testing on localhost only. Production is unchanged. All instructions in this section assume local dev.

### Goals
- Keep the UI and API running locally with the same code paths we will use in production.
- Enforce the same-origin call pattern (`/api/*`) via `ui/config/environments.js`.
- Validate D1 and API endpoints with terminal-only smoke tests.

### Runbook

1. **Start the Worker API (port 8787 by default)**
   ```bash
   cd worker
   # Ensure ALLOW_ORIGIN_DEV is set for CORS (e.g., http://localhost:8788)
   # export ALLOW_ORIGIN_DEV=http://localhost:8788
   npx wrangler dev --local --config wrangler.toml
   ```
2. **Start the UI (Pages, port 8788)**
   ```bash
   cd ui
   npx wrangler pages dev . --port 8788
   ```
3. **Local override (optional)**
   In the browser console during local testing you may set:
   ```js
   localStorage.GRMVT_API_BASE = "http://localhost:8787";
   ```
   The `ui/config/environments.js` helper will honor this override only on localhost or 127.0.0.1.

4. **Terminal smoke tests**

   - API Health:
     ```bash
     curl -i http://localhost:8787/api/health
     ```
   - UI config reachable:
     ```bash
     curl -I http://localhost:8788/config/environments.js
     ```
   - Direct API call (mirrors what the UI will call):
     ```bash
     curl -i http://localhost:8787/api/health
     ```
   - Database checks:
     ```bash
     npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
       --command "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name;"
     ```
5. **Database checks**

npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
  --command "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name;"

Source-of-truth documents (WORM)

Schema snapshot: see FILE: Local_D1_Schema_Snapshot_wy_local_*.md in chat (immutable).

Current status and run commands: STATUS_CURRENT.md (living).

When we’re ready to flip to production, we will update STATUS_CURRENT.md and leave the dated snapshots untouched.