# Cloudflare Setup Guide - GrassrootsMVT

## Overview
This document describes how the GrassrootsMVT project integrates with **Cloudflare Workers**, **D1 Databases**, and **Zero Trust Access (JWT authentication)**. It covers setup, environment configuration, secure authentication, and deployment best practices.

## Architecture Components

GrassrootsMVT uses:
- **Cloudflare Workers** → Host API endpoints and middleware  
- **Cloudflare D1** → Store voter and volunteer data  
- **Zero Trust Access** → Restrict Worker access to approved volunteer/admin emails  
- **Wrangler** → CLI for local development and deployments  

## Environment Configuration

### Local Environment Variables
All sensitive configuration values are stored in `.env` file (not committed to git). Example structure:

```bash
# Core Configuration
ENVIRONMENT=local
DATA_BACKEND=d1
ALLOW_ORIGIN=http://localhost:8788

# Database Configuration
SQLITE_PATH=<path_to_local_sqlite_file>

# Cloudflare Zero Trust Access (values in .env)
TEAM_DOMAIN=<your_team_domain>
POLICY_AUD=<your_policy_audience_id>
ACCESS_HEADER=Cf-Access-Authenticated-User-Email
ACCESS_JWT_HEADER=Cf-Access-Jwt-Assertion
ALLOWED_EMAILS=<comma_separated_allowed_emails>

# Debug Configuration
DEBUG_CORS=true

```

**Important**: The `.env` file contains actual values and should never be committed to version control. All team members should have their own `.env` file with appropriate values for their environment.

### Production Environment

In your Cloudflare Worker's **Settings → Variables and Secrets**, define the same keys as above with production values. Refer to the `.env` file for current values.

## D1 Database Configuration

### Wrangler Configuration

```toml
# worker/wrangler.toml
name = "grassrootsmvt"
account_id = "8bfd3f60fbdcc89183e9e312fb03e86e"
main = "src/index.js"
compatibility_date = "2025-10-08"
workers_dev = true

[vars]
ENVIRONMENT = "local"
ALLOW_ORIGIN = "http://localhost:8788"

# Local/Preview Database
[[d1_databases]]
binding = "wy_preview"
database_name = "wy_preview"
database_id = "de78cb41-176d-40e8-bd3b-e053e347ac3f"
migrations_dir = "db/migrations"

# Production Environment
[env.production]
ENVIRONMENT = "production"
ALLOW_ORIGIN = "https://grassrootsmvt.org"

[[env.production.d1_databases]]
binding = "wy"
database_name = "wy"
database_id = "4b4227f1-bf30-4fcf-8a08-6967b536a5ab"
migrations_dir = "db/migrations"
```

### Database Operations

```bash
# Apply local migrations
npx wrangler d1 migrations apply wy_preview --local

# Verify local database tables
npx wrangler d1 execute wy_preview --local --command="SELECT name FROM sqlite_master WHERE type='table';"

# Apply production migrations
npx wrangler d1 migrations apply wy --remote

# Check table counts
npx wrangler d1 execute wy_preview --local --command="SELECT COUNT(*) FROM voters;"
```

## Cloudflare Zero Trust Access Configuration

### Step 1: Create Access Application

1. Navigate to **Zero Trust → Access → Applications**
2. Click **Add an Application → Self-hosted**
3. Configure application settings:
   - **Name**: Grassroots API
   - **Session duration**: 24 hours
   - **Application domain**: `api.grassrootsmvt.org`
   - **Path**: `/api/*`

4. **Important**: Copy the Application Audience (AUD) Tag and store it in your `.env` file as `POLICY_AUD`

### Step 2: Configure Access Policies

**Policy 1 – Administrators**
- **Action**: ALLOW
- **Include**: Email addresses ending with `@grassrootsmvt.org`
- **Require**: MFA (recommended)

**Policy 2 – Volunteers**  
- **Action**: ALLOW
- **Include**: Specific volunteer email addresses
- **Session duration**: 8 hours

### Step 3: Authentication Headers

When a user is authenticated by Cloudflare Access, every request includes these headers:

| Header | Description |
|--------|-------------|
| `Cf-Access-Authenticated-User-Email` | Authenticated email address |
| `Cf-Access-Jwt-Assertion` | Signed JWT proving authentication |

## JWT Verification in Workers

### Basic Implementation

```javascript
import { jwtVerify, createRemoteJWKSet } from 'jose';

export default {
  async fetch(request, env) {
    const token = request.headers.get(env.ACCESS_JWT_HEADER);
    const userEmail = request.headers.get(env.ACCESS_HEADER);

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing required CF Access JWT' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const JWKS = createRemoteJWKSet(
        new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)
      );

      const { payload } = await jwtVerify(token, JWKS, {
        issuer: env.TEAM_DOMAIN,
        audience: env.POLICY_AUD,
      });

      return new Response(
        JSON.stringify({ 
          ok: true, 
          email: payload.email || userEmail,
          authenticated: true,
          timestamp: new Date().toISOString()
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('JWT Verification Error:', error);
      return new Response(
        JSON.stringify({ ok: false, error: 'Authentication failed' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
```

### Simplified Development Authentication

For local development, you can use simplified email header checking:

```javascript
// Development-friendly authentication
export default {
  async fetch(request, env) {
    const userEmail = request.headers.get(env.ACCESS_HEADER);
    const allowedEmails = env.ALLOWED_EMAILS?.split(',') || [];
    
    if (!userEmail || !allowedEmails.includes(userEmail)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        email: userEmail,
        environment: env.ENVIRONMENT 
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

## Testing the Integration

### Local Development

Start the development server:

```bash
cd worker
npx wrangler dev
```

Test endpoints:

```bash
# Basic connectivity
curl http://127.0.0.1:8787/api/ping

# Authentication test (development)
curl -H "Cf-Access-Authenticated-User-Email: volunteer@grassrootsmvt.org" \
     http://127.0.0.1:8787/api/whoami

# Database connectivity
curl http://127.0.0.1:8787/api/db/tables
```

### Production Testing

Once deployed:

```bash
# Basic connectivity  
curl -f https://grassrootsmvt.anchorskov.workers.dev/api/ping

# Authentication test (requires real Cloudflare Access)
curl https://grassrootsmvt.anchorskov.workers.dev/api/whoami
```

## Deployment Process

### Deploy Worker

```bash
cd worker

# Deploy to production
npx wrangler deploy --env=production

# Verify deployment
npx wrangler deployments list
```

### Deploy Pages (if applicable)

```bash
cd ui

# Deploy frontend
npx wrangler pages deploy . --project-name=grassrootsmvt

# Verify deployment
curl -f https://grassrootsmvt.org/
```

## Troubleshooting

### Common Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Missing required CF Access JWT | Missing authentication header | Ensure Cloudflare Access is properly configured |
| Invalid audience | Wrong AUD tag | Verify `POLICY_AUD` in `.env` matches Cloudflare dashboard |
| JWT verification failed | Wrong TEAM_DOMAIN | Check Worker environment variables |
| Database not connecting | Wrong binding name | Verify binding names match `wrangler.toml` |
| CORS errors | Missing CORS headers | Add proper CORS configuration to Worker |

### Debug Commands

```bash
# Check Cloudflare authentication
npx wrangler whoami

# Test database connectivity
npx wrangler d1 execute wy_preview --local --command="SELECT 1;"

# Monitor Worker logs
npx wrangler tail

# Check environment variables
npx wrangler secret list
```

### Environment Variable Reference

| Key | Description | Example |
|-----|-------------|---------|
| `TEAM_DOMAIN` | Cloudflare Access team domain | `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | Application Audience tag from Access app | `abc123def-456-789-ghi` |
| `ACCESS_HEADER` | Email header name | `Cf-Access-Authenticated-User-Email` |
| `ACCESS_JWT_HEADER` | JWT header name | `Cf-Access-Jwt-Assertion` |
| `ALLOWED_EMAILS` | Development email whitelist | `admin@example.com,volunteer@example.com` |
| `ENVIRONMENT` | Current environment | `local` or `production` |

## Security Best Practices

1. **Never commit** `.env` file or any files containing secrets
2. **Rotate secrets** regularly, especially for production
3. **Use least privilege** for API tokens and Access policies
4. **Monitor logs** for authentication failures and suspicious activity
5. **Test Access policies** before deploying to production
6. **Use MFA** for administrative accounts
7. **Regularly audit** Access logs and permissions

## References

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Access Documentation](https://developers.cloudflare.com/cloudflare-one/identity/users/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)

Migration and Verification
# Apply local migrations
npx wrangler d1 migrations apply d1 --local

# Verify local database tables
npx wrangler d1 execute d1 --local --command="SELECT name FROM sqlite_master;"

# Apply production migrations
npx wrangler d1 migrations apply d1 --remote

🔑 Cloudflare Zero Trust Access Configuration
Step 1. Create Application

In Zero Trust → Access → Applications, click Add an Application → Self-hosted

Name: Grassroots API

Session duration: 24 hours

Add hostnames:

api.grassrootsmvt.org/api/*

volunteers.grassrootsmvt.org/*

Copy the Application Audience (AUD) Tag — you’ll store it as POLICY_AUD

Step 2. Configure Access Policies

Policy 1 – Admins

Action: ALLOW

Include emails: admin@grassrootsmvt.org

Policy 2 – Volunteers

Action: ALLOW

Include emails: volunteer@grassrootsmvt.org

Step 3. Understanding the Headers

When a user is authenticated by Cloudflare Access, every request includes:

Header	Description
Cf-Access-Authenticated-User-Email	Authenticated email address
Cf-Access-Jwt-Assertion	Signed JWT proving authentication
🔍 Programmatic Verification (Workers)

To verify tokens inside your Worker, use the jose package:

import { jwtVerify, createRemoteJWKSet } from 'jose';

export default {
  async fetch(request, env) {
    const token = request.headers.get(env.ACCESS_JWT_HEADER);

    if (!token) {
      return new Response('Missing required CF Access JWT', {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));

      const { payload } = await jwtVerify(token, JWKS, {
        issuer: env.TEAM_DOMAIN,
        audience: env.POLICY_AUD,
      });

      return new Response(
        JSON.stringify({ ok: true, email: payload.email, message: "Access verified" }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

🧪 Testing the Integration
Local Development

Use Wrangler’s local mode:

npx wrangler dev


Test endpoints:

curl http://127.0.0.1:8787/api/ping
curl -H "Cf-Access-Authenticated-User-Email: volunteer@grassrootsmvt.org" \
     http://127.0.0.1:8787/api/whoami

Production Testing

Once deployed:

curl -f https://api.grassrootsmvt.org/api/ping
curl -H "Cf-Access-Authenticated-User-Email: volunteer@grassrootsmvt.org" \
     https://api.grassrootsmvt.org/api/whoami

🧰 Deployment Process
# Deploy to Cloudflare Workers
npx wrangler deploy --env production

# View deployed URL
wrangler whoami

🧠 Troubleshooting
Issue	Possible Cause	Fix
Missing required CF Access JWT	Missing header	Ensure Cf-Access-Jwt-Assertion is present
Invalid audience	Wrong AUD tag	Confirm POLICY_AUD matches Cloudflare dashboard
JWT verification failed	Wrong TEAM_DOMAIN	Check Worker env vars and Access domain
Database not connecting	Wrong binding	Verify binding = "d1" matches Wrangler config
🧾 Quick Reference
Key	Description
TEAM_DOMAIN	Cloudflare team domain (Access app issuer)
POLICY_AUD	Application Audience tag
ACCESS_HEADER	Email header used for identifying user
ACCESS_JWT_HEADER	Header containing signed JWT
ALLOWED_EMAILS	Whitelist for internal verification logic
ENVIRONMENT	Either local or production
DATA_BACKEND	Always d1 for this project

Maintained by: GrassrootsMVT DevOps
Last Updated: 2025-10-11