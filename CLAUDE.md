# CLAUDE.md — GrassrootsMVT

Quick-start reference for Claude Code. For full project rules see `instructions/project_instructions.md`.

---

## What this project is

A Wyoming voter-outreach platform for grassroots volunteers. Volunteers phone-bank and canvass; admins review contacts, call activity, and field sessions.

- **Production URL:** https://volunteers.grassrootsmvt.org
- **Stack:** Cloudflare Worker (API + static asset serving) + Cloudflare D1 (SQLite) + vanilla JS/HTML UI
- **No framework.** Vanilla JS only. No React, no bundler for UI files.

---

## Architecture

```
ui/              → static HTML/JS/CSS served by the Worker via ASSETS binding
worker/src/      → single Cloudflare Worker (index.js) handling all routes
worker/db/migrations/ → D1 migrations (single source of truth)
```

The Worker serves **both** the UI (static files) and the API (`/api/*`) from the same origin. There is no separate API domain. UI always calls `/api/...` — never a hardcoded hostname.

---

## Deploy (production)

```bash
# From project root — deploys worker + UI assets together
bash scripts/deploy_all.sh
```

This runs `npx wrangler deploy --env production` from `worker/` and verifies the live endpoints.

---

## Local dev

```bash
# Terminal 1 — Worker API (port 8787)
cd worker && npx wrangler dev --local

# Terminal 2 — UI (port 8788)
cd ui && npx wrangler pages dev . --port 8788
```

Local uses `wy_local` D1 database (mirrored from production). No `--env` flag = local mode with auth bypass.

---

## D1 database rules (critical)

1. **Never invent or guess column/table names.** Always verify against migrations or query `sqlite_master`.
2. **Test all D1 changes locally before touching production.**
3. **Migration naming:** zero-padded sequential, e.g. `032_add_thing.sql`. Lives in `worker/db/migrations/` only.
4. **Query the local DB:**
   ```bash
   npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
     --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
   ```
5. **Key tables:** `voters`, `voters_addr_norm`, `streets_index`, `best_phone`, `voter_contacts`, `call_activity`, `canvass_activity`, `field_sessions`, `field_session_tasks`, `message_templates`, `pulse_optins`

---

## Auth

- **Cloudflare Access** protects the API. Access injects `Cf-Access-Authenticated-User-Email` header.
- Worker reads this header via `ensureAuth()` in `worker/src/auth.js`.
- UI stores the JWT in `localStorage`/`sessionStorage` as `auth_token`.
- **Never intercept `/cdn-cgi/*`** — Access owns that path.

---

## Admin system

- Admin status is determined by `ADMIN_EMAILS` environment variable checked in `isAdmin()`.
- **`ADMIN_EMAILS` is a Cloudflare encrypted secret** (not in `wrangler.toml`). Set via:
  ```bash
  echo "email1,email2" | npx wrangler secret put ADMIN_EMAILS --env production
  ```
- Local dev value lives in `worker/.dev.vars` (gitignored).
- Current production admins: `admin@grassrootsmvt.org`, `anchorskov@gmail.com`, `jimmy@grassrootsmvt.org`
- Every `/admin/*` route must call `requireAdmin(auth.email, env)` — server enforced, not just UI-gated.

---

## Key pages

| URL | File | Notes |
|-----|------|-------|
| `/` | `ui/index.html` | **Actual landing page** — the Volunteer Hub |
| `/admin/` | `ui/admin/index.html` | Admin dashboard (link-gated for admins) |
| `/admin/call-activity.html` | `ui/admin/call-activity.html` | Phone call logs |
| `/admin/review.html` | `ui/admin/review.html` | Canvass contact review |
| `/admin/field-support.html` | `ui/admin/field-support.html` | Live field session desk |
| `/volunteer/phone.html` | `ui/volunteer/phone.html` | Phone banking UI |
| `/canvass/` | `ui/canvass/index.html` | Door canvass UI |
| `/field-session/` | `ui/field-session/index.html` | Field volunteer GPS session |

---

## Key API routes

| Route | Purpose |
|-------|---------|
| `POST /call` | Log a phone banking call → `call_activity` |
| `POST /canvass` | Log a canvass contact → `canvass_activity` |
| `GET /admin/whoami` | Returns `{ isAdmin: true/false }` |
| `GET /admin/call-activity` | Paginated phone call logs (admin) |
| `GET /admin/contacts` | Paginated canvass contacts (admin) |
| `GET /admin/stats` | Aggregate contact counts (admin) |
| `GET /admin/field-sessions` | Active field sessions (admin) |
| `GET /admin/field-sessions/:id/nearby-voters` | Voters near a field session |

---

## Rules to never break

- **No hardcoded API hostnames in UI.** Use `/api/...` paths or `window.apiGet()`/`window.apiPost()`.
- **No `/ui/` prefix in script src paths.** UI is served from root: `/shared/foo.js` not `/ui/shared/foo.js`.
- **Don't touch `/cdn-cgi/*`** routes in the Worker.
- **Run migrations locally first**, then apply to production with `--env production`.
- **`ADMIN_EMAILS` stays out of `wrangler.toml`** — it's a secret.

---

## Weekly admin data export (run every Monday)

Follow `instructions/DATA_EXPORT_ANALYSIS.md` to pull live volunteer data and surface action items.

**Quick run:**
```bash
mkdir -p exports
# Export voter_contacts (110+ rows as of 2026-05-07)
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT vc.*, v.county, va.fn, va.ln, va.city FROM voter_contacts vc LEFT JOIN voters v ON v.voter_id=vc.voter_id LEFT JOIN voters_addr_norm va ON va.voter_id=vc.voter_id ORDER BY vc.created_at DESC" \
  --json 2>/dev/null > /tmp/vc.json
```
Then run the full action-item queries from the instruction file and update `exports/action_items_current.md`.

**Current action items as of 2026-05-07** (`exports/action_items_current.md`):
- 4 voters with **email opt-ins** to add to campaign email list (all Casper)
- 4 voters **OK for callback** — connected by phone, need follow-up
- 1 voter **wants to volunteer** — contact Kevin at 307-247-6113
- 1 voter **Do Not Contact** — remove from all lists (voter_id 200020720)
- 7 unique voters with **SMS opt-ins** in pulse_optins (10 records, has duplicates — deduplicate before importing)
- `call_activity` table is **empty** — phone banking app not yet used in production

**Always use `--remote`** when querying production D1 — without it wrangler silently hits an empty local stub.

---

## Useful one-liners

```bash
# Tail production Worker logs
npx wrangler tail --env production

# Run a D1 query against production (--remote required or it hits local empty stub)
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT COUNT(*) FROM call_activity;"

# List production secrets
npx wrangler secret list --env production

# Check git status before committing
git status && git diff --stat
```
