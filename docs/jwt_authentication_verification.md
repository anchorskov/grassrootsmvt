# 🔐 Cloudflare Access Verification Guide

This guide documents how to validate the simplified authentication flow that now powers `/ui/call.html` and the other volunteer experiences. The UI no longer relies on a global `window.apiFetch` helper; instead it performs a lightweight `ensureAuth()` check that:

1. Calls `GET https://api.grassrootsmvt.org/whoami` with `credentials: "include"`.
2. On `401`, performs a top-level navigation to `https://api.grassrootsmvt.org/whoami?nav=1&to=<current URL>`.
3. Lets the Worker redirect through Cloudflare Access before returning the user to the UI.

Because the flow depends entirely on Cloudflare Access issuing the `CF_Authorization` cookie for `api.grassrootsmvt.org`, always cross-reference the [Cloudflare Zero Trust documentation](https://developers.cloudflare.com/cloudflare-one/) when you see unexpected behaviour. A quick way to discover the canonical login URL is to run:

```bash
curl -I https://api.grassrootsmvt.org/whoami | grep -i location
```

The value of the `Location` header is the source of truth for how Cloudflare expects login redirects to be formatted.

---

## 1. Local Development

### Prerequisites

```bash
cd /home/anchor/projects/grassrootsmvt
npm install
npx wrangler dev --local --port 8787
npx wrangler pages dev ui --port 8080
```

### Steps

1. Open http://localhost:8080/call.html in a fresh tab.
2. Because the Worker runs with `ENVIRONMENT="local"`, the page prints `Signed in as: dev@localhost` without performing any redirects.
3. Click **Get Next**. The request hits `http://127.0.0.1:8787/call` and returns either a voter record or an empty response, confirming that authentication is bypassed in local mode.
4. Check the browser console. You should see exactly one call to `/whoami` and no navigation attempts.

✅ Expected: No Cloudflare Access challenges occur when `ENVIRONMENT` is not `production`.

---

## 2. Production Flow

1. Visit https://volunteers.grassrootsmvt.org/call.html in an incognito window.
2. You should immediately be redirected to `https://api.grassrootsmvt.org/whoami?nav=1&to=…` and then to the Cloudflare Access login page. Complete the login process.
3. After authentication you are sent back to `https://volunteers.grassrootsmvt.org/call.html`.
4. When the page reloads it performs a single authenticated fetch to `/whoami`. Inspect the Network tab and confirm:
   - `whoami` responds `200` with `{ ok: true, email: … }`.
   - `Access-Control-Allow-Credentials: true` is present.
   - No further redirects are triggered.
5. Click **Get Next** to load a voter. Submit a call outcome to ensure `POST /complete` succeeds while authenticated.

✅ Expected: Exactly one Access challenge per browser session. After the cookie is set, the page should remain on the volunteer UI without bouncing back to Access.

---

## 3. Configuration Cross-Checks

Run these commands any time the authentication flow misbehaves:

```bash
# 1. Inspect the official login URL returned by Cloudflare (source of truth)
curl -I https://api.grassrootsmvt.org/whoami | grep -i location

# 2. Confirm Worker secrets match that configuration
npx wrangler secret list --env production | grep -E "TEAM_DOMAIN|POLICY_AUD"
```

In Cloudflare Zero Trust (dash.cloudflare.com → Zero Trust → Access → Applications):

- Ensure the **Grassroots API** self-hosted application covers `api.grassrootsmvt.org/*`.
- Attach a policy that ALLOWs the volunteer email group. A mismatch here produces the classic login loop.
- Verify that the **Volunteers UI** application either shares the same policy or is not protected, so the UI can load before the API challenge fires.

✅ Expected `Location` header format:

```
https://<team-domain>/cdn-cgi/access/login/api.grassrootsmvt.org?kid=<AUD>&redirect_url=%2Fwhoami
```

If the header differs, update the Worker or Access configuration before redeploying.

---

## 4. Troubleshooting Login Loops

If the browser keeps bouncing between the volunteer UI and Cloudflare Access:

1. **Inspect `/whoami?nav=1&to=…`** — if it returns `401` instead of redirecting, re-check the `TEAM_DOMAIN` and `POLICY_AUD` secrets.
2. **Confirm Access policies** — the volunteer email list must be allowed on the API application. Deny or mismatched rules yield infinite redirects.
3. **Verify CORS** — the Worker must respond with `Access-Control-Allow-Origin: https://volunteers.grassrootsmvt.org` and `Access-Control-Allow-Credentials: true`.
4. **Reset session storage** — clear `access:redirected` and `accessReady:v1` from `sessionStorage` on the volunteers domain to force a fresh navigation attempt.

Helpful console snippets:

```javascript
sessionStorage.getItem('access:redirected');
sessionStorage.getItem('accessReady:v1');
```

---

## 5. Success Criteria

You are finished when all of the following hold:

- Access login occurs exactly once per session.
- `/whoami` returns `{ ok: true, email }` without retries.
- `/call` and `/complete` succeed after authentication.
- The `Location` header from `curl -I https://api.grassrootsmvt.org/whoami` matches the login URL that `worker/src/index.js` builds.

Document any deviations and resolve them by consulting the official Cloudflare documentation before changing Worker logic.