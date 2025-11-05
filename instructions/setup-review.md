# Cloudflare Worker + Custom Hostname: Setup & Recovery Checklist

## Goal
Serve the **UI and API from one Worker** at `volunteers.grassrootsmvt.org`, protected by Cloudflare Access, with **same-origin** `/api/*` calls.

---

## 1) Wrangler config
**File:** `worker/wrangler.toml`

```toml
name = "grassrootsmvt"
main = "src/index.js"
compatibility_date = "2025-10-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[assets]
directory = "../ui"   # serve UI/static from the Worker

# ===== LOCAL (default) =====
[[d1_databases]]
binding = "d1"
database_name = "wy_local"
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
migrations_dir = "db/migrations"

[vars]
ENVIRONMENT = "local"
DATA_BACKEND = "d1"
ALLOW_ORIGIN_DEV = "http://127.0.0.1:8788,http://localhost:8788"

# ===== PRODUCTION =====
[env.production]
name = "grassrootsmvt"

# Route ALL requests (UI + API) to this Worker
routes = [
  { pattern = "volunteers.grassrootsmvt.org/*", zone_name = "grassrootsmvt.org" }
]

[env.production.vars]
ENVIRONMENT = "production"
DATA_BACKEND = "d1"
PUBLIC_HOSTNAME = "volunteers.grassrootsmvt.org"

[[env.production.d1_databases]]
binding = "d1"
database_name = "wy"
database_id = "4b4227f1-bf30-4fcf-8a08-6967b536a5ab"
migrations_dir = "db/migrations"
```

**Notes**
- Keep frontend API calls **relative**: `/api/whoami`, `/api/canvass/nearby`, etc.
- Remove any hard-coded `https://api.grassrootsmvt.org` and any legacy `/src/api-shim.js` includes.

---

## 2) DNS (Cloudflare)
Create a proxied A record so Cloudflare can attach the Worker:

- **Type:** A  
- **Name:** `volunteers`  
- **Content:** `192.0.2.1` (dummy IP, documented test-net)  
- **Proxy:** **Proxied** (orange cloud)

---

## 3) Attach the route
Attach the hostname to the Worker via `wrangler.toml` (see step 1) and deploy:

```bash
cd worker
npx wrangler deploy --env production
```

Then confirm in Dashboard → Worker → **Settings → Domains & Routes** that you see:  
`volunteers.grassrootsmvt.org/*`

---

## 4) Zero Trust (Access)
Cloudflare Zero Trust → **Applications** → Create application  
- Domain: `volunteers.grassrootsmvt.org/*`  
- Policy: allow your user/group (e.g., anchorskov@gmail.com)  
- Defaults for session are fine

**Behavior:** Unauthenticated requests get a `302` to the Access login page. This is expected in `curl`.

---

## 5) Verify
From terminal (not logged in):
```bash
nslookup volunteers.grassrootsmvt.org 8.8.8.8

# Expect 302 to Access (not a bug)
curl -I https://volunteers.grassrootsmvt.org/
curl -I https://volunteers.grassrootsmvt.org/api/ping
```

In a **private browser window**:
1. Open `https://volunteers.grassrootsmvt.org/` and complete Access login.  
2. DevTools → Network (Disable cache, preserve log). You should see **same-origin** calls only:
   - `/api/whoami`
   - `/api/canvass/nearby`
   - No `api.grassrootsmvt.org`
3. If you still see the old client, bump the script tag with a version query (cache-bust), e.g.  
   `<script src="/src/apiClient.v2.js?v=20251031a"></script>`

---

## 6) Recovery when a stale Worker owns `volunteers.grassrootsmvt.org`
**Symptom:** Serving old code, CORS to `api.grassrootsmvt.org`, `/whoami` 522/loop, or you cannot detach the hostname from the old Worker.

**Fix (correct order):**
1. **Remove DNS first**  
   Cloudflare DNS → delete the A record `volunteers → 192.0.2.1` (proxied).  
   _Reason: Cloudflare sometimes blocks route detachment while the DNS still points at a Worker._
2. **Detach the hostname from the old Worker**  
   Workers & Pages → select the old worker (e.g., `grassrootsmvt-production`) → Settings → Domains & Routes → remove `volunteers.grassrootsmvt.org/*`.
3. **(Optional) Delete the old Worker** if unused.
4. **Recreate the DNS record**  
   A `volunteers` → `192.0.2.1`, proxied.
5. **Attach the hostname to the correct Worker**  
   Ensure your active Worker has the route in `wrangler.toml`, then deploy:
   ```bash
   npx wrangler deploy --env production
   ```
6. **Purge cache** (Caching → Purge Everything).
7. **Wait ~3–5 minutes** for hostname binding to propagate.
8. **Verify** with the steps in section 5 (private window, same-origin API calls).

---

## 7) Local vs Production rules of thumb
- **Local:** Serve UI+API on `http://localhost:8787`. No Access. API calls stay relative: `/api/...`.
- **Production:** Host is `https://volunteers.grassrootsmvt.org`, behind Access. Same-origin API, no broad CORS.

If you need a public health endpoint (e.g., `/api/ping`), explicitly bypass Access for that path in the Worker. Otherwise keep everything behind Access.

---

## 8) Community wisdom (what others run into)
- A custom hostname can attach to only **one** Worker at a time. Stale attachments are a common source of “old code” or puzzling CORS. Remove old routes before re-attaching.
- Using a **proxied dummy A** (`192.0.2.1`) is standard for Workers hostnames.
- Expect a short propagation window after changing routes or hostnames. A few minutes is normal.
- Keep API calls **same-origin** to simplify cookies, Access, and CORS.
- When scripting with `curl`, unauthenticated requests will 302 to Access unless you use a **service token** (`CF-Access-Client-Id` / `CF-Access-Client-Secret`).

---

## 9) Quick “is it broken?” checklist
- `nslookup volunteers.grassrootsmvt.org` returns Cloudflare IPs (not NXDOMAIN).
- Worker → Domains & Routes shows `volunteers.grassrootsmvt.org/*` on the **correct** Worker.
- Zero Trust application exists and your user/group is allowed.
- No `api.grassrootsmvt.org` in any UI or JS includes.
- Browser Network shows same-origin `/api/*` with 200/OK after Access login.
