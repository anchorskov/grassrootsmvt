# 🔐 JWT Authentication Implementation Verification Steps

## Overview
This document provides step-by-step verification instructions for the newly implemented global `window.apiFetch` function with Cloudflare Access JWT authentication.

## Implementation Summary

### Core Components Added:
1. **Global API Client**: `/ui/src/apiClient.js` - Production-ready authentication handler
2. **Authentication Test Page**: `/ui/auth-test.html` - Comprehensive testing interface
3. **Updated HTML Pages**: Enhanced `index.html`, `call.html`, and `canvass/index.html` with authentication status

### Key Features Implemented:
- ✅ Global `window.apiFetch()` function with automatic JWT handling
- ✅ Cloudflare Access cookie extraction (`CF_Authorization`)
- ✅ Automatic authentication headers (`Cf-Access-Jwt-Assertion`)
- ✅ Error handling with 401/403 redirect to `/cdn-cgi/access/login`
- ✅ Offline request queueing with localStorage/ServiceWorker
- ✅ Toast notification system
- ✅ Authentication status indicators
- ✅ Retry logic with exponential backoff

## Verification Steps

### Step 1: Local Development Testing

**Prerequisites:**
```bash
cd /home/anchor/projects/grassrootsmvt
npx wrangler pages dev ui --port 8080
```

**1.1 Test Authentication Test Page**
1. Open: http://localhost:8080/auth-test.html
2. Verify page loads with authentication status
3. Click "Test window.apiFetch" - should show all global functions available
4. Click "Run All Tests" - should test API endpoints
5. Check browser console for authentication logs

**Expected Results:**
- ✅ All global functions (apiFetch, showToast, getAuthStatus, checkAuth) available
- ✅ API tests may fail in local dev (expected - no Worker API running)
- ✅ Toast notifications should appear
- ✅ Console shows "🔐 API Client initialized successfully"

**1.2 Test Main Pages**
1. Open: http://localhost:8080/index.html
2. Verify authentication status indicator (top-right)
3. Check console for authentication initialization logs

**1.3 Test Call Interface**
1. Open: http://localhost:8080/call.html
2. Verify page loads with authentication status
3. Check console for API initialization

### Step 2: Production Environment Testing

**Prerequisites:**
- Production deployment at https://volunteers.grassrootsmvt.org
- Cloudflare Access authentication enabled

**2.1 Production Authentication Flow**
1. Navigate to: https://volunteers.grassrootsmvt.org/auth-test.html
2. Should redirect to Cloudflare Access login if not authenticated
3. After authentication, should return to test page
4. Authentication status should show "✅ Authenticated"

**2.2 JWT Token Verification**
1. Open browser DevTools → Application → Cookies
2. Verify `CF_Authorization` cookie is present
3. Open Console and run: `window.getAuthStatus()`
4. Should return: `{ isAuthenticated: true, authType: "Cloudflare Access JWT" }`

**2.3 API Functionality Testing**
1. In the auth test page, click "Run All Tests"
2. All API tests should pass:
   - ✅ `/api/ping` - Basic connectivity
   - ✅ `/api/whoami` - User authentication info
   - ✅ `/api/voters` - Data access (with proper authorization)

**2.4 Error Handling Verification**
1. Open DevTools → Application → Storage → Local Storage
2. Delete `access_token` if present
3. Clear `CF_Authorization` cookie
4. Refresh page and try API call
5. Should automatically redirect to `/cdn-cgi/access/login`

### Step 3: Integration Testing

**3.1 Volunteer Hub Integration**
1. Open: https://volunteers.grassrootsmvt.org/
2. Verify authentication status indicator shows "✅ Authenticated"
3. Select county/district filters
4. Click "Start Calls" or "Start Canvass"
5. Verify seamless navigation with maintained authentication

**3.2 Call Interface Integration**
1. Access: https://volunteers.grassrootsmvt.org/call.html
2. Should load voter data automatically using authenticated API calls
3. Submit a call result - should use `window.apiFetch` for POST requests
4. Verify toast notifications appear for successful operations

**3.3 Offline Capability Testing**
1. Open call or canvass interface
2. Disable network connection
3. Submit a form - should show "queued for sync" toast
4. Re-enable network - should process queued requests
5. Check localStorage for `offline_queue` entries

### Step 4: Developer Verification

**4.1 Console Commands**
Test these commands in browser console on production:

```javascript
// Test global function availability
typeof window.apiFetch === 'function'  // Should be true
typeof window.showToast === 'function'  // Should be true
typeof window.getAuthStatus === 'function'  // Should be true

// Test authentication status
window.getAuthStatus()
// Expected: { isAuthenticated: true, isLocalDev: false, tokenPresent: true, authType: "Cloudflare Access JWT" }

// Test API call
await window.apiFetch('/ping')
// Expected: { ok: true, message: "pong" }

// Test authentication check
await window.checkAuth()
// Expected: true (if authenticated)

// Show test toast
window.showToast('Test notification!', 'success')
// Expected: Green success toast appears

// Check API configuration
window.apiConfig
// Expected: { baseUrl: "https://api.grassrootsmvt.org", isLocal: false, version: "2.0.0" }
```

**4.2 Network Tab Verification**
1. Open DevTools → Network tab
2. Make API calls via the interface
3. Verify requests include proper headers:
   - `Content-Type: application/json`
   - `Cf-Access-Jwt-Assertion: [JWT_TOKEN]` (production)
   - `Authorization: Bearer [TOKEN]` (local development)

**4.3 Authentication Headers Verification**
```javascript
// Check JWT extraction in console
const cookies = document.cookie.split(';').map(c => c.trim());
const cfAuth = cookies.find(c => c.startsWith('CF_Authorization='));
console.log('CF Auth Cookie:', cfAuth ? 'Present' : 'Missing');
```

### Step 5: Error Scenarios Testing

**5.1 Authentication Failure**
1. Manually corrupt the JWT token in localStorage
2. Try API call - should redirect to login
3. Verify error handling displays appropriate messages

**5.2 Network Failure**
1. Simulate network failure (DevTools → Network → Offline)
2. Submit form data
3. Verify offline queueing works
4. Go back online - verify sync occurs

**5.3 Invalid API Endpoints**
1. Test invalid endpoint: `await window.apiFetch('/invalid')`
2. Should handle gracefully with error toast

## Debugging Commands

If issues arise, use these debugging commands:

```javascript
// Enable verbose logging
localStorage.setItem('debug', 'true');

// Check authentication state
console.log('Auth Status:', window.getAuthStatus());
console.log('API Config:', window.apiConfig);
console.log('Has CF Cookie:', document.cookie.includes('CF_Authorization'));
console.log('Local Token:', !!localStorage.getItem('access_token'));

// Test connectivity
await window.apiFetch('/ping').then(console.log).catch(console.error);

// Check offline queue
console.log('Offline Queue:', JSON.parse(localStorage.getItem('offline_queue') || '[]'));

// Force authentication check
await window.checkAuth();
```

## Success Criteria

**✅ All verification steps should result in:**

1. **Authentication**: Seamless Cloudflare Access integration
2. **API Calls**: All endpoints accessible with proper JWT headers
3. **Error Handling**: Graceful failures with user feedback
4. **Offline Support**: Request queueing and sync functionality
5. **User Experience**: Toast notifications and status indicators
6. **Developer Tools**: Global functions accessible and debuggable

## Troubleshooting

**Common Issues:**

1. **"apiFetch is not a function"**
   - Verify `/src/apiClient.js` is loaded before other scripts
   - Check for JavaScript errors in console

2. **Authentication redirects in infinite loop**
   - Verify Cloudflare Access configuration
   - Check if user has proper access permissions

3. **API calls fail with 401/403**
   - Verify JWT token extraction from cookies
   - Check if token has expired

4. **Offline queue not working**
   - Verify IndexedDB support in browser
   - Check if Service Worker is properly registered

## Files Modified

- ✅ `/ui/src/apiClient.js` - Complete rewrite with global apiFetch
- ✅ `/ui/index.html` - Added script loading and auth status
- ✅ `/ui/call.html` - Added script loading and integration
- ✅ `/ui/canvass/index.html` - Added script loading and auth status
- ✅ `/ui/auth-test.html` - New comprehensive testing page

This completes the JWT authentication implementation with global `window.apiFetch` function as specified. All verification steps should confirm proper authentication handling, error management, and offline capabilities.