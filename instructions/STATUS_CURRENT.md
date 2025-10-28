# STATUS_CURRENT

This is the single living status page. Dated snapshots such as `PROJECT_SUMMARY_YYYYMMDD.md`, `PRODUCTION_REVIEW_SUMMARY_YYYYMMDD.md`, and `Local_D1_Schema_Snapshot_wy_local_YYYYMMDD.md` remain immutable and link here.

## Domains and origins
- UI domain (Pages): https://volunteers.grassrootsmvt.org
- API route: same origin `/api/*` from the UI
- CORS allowlist (Worker env var): https://volunteers.grassrootsmvt.org
- Cloudflare Access: enabled on `/api/*`, AUD is the app Audience for volunteers.grassrootsmvt.org

## Environment parity
- Local UI: `wrangler pages dev ./ui`
- Local API: `wrangler dev` in `worker/` with D1 binding `wy_local`
- Local override allowed: `localStorage.GRMVT_API_BASE="http://localhost:8787"` for development only

## Data bindings
- D1 (prod): binding `DB`, database `wy_preview`  ← update if your prod DB name differs
- D1 (local): binding `DB`, database `wy_local`

## Migrations and schema
- Migrations head: latest committed migration in `worker/migrations/`  ← update this line when you add a new migration
- Latest schema snapshot: `Local_D1_Schema_Snapshot_wy_local_20251026.md`
- Deltas since last snapshot: plan migration to enforce `voters_addr_norm.voter_id NOT NULL` (currently PK, notnull=0 in snapshot). Track in `SCHEMA_DELTAS.md`.

- Migrations head (preview): <paste last file shown by `migrations list`>, applied on 2025-10-24.
- Latest remote pre-snapshot (preview): remote_pre_migrations_preview_20251024_0810.txt
- Latest remote post-snapshot (preview): remote_post_migrations_preview_<STAMP>.txt

API smoke tests (local):
- GET /api/health: 200, { status: "ok", d1: "ok" } on 2025-10-24.


## API smoke tests
- `GET /api/health`: expect 200 with `{ d1: "ok" }`
- `GET /api/ping`: expect 302 to Access when not signed in, 200 when signed in
- `GET /api/whoami`: expect 200 with identity after Access

## Known blockers and decisions
- All UI requests must use `environmentConfig.getApiUrl()` so the browser calls same origin. No hardcoded `https://api…` anywhere in the UI.
- CORS allowlist must match the UI domain exactly in production.

## Next actions
1) Search the UI for any hardcoded API base URLs and replace with `environmentConfig.getApiUrl(...)`.  
2) Set `ALLOW_ORIGIN` in `worker/wrangler.toml` to `https://volunteers.grassrootsmvt.org` and deploy the Worker.  
3) Run smoke tests above and record the results here.  
4) After production is stable, create a migration to set `voters_addr_norm.voter_id NOT NULL`. Update `SCHEMA_DELTAS.md`.
# STATUS_CURRENT

**As of:** 2025-10-24 17:00 (America/Denver)

## Environments
- **Local:** healthy. `/api/health` → `{"status":"ok","d1":"ok"}`
- **Preview (wy_preview):** healthy. Schema matches production.
- **Production (wy):** healthy. Schema matches local/preview.

## Database (Cloudflare D1)
- **Primary table:** `voters_addr_norm` (TABLE)
  - Columns: `voter_id (PK, NOT NULL)`, `ln`, `fn`, `addr1`, `city`, `state`, `zip`, `senate`, `house`, `city_county_id (NOT NULL, FK → wy_city_county(id))`
  - Indexes: `city`, `zip`, `addr1,city`, `city,addr1`, `city_county_id`
- **Views:**
  - `v_voters_addr_norm` = `voters_addr_norm` ⟗ `wy_city_county` with `city_resolved`, `county_resolved`
  - `city_county` = alias view on `wy_city_county` exposing `city`, `county`
- **Other tables present:** `wy_city_county`, `streets_index` (FK → wy_city_county), plus app tables (calls, volunteers, etc.).

## Migrations (active dir)
- ✅ `0001_create_wy_city_county.sql`
- ✅ `0002_create_streets_index.sql`
- ✅ `0011_baseline_after_alignment.sql`
- ✅ `0012_enforce_fk_voters_addr_norm.sql` (drops dependent view first, rebuilds table with NOT NULL + FK, recreates view)

Legacy migrations `0002_create_call_activity.sql`, `0003`–`0010` were removed/archived to prevent replay.

## Integrity
- `PRAGMA foreign_key_check;` → **OK** (preview & production)
- `voters_addr_norm.city_county_id` NULLs → **0** (preview & production)

## Snapshots (WORM)
- Added: `remote_schema_wy_preview_<STAMP>.txt`, `remote_schema_wy_<STAMP>.txt` (full `sqlite_master`)
- Keep these files in **FILE: here** to prevent drift.

## Next actions
1. **Deploy worker (prod)** if `/api/health` doesn’t return promptly after schema changes.
2. **Docs**: commit this STATUS_CURRENT.md, and ensure `instructions/project_instructions.md` references this file and the snapshot filenames.
3. **Guardrails**: future migrations must be idempotent (no `BEGIN/COMMIT`; use `IF NOT EXISTS`), and any manual DB edit must be mirrored by a migration.
