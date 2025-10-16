# Call Page Authentication Loop Prevention

## Overview

The `call.html` page includes multiple layers of loop prevention to avoid infinite redirect loops when dealing with Cloudflare Zero Trust Access authentication.

## Loop Prevention Mechanisms

### 1. **Page-Level Retry Counter** (call.html)

Located in the `jsonFetch()` function:

```javascript
const AUTH_RETRY_KEY = "call.auth_retry_count";
const MAX_AUTH_RETRIES = 2;
```

**How it works:**
- Tracks authentication retry attempts in `sessionStorage`
- Allows maximum of 2 retry attempts before stopping
- Counter is **reset on successful API call**
- Counter is **incremented on 401 error**

**Behavior when limit exceeded:**
- Stops attempting redirects
- Shows user-friendly error banner with "Clear session and retry" link
- Prevents infinite loops

### 2. **apiClient.js Loop Prevention**

The `apiClient.js` module has its own built-in guards:

```javascript
const ACCESS_READY_KEY   = "accessReady:v1";
const REDIRECT_GUARD_KEY = "access:redirected";
```

**How it works:**
- `REDIRECT_GUARD_KEY`: Prevents multiple redirects per page load
- `ACCESS_READY_KEY`: Marks when authentication is successfully established
- Only allows **one navigation attempt per session** unless explicitly cleared

### 3. **Error Handling in loadWho()**

The initial authentication check catches errors gracefully:

```javascript
async function loadWho() {
  try {
    const j = await jsonFetch(API("/whoami"));
    who.textContent = j && j.email ? ("Signed in as: " + j.email) : "Not signed in";
  } catch (e) {
    who.innerHTML = `<span class="error">Unable to reach API: ${e.message}</span>`;
  }
}
```

**Benefits:**
- Prevents page crash on auth failure
- Shows user-friendly error message
- Doesn't block page load if auth fails

## Common Loop Scenarios & Solutions

### Scenario 1: Access Policy Mismatch

**Problem:** User's email not in allowed policy → keeps getting 401

**Solution:**
- Page-level retry counter stops after 2 attempts
- Shows clear error message
- User can manually clear session storage to retry

### Scenario 2: Expired Session During Use

**Problem:** User was authenticated, session expires mid-session

**Solution:**
- First 401: Triggers `getCurrentUserOrRedirect()` automatically
- Counter allows up to 2 retries
- If still failing, stops and shows error

### Scenario 3: Local Development

**Problem:** No Cloudflare Access in local mode

**Solution:**
- Worker detects local environment and bypasses auth
- Returns mock user: `dev@localhost`
- No redirect attempts occur

## Testing Loop Prevention

### Manual Test 1: Force Auth Failure
```javascript
// In browser console on call.html:
sessionStorage.setItem("call.auth_retry_count", "0");
// Click "Get Next" - should allow 2 retries then stop
```

### Manual Test 2: Clear Loop State
```javascript
// In browser console:
sessionStorage.clear();
location.reload();
// Resets all counters and session state
```

### Manual Test 3: Check Current State
```javascript
// In browser console:
console.log('Auth retry count:', sessionStorage.getItem('call.auth_retry_count'));
console.log('Access ready:', sessionStorage.getItem('accessReady:v1'));
console.log('Redirect guard:', sessionStorage.getItem('access:redirected'));
```

## Recovery Steps for Users

If a user encounters the loop prevention banner:

1. **Click "Clear session and retry"** - This runs:
   ```javascript
   sessionStorage.clear();
   location.reload();
   ```

2. **If still failing:**
   - Check Cloudflare Access policy includes user's email
   - Verify `TEAM_DOMAIN` and `POLICY_AUD` secrets are correct
   - Check browser console for specific error messages

3. **Check Access configuration:**
   ```bash
   curl -I https://api.grassrootsmvt.org/whoami | grep -i location
   ```

## Configuration Checklist

- [ ] Worker has `TEAM_DOMAIN` secret set
- [ ] Worker has `POLICY_AUD` secret set
- [ ] Cloudflare Access application covers `api.grassrootsmvt.org/*`
- [ ] Access policy includes volunteer email addresses
- [ ] CORS headers include `Cf-Access-Jwt-Assertion`
- [ ] Worker environment detection working correctly

## Related Files

- `/ui/call.html` - Page-level loop prevention
- `/ui/src/apiClient.js` - Global authentication flow with loop guards
- `/worker/src/index.js` - Worker authentication verification
- `/docs/jwt_authentication_verification.md` - Full auth flow documentation
