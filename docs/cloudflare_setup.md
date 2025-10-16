🌐 Cloudflare Setup Guide - GrassrootsMVT (Final Overview)

Last Updated: 2025-10-12
Maintained by: GrassrootsMVT DevOps

🧭 Summary of Current State

The GrassrootsMVT production Cloudflare Worker provides the complete volunteer engagement API, protected by
Cloudflare Access. The architecture now follows a single, streamlined authentication path:

✅ Cloudflare Access challenge in the Worker via `/whoami?nav=1&to=…` top-level redirects  
✅ Service token authentication for automation (unchanged)  
✅ Public healthcheck endpoint for uptime monitoring
✅ Complete API suite: /call, /canvass, /pulse, /templates (exposed via `/api/*`)
✅ Database performance optimized (95% query speed improvement)

Everything below reflects the current Worker (`worker/src/index.js`) behaviour. Always confirm against the
[official Cloudflare Zero Trust documentation](https://developers.cloudflare.com/cloudflare-one/) when
making changes or debugging authentication issues.

⚙️ Worker & Wrangler Configuration
worker/wrangler.toml
name = "grassrootsmvt"
account_id = "8bfd3f60fbdcc89183e9e312fb03e86e"
main = "src/index.js"
compatibility_date = "2025-10-08"
workers_dev = true

# Local Development Variables
[vars]
ENVIRONMENT = "local"
ALLOW_ORIGIN = "http://localhost:8788"
DATA_BACKEND = "d1"
ACCESS_HEADER = "Cf-Access-Authenticated-User-Email"
ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion"
DEBUG_CORS = "true"

# Local D1 Preview Binding
[[d1_databases]]
binding = "d1"
database_name = "wy_preview"
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
migrations_dir = "db/migrations"

# Production Environment
[env.production]
preview_urls = true
ENVIRONMENT = "production"
ALLOW_ORIGIN = "https://volunteers.grassrootsmvt.org"
ACCESS_HEADER = "Cf-Access-Authenticated-User-Email"
ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion"
DATA_BACKEND = "d1"
DEBUG_CORS = "false"

# Production D1 Binding
[[env.production.d1_databases]]
binding = "d1"
database_name = "wy"
database_id = "4b4227f1-bf30-4fcf-8a08-6967b536a5ab"
migrations_dir = "db/migrations"

🌐 CORS Configuration
In production, set ALLOW_ORIGIN to https://volunteers.grassrootsmvt.org only. Use the preview environment for any *.pages.dev testing.

🗄️ D1 Migrations
# Local (preview)
npx wrangler d1 migrations apply d1 --local

# Production
npx wrangler d1 migrations apply d1 --remote

🔐 Cloudflare API Token Configuration

Token Name: Grassrootsmvt2025Token

Type	Resource	Access	Purpose
Account	Workers Scripts	Edit	Deploy/manage Workers
Account	D1	Edit	Manage D1 migrations
Account	Pages	Edit	Manage UI deployments
Account	Account Settings	Read	Identify account context
Zone	Zone Settings	Read	DNS/SSL verification
User	User Details	Read	Identify authenticated user

Scope:
Account → 8bfd3f60fbdcc89183e9e312fb03e86e
Zone → grassrootsmvt.org

Set before deploying:

export CLOUDFLARE_API_TOKEN="CFDTxxxxxx..."
export CLOUDFLARE_ACCOUNT_ID="8bfd3f60fbdcc89183e9e312fb03e86e"


Validate:

npx wrangler whoami


✅ Expected output:

👋 You are logged in with an API Token!
Account ID: 8bfd3f60fbdcc89183e9e312fb03e86e

🧠 Zero Trust Access Integration
1️⃣ Application: Grassroots API

Subdomains:

api.grassrootsmvt.org/api/* → Worker API

volunteers.grassrootsmvt.org/* → Volunteer UI

Session Duration: 24 hours

Application AUD: 76fea0745afec089a3eddeba8d982b10aab6d6f871e43661cb4977765b78f3f0

JWT Validation Source: Cloudflare Access public key

2️⃣ Access Policies
Policy	Action	Used By	Description
Bypass Policy for Service Tokens	BYPASS	Grassroots API	Allows valid CF-Access-Client-* credentials
Admin	ALLOW	Grassroots API	Restricts admin dashboard
Volunteers Emails	ALLOW	Grassroots API	Allows volunteer browser login

Verify in Access → Policies:
Each policy shows Used by applications: 1.

3️⃣ Environment Secrets
npx wrangler secret put TEAM_DOMAIN --env production
# skovgard.cloudflareaccess.com

npx wrangler secret put POLICY_AUD --env production
# paste the AUD tag shown in Zero Trust


Verify:

npx wrangler secret list --env production

Quick sanity check (source of truth for login URL):

```bash
curl -I https://api.grassrootsmvt.org/whoami | grep -i location
```

The returned `Location` header must match the login URL you redirect to inside
`worker/src/index.js` (host-in-path: `/cdn-cgi/access/login/api.grassrootsmvt.org`).

🔧 Service Token (Automation) Access

Service tokens are used for backend scripts, CI, and tests without browser login.

Create one under:
Zero Trust → Access → Service Auth → Create Token

Save both:

export CF_ACCESS_CLIENT_ID="b583417ba48f001404050e9992665e31"
export CF_ACCESS_CLIENT_SECRET="eccab2e4cd8ea2ec9af75920e3409042f9dfa475d990be75be7f1ea24e813d04"


✅ Test from CLI:

curl -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     https://api.grassrootsmvt.org/api/whoami


Expected JSON response:

{
  "ok": true,
  "source": "Service Token",
  "environment": "production"
}

🌍 Browser Volunteer Authentication

1️⃣ Visit https://volunteers.grassrootsmvt.org/call.html (or any volunteer UI page).  
   The page immediately calls `https://api.grassrootsmvt.org/whoami`. If the user is not authenticated,
   the Worker issues a `302` to `https://api.grassrootsmvt.org/whoami?nav=1&to=<return url>` which then
   redirects through the Cloudflare Access login hosted at `https://skovgard.cloudflareaccess.com`.

2️⃣ After completing the Access login, Cloudflare sets the `CF_Authorization` cookie on
    `api.grassrootsmvt.org` and redirects back to the original volunteer page.

3️⃣ Reloading the page (or clicking **Get Next**) triggers a single authenticated request:

```bash
curl -I https://api.grassrootsmvt.org/whoami
```

✅ Expected `Location` header when unauthenticated:

```
https://skovgard.cloudflareaccess.com/cdn-cgi/access/login/api.grassrootsmvt.org?kid=<AUD>&redirect_url=%2Fwhoami
```

✅ Expected JSON response when authenticated:

```json
{
  "ok": true,
  "email": "volunteer@example.com",
  "environment": "production"
}
```

🧩 Health Check

Public (unauthenticated) route:

https://api.grassrootsmvt.org/api/ping


✅ Expected:

hello world

🧪 Local Development Testing
npx wrangler dev
curl http://127.0.0.1:8787/api/ping
curl -H "Cf-Access-Authenticated-User-Email: volunteer@grassrootsmvt.org" \
  http://127.0.0.1:8787/whoami

🧰 Deployment Commands
# Deploy production Worker
npx wrangler deploy --env production

# Apply database migrations
npx wrangler d1 migrations apply d1 --remote

# Monitor production logs
npx wrangler tail --env production

✅ Final Verification Checklist
Item	Status	Description
Wrangler deploys successfully	✅	Ignore [vars] inheritance warning
D1 connected	✅	Production + local
JWT browser login	✅	Verified (/whoami)
Service token login	✅	Tested, returns JSON
Health check	✅	/api/ping reachable
Access policies	✅	All linked to application
CI/CD ready	⚙️	Safe to re-enable GitHub Actions once secrets are restored
🔄 Recommended Next Steps

Add /api/secure/test route to validate both JWT and Service Token headers.

Re-enable CI/CD with GitHub Actions using your Grassrootsmvt2025Token.

Add scripts/restore_env.sh to restore secrets easily before deploys.

Create an audit log in D1 for login events (email, method, timestamp).

End of Setup Summary
✅ GrassrootsMVT Worker now fully deployed and protected by Cloudflare Zero Trust.