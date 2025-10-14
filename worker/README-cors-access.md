# CORS + Cloudflare Access

- UI origin: https://volunteers.grassrootsmvt.org
- API: https://api.grassrootsmvt.org
- Access: enabled on the API app for domains:
  - api.grassrootsmvt.org/*
  - grassrootsmvt.org/api/*
- Access CORS: "Bypass OPTIONS to origin" is ON. Worker answers preflight.
- Auth in browser: uses CF_Authorization cookie automatically with `fetch(..., { credentials: "include" })`.
- Auth in scripts:
  - Option 1: Use `cloudflared access curl https://api.grassrootsmvt.org/...`
  - Option 2: Send Cf-Access-Jwt-Assertion header (Worker accepts header or cookie)
  - Option 3: Use Access Service Token (CF-Access-Client-Id + CF-Access-Client-Secret)

## Worker expectations
- Preflight OPTIONS returns 204 with allow headers.
- All API responses include:
  - Access-Control-Allow-Origin: env.ALLOW_ORIGIN
  - Vary: Origin

## Secrets and vars (production)
- POLICY_AUD = Audience from the API Access app
- TEAM_DOMAIN = your Zero Trust team subdomain name only (no dots)
- ALLOW_ORIGIN = https://volunteers.grassrootsmvt.org
- DATA_BACKEND = d1
- ENVIRONMENT = production
- DEBUG_CORS = false

## Health
- If you want `/api/ping` public, add an Access bypass policy for path `/api/ping`. Otherwise it remains protected.

## Test commands
```bash
# Preflight (Worker answers)
curl -i -X OPTIONS https://api.grassrootsmvt.org/api/ping \
  -H "Origin: https://volunteers.grassrootsmvt.org" \
  -H "Access-Control-Request-Method: GET"

# Identity via Access cookie
cloudflared access curl https://api.grassrootsmvt.org/api/whoami -i
```