# 🚨 CORS Preflight Issue: Cloudflare Access Blocking OPTIONS Requests

## 🔍 **Issue Identified**

The CORS preflight handler has been added to the Worker code successfully, but **Cloudflare Access is intercepting and blocking OPTIONS requests** before they reach our Worker.

### **Current Status:**
- ✅ **Worker Code:** CORS preflight handler added correctly
- ✅ **Deployment:** Successfully deployed (Version ID: b838c6a0-7a14-47b8-8c1c-c0f9179b87a6)
- ❌ **Functionality:** OPTIONS requests return 400/403 from Cloudflare Access

## 🔧 **Root Cause**

Cloudflare Access applies authentication **before** requests reach the Worker. When browsers send CORS preflight OPTIONS requests, they:
1. Don't include authentication headers (by design)
2. Get blocked by Cloudflare Access with 400/403 errors
3. Never reach our Worker's OPTIONS handler

## 💡 **Required Solutions**

### **Option 1: Configure Cloudflare Access to Allow OPTIONS (RECOMMENDED)**

In Cloudflare Zero Trust Dashboard:
1. Go to **Access** → **Applications** → **Grassroots API**
2. Add a **Bypass Policy** for OPTIONS requests:
   ```
   Policy Name: CORS Preflight Bypass
   Action: Bypass
   Rules: Request Method equals OPTIONS
   ```

### **Option 2: Create Public Health Check Endpoint**

Modify Cloudflare Access application to exclude a public endpoint:
1. Change application path from `api.grassrootsmvt.org/*` to `api.grassrootsmvt.org/api/*`
2. Create public `/ping` endpoint outside `/api/` path
3. Keep CORS handler for authenticated endpoints

### **Option 3: Cloudflare Workers Route-Level Control**

Use Worker route patterns to handle CORS before Access:
1. Configure Worker to run on `*grassrootsmvt.org/*`
2. Handle OPTIONS at Worker level
3. Proxy authenticated requests through

## 📋 **Current Code Status**

The following CORS preflight handler is now active in the Worker:

```javascript
// CORS Preflight handler for OPTIONS requests
if (request.method === 'OPTIONS') {
  const origin = env.ALLOW_ORIGIN || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    }
  });
}
```

## 🎯 **Next Steps**

1. **Configure Cloudflare Access** to allow OPTIONS requests (requires dashboard access)
2. **Test CORS preflight** after Access configuration
3. **Verify UI ↔ API communication** with JWT headers

## 🧪 **Testing Commands**

After fixing Cloudflare Access configuration:

```bash
# Test CORS preflight
curl -i -X OPTIONS \
  -H "Origin: https://volunteers.grassrootsmvt.org" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization, Cf-Access-Jwt-Assertion" \
  https://api.grassrootsmvt.org/api/ping

# Expected: HTTP/2 204 with CORS headers
```

The Worker code is ready - the Cloudflare Access configuration needs updating to allow OPTIONS requests to reach our CORS handler.