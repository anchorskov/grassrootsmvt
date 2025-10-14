# Deploying GrassrootsMVT

## 0) Prereqs

- Node + `wrangler` installed and logged into the correct Cloudflare account
- DNS for:
  - `api.grassrootsmvt.org` → Worker route
  - `volunteers.grassrootsmvt.org` → Pages project
- Access application created for `api.grassrootsmvt.org/*`

## 1) Set Worker variables/secrets (production)

Required **variables** (plain text):
- `ALLOW_ORIGIN` = `https://volunteers.grassrootsmvt.org,https://grassrootsmvt-production.pages.dev`
- `ENVIRONMENT`  = `production`
- (others as used in the Worker: `DATA_BACKEND`, etc.)

Required **secrets**:
- `TEAM_DOMAIN`  = `skovgard.cloudflareaccess.com`
- `POLICY_AUD`   = `<AUD shown on the Access app page>`

Example:

```bash
cd worker
npx wrangler secret put TEAM_DOMAIN        # paste: skovgard.cloudflareaccess.com
npx wrangler secret put POLICY_AUD         # paste the AUD (kid)
```

## 2) Deploy

From repo root if you have a helper script:

```bash
./deploy_all.sh
```

Or deploy manually:

```bash
cd worker && npx wrangler deploy --env production
# Deploy the Pages site from its project or CI as you normally do
```

## 3) Smoke tests (unauthenticated)

```bash
# public endpoint: should return 200 JSON, not a redirect
curl -i https://api.grassrootsmvt.org/auth/config

# protected endpoint: should 302 to Cloudflare Access
curl -i https://api.grassrootsmvt.org/api/ping
```

## 4) Browser test (end-to-end)

Open https://volunteers.grassrootsmvt.org

1. You should see a brief "Connecting…" interstitial
2. You're navigated to https://skovgard.cloudflareaccess.com/.../login/api.grassrootsmvt.org?...
3. After login, you're sent to: https://api.grassrootsmvt.org/auth/finish?to=<UI_URL>
4. You land back on the UI, authenticated.

Open DevTools → Network:
- All API requests include `credentials: include`
- No XHR requests to `cdn-cgi/access/*`

## 5) CORS preflight check (should allow credentials)

```bash
curl -i -X OPTIONS https://api.grassrootsmvt.org/api/ping \
  -H "Origin: https://volunteers.grassrootsmvt.org" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization, Cf-Access-Jwt-Assertion"
```

Expected response headers include:
- `Access-Control-Allow-Origin: https://volunteers.grassrootsmvt.org`
- `Access-Control-Allow-Credentials: true`

## 6) Common issues

**"Unable to find your Access application"**
- The login URL path must be `/cdn-cgi/access/login/<API_HOSTNAME>` (e.g., `.../login/api.grassrootsmvt.org`), not `/login/<AUD>`.
- Ensure the Access app hostname is exactly `api.grassrootsmvt.org` with path `/*`.

**/auth/config redirects (shouldn't)**
- Confirm the Access Bypass policy for `GET /auth/config`.
- Make sure your Worker route includes `/auth/config`.

**CORS errors in the UI**
- Ensure the Worker returns:
  - `Access-Control-Allow-Origin` with the UI origin and
  - `Access-Control-Allow-Credentials: true`
- All UI fetch calls to the Worker must set `credentials: "include"`.

## 7) Create a review bundle

From repo root:

```bash
zip -r /tmp/grassroots-review-$(date +%Y%m%d%H%M).zip \
  worker/wrangler.toml \
  worker/src/index.js \
  ui/connecting.html \
  ui/index.html \
  ui/src/apiClient.js \
  README.md \
  ACCESS.md \
  DEPLOYING.md
```

(Optionally add "zip:review" to package.json to run this easily.)