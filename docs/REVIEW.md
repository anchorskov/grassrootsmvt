# Access Fix Review Summary

## What Changed

### 1. Fixed Access Login URL Format
- **Before**: `/cdn-cgi/access/login/<HOSTNAME>?kid=<AUD>` (causing 400 Bad Request)
- **After**: `/cdn-cgi/access/login/<AUD>?redirect_url=<URL>` (correct format)

### 2. Updated Interstitial Auth Flow
- **ui/connecting.html**: Now uses AUD directly in path instead of kid parameter
- **ui/src/apiClient.js**: Updated to use `returnTo` sessionStorage key consistently
- Removed deprecated `kid` parameter approach that was causing 400 errors

### 3. Ensured Credentials Include
- All API calls maintain `credentials: "include"` for proper cookie handling
- Public `/auth/config` endpoint remains accessible without credentials
- Protected endpoints properly redirect through Access

## Why These Changes

### Root Cause
The 400 Bad Request error was caused by using the newer `kid=<AUD>` parameter format, which appears to be deprecated or not supported in this Access configuration. The classic format with AUD directly in the path works reliably.

### Top-Level Navigation Required
- Access must set cookies on the protected origin (`api.grassrootsmvt.org`)
- Browser security policies block cookie setting from XHR/fetch
- Top-level navigation via connecting.html ensures proper cookie issuance

### Consistent Session Management
- Unified sessionStorage keys (`returnTo` vs previous mixed approach)
- Clear separation between public config fetching and authenticated flows

## How to Test

### 1. Auth Config (Public)
```bash
curl -i https://api.grassrootsmvt.org/auth/config
# Expected: HTTP/2 200 with JSON containing teamDomain and policyAud
```

### 2. Protected API (Redirect)
```bash
curl -i https://api.grassrootsmvt.org/api/ping
# Expected: HTTP/2 302 Location to Access login with AUD in path
```

### 3. Manual Login URL Test
Open browser to:
```
https://skovgard.cloudflareaccess.com/cdn-cgi/access/login/api.grassrootsmvt.org?redirect_url=https%3A%2F%2Fapi.grassrootsmvt.org%2Fauth%2Ffinish%3Fto%3Dhttps%253A%252F%252Fvolunteers.grassrootsmvt.org%252F
```
Expected: Access SSO flow, then return to UI (no 400 error)

### 4. End-to-End UI Test
1. Visit `https://volunteers.grassrootsmvt.org/`
2. Should see connecting spinner, then Access login
3. After auth, return to UI with working API calls
4. DevTools Network tab should show `credentials: include` on API requests

## Files Modified

- `ui/connecting.html` - Fixed Access URL format (AUD in path)
- `ui/src/apiClient.js` - Updated sessionStorage key and navigation flow
- `docs/REVIEW.md` - This summary document

## Key Technical Details

- **Access URL Format**: `https://skovgard.cloudflareaccess.com/cdn-cgi/access/login/<POLICY_AUD>`
- **Session Keys**: Using `returnTo` for consistent navigation flow
- **CORS Headers**: Maintained proper `Access-Control-Allow-Credentials: true`
- **Public Endpoint**: `/auth/config` bypasses Access and returns config data

The fix resolves the 400 Bad Request by using the correct, well-supported Access login URL format.