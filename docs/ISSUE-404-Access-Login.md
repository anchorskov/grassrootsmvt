# 404 on Cloudflare Access login URL

**Symptom**
Browser console shows:
GET https://skovgard.cloudflareaccess.com/cdn-cgi/access/login/<AUD>?redirect_url=... 404 (Not Found)

**Root Cause**
Login URL built with AUD-in-path variant. For our tenant, Cloudflare serves login at the team domain with **HOST-in-path**:
`/cdn-cgi/access/login/<API_HOST>?kid=...&meta=...&redirect_url=...`

**Expected Source of Truth**
Hit a protected API path (e.g., `/api/ping`); observe the 302 Location header Cloudflare returns. Our code must match that format exactly.

**Fix**
- Add a canonical builder: `buildAccessLoginUrl({ teamDomain, apiHost, finishUrl })`
- Always use host-in-path. Disallow AUD-in-path.
- Top-level nav only (no XHR to `/cdn-cgi/access/*`).
- Keep `/auth/config` public (Bypass), `/api/*` protected (Require).

**Verification Steps**
1. `curl -i https://api.grassrootsmvt.org/auth/config` → 200 JSON (teamDomain, policyAud)
2. `curl -I https://api.grassrootsmvt.org/api/ping` (unauth) → 302 to `.../login/api.grassrootsmvt.org?...`
3. Open `https://volunteers.grassrootsmvt.org/` in a fresh browser profile:
   - Sees `connecting.html` spinner
   - Redirects to team-domain login
   - Completes OTP
   - Returns to UI
4. Confirm no XHR calls to `/cdn-cgi/access/*` in DevTools network.
5. Confirm cookies present for `api.grassrootsmvt.org` and authenticated API calls succeed.

**References checked**
- Cloudflare Access app config (Self-hosted app for `api.grassrootsmvt.org`)
- Redirect Location headers from Cloudflare when hitting protected endpoints (truth source)
- Prior code paths that used AUD-in-path (removed)

**Status**
OPEN — fixed in code, pending verification across all code paths.