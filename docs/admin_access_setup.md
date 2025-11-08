# Admin Access Setup Guide - GrassrootsMVT

**Date:** November 6, 2025  
**Purpose:** Configure admin-only routes using Cloudflare Zero Trust

---

## Overview

Admin access is controlled through **Cloudflare Zero Trust Access Groups** combined with **environment variables** in your Worker. You do **NOT** need a separate subdomain like `admin.grassrootsmvt.org`.

### Architecture Options

#### ✅ Option 1: Path-Based (Recommended)
```
volunteers.grassrootsmvt.org/admin/*  → Admin-only policy
volunteers.grassrootsmvt.org/*        → All volunteers policy
```

**Pros:**
- Single domain, simpler DNS
- Easier to manage CORS
- Unified authentication flow
- Easier for users (one URL to remember)

**Cons:**
- Need careful policy ordering (admin path must come first)

---

#### Option 2: Separate Subdomain
```
admin.grassrootsmvt.org/*             → Admin-only policy
volunteers.grassrootsmvt.org/*        → All volunteers policy
```

**Pros:**
- Complete isolation
- Clearer separation of concerns
- Easier to configure different session durations

**Cons:**
- Need separate DNS record
- Need to manage CORS for multiple origins
- More complex deployment

---

## Implementation Steps

### 1. Create Admin Group in Cloudflare Zero Trust

1. Go to **[Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)** → **Access** → **Access Groups**
2. Click **Add a Group**
3. Configure:

```yaml
Group Name: GrassrootsMVT Admins

Include:
  - Rule Type: Emails
  - Value: admin@grassrootsmvt.org, your-email@example.com
  
  # OR use Email Domain if all emails from your org are admins
  - Rule Type: Emails ending in
  - Value: @grassrootsmvt.org
```

4. Click **Save**

---

### 2A. Create Path-Based Policy (Recommended)

1. Go to **Access** → **Applications**
2. Find your existing **"Grassroots API"** application
3. Click **Policies** tab
4. Click **Add a Policy** (this will be evaluated BEFORE existing policies)

```yaml
Policy Name: Admin Dashboard Access
Action: Allow
Decision: Allow

Include:
  - Rule Type: Access groups
  - Value: GrassrootsMVT Admins

Application Path:
  Include: 
    - Path: /admin/*
```

5. **CRITICAL:** Drag this policy to the **top** of the policy list (it must be evaluated first)
6. Click **Save**

Your policy order should now be:
1. ⬆️ **Admin Dashboard Access** (`/admin/*` → Admin group only)
2. **Volunteers Emails** (`/*` → All volunteers)

---

### 2B. Create Separate Subdomain (Alternative)

1. **Add DNS Record:**
   - Go to **Cloudflare** → **DNS** → **Records**
   - Click **Add record**
   ```
   Type: CNAME
   Name: admin
   Target: grassrootsmvt.anchorskov.workers.dev
   Proxy status: Proxied (orange cloud)
   ```

2. **Create New Application:**
   - Go to **Zero Trust** → **Access** → **Applications**
   - Click **Add an Application** → **Self-hosted**
   ```yaml
   Application name: Admin Dashboard
   Session Duration: 24 hours
   Application domain: admin.grassrootsmvt.org
   ```

3. **Add Policy:**
   ```yaml
   Policy Name: Admins Only
   Action: Allow
   
   Include:
     - Rule Type: Access groups
     - Value: GrassrootsMVT Admins
   ```

---

### 3. Configure Admin Emails in Worker

Set the `ADMIN_EMAILS` environment variable with comma-separated admin email addresses:

```bash
cd /home/anchor/projects/grassrootsmvt/worker

# Set the admin emails secret
npx wrangler secret put ADMIN_EMAILS --env production
# When prompted, enter: admin@grassrootsmvt.org,your-email@example.com
```

**Or** add to `wrangler.toml` (less secure, but easier for development):

```toml
[env.production]
# ... existing config ...
ADMIN_EMAILS = "admin@grassrootsmvt.org,your-email@example.com"
```

---

### 4. Deploy Worker Changes

```bash
cd /home/anchor/projects/grassrootsmvt/worker
npx wrangler deploy --env production
```

---

## Testing Admin Access

### Test 1: Check Admin Status

```bash
curl https://volunteers.grassrootsmvt.org/api/admin/whoami
```

**Expected Response (if you're an admin):**
```json
{
  "ok": true,
  "email": "your-email@example.com",
  "isAdmin": true,
  "environment": "production"
}
```

**Expected Response (if you're not an admin):**
```json
{
  "ok": true,
  "email": "volunteer@example.com",
  "isAdmin": false,
  "environment": "production"
}
```

---

### Test 2: Access Admin Stats

```bash
curl https://volunteers.grassrootsmvt.org/api/admin/stats
```

**Expected Response (if you're an admin):**
```json
{
  "ok": true,
  "stats": {
    "total_voters": 12345,
    "total_contacts": 678,
    "by_method": [
      { "method": "phone", "count": 450 },
      { "method": "door", "count": 228 }
    ],
    "by_outcome": [
      { "outcome": "connected", "count": 320 },
      { "outcome": "vm", "count": 180 }
    ]
  },
  "admin": "your-email@example.com"
}
```

**Expected Response (if you're not an admin):**
```json
{
  "ok": false,
  "error": "Admin access required"
}
```

---

## Admin Routes Available

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/admin/whoami` | GET | User | Check if current user is admin |
| `/api/admin/stats` | GET | Admin | Get system statistics |

---

## Creating New Admin Routes

To add more admin-only endpoints, follow this pattern:

```javascript
router.get('/admin/your-route', async (request, env, ctx) => {
  try {
    // Authenticate and check admin status
    const auth = await ensureAuth(request, env, ctx.config);
    requireAdmin(auth.email, env); // Throws 403 if not admin
    
    // Your admin logic here
    const data = { /* ... */ };
    
    return ctx.jsonResponse(
      { ok: true, data },
      200,
      ctx.allowedOrigin
    );
  } catch (err) {
    if (err?.status === 403) {
      return ctx.jsonResponse(
        { ok: false, error: 'Admin access required' },
        403,
        ctx.allowedOrigin
      );
    }
    console.error('/admin/your-route error', err);
    return ctx.jsonResponse(
      { ok: false, error: String(err?.message || err) },
      500,
      ctx.allowedOrigin
    );
  }
});
```

---

## Helper Functions Available

### `isAdmin(email, env)`
Check if an email is in the admin list:

```javascript
const userIsAdmin = isAdmin('user@example.com', env);
// Returns true/false
```

### `requireAdmin(email, env)`
Require admin access (throws error if not admin):

```javascript
requireAdmin(auth.email, env);
// Throws Error with status=403 if not admin
```

---

## Security Notes

1. **Always use HTTPS** - Never expose admin endpoints over HTTP
2. **Double-check email casing** - Emails are normalized to lowercase for comparison
3. **Use secrets for production** - Don't commit admin emails to git
4. **Local development bypass** - In local mode, all users are treated as admins for testing
5. **Cloudflare Access is first line of defense** - Worker checks are second layer

---

## Troubleshooting

### Issue: Getting 403 even though I'm an admin

**Check:**
1. Verify email matches exactly:
   ```bash
   curl https://volunteers.grassrootsmvt.org/api/whoami
   ```
2. Check `ADMIN_EMAILS` secret:
   ```bash
   npx wrangler secret list --env production
   ```
3. Redeploy after setting secret:
   ```bash
   npx wrangler deploy --env production
   ```

---

### Issue: Can't access `/admin/*` paths at all (getting login loop)

**Check:**
1. Verify Access policy order (admin policy must be first)
2. Verify you're in the "GrassrootsMVT Admins" group
3. Check policy path match: `/admin/*` should match `/admin/stats`

---

### Issue: Regular users can access admin routes

**Check:**
1. Verify `ADMIN_EMAILS` is set correctly
2. Check function is calling `requireAdmin()`:
   ```javascript
   requireAdmin(auth.email, env); // This line must be present
   ```
3. Verify environment is not set to 'local'

---

## Current Status

✅ **Completed:**
- Created `isAdmin()` and `requireAdmin()` functions in `worker/src/auth.js`
- Added admin route examples: `/api/admin/whoami`, `/api/admin/stats`
- Updated imports in `worker/src/index.js`

⏳ **Pending:**
- Set `ADMIN_EMAILS` secret in Cloudflare
- Create "GrassrootsMVT Admins" access group
- Configure path-based or subdomain policy
- Deploy changes to production
- Test admin access

---

## Next Steps

1. **Decide:** Path-based (recommended) or separate subdomain?
2. **Create Access Group:** Add your admin emails
3. **Set Secret:** `npx wrangler secret put ADMIN_EMAILS --env production`
4. **Deploy:** `npx wrangler deploy --env production`
5. **Test:** Visit `https://volunteers.grassrootsmvt.org/api/admin/whoami`

---

**Questions?** Check the [Cloudflare Zero Trust Documentation](https://developers.cloudflare.com/cloudflare-one/policies/access/)
