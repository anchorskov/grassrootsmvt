# 💡 COPILOT INSTRUCTION — JWT Integration for Volunteer UI

**Files:**
- `/ui/volunteer/phone.html`
- `/ui/volunteer/canvass.html` 
- `/src/apiClient.js`

## 🎯 Goal
Implement Cloudflare Access JWT integration in the volunteer UI so that all API calls include valid `Cf-Access-Jwt-Assertion` headers.

## ✅ Requirements

### 1. JWT Token Extraction
Read JWT from `document.cookie` (`CF_Authorization`):

```javascript
function getJWTToken() {
  const cookies = document.cookie.split(';');
  const cfAuth = cookies.find(cookie => cookie.trim().startsWith('CF_Authorization='));
  return cfAuth ? cfAuth.split('=')[1] : null;
}
```

### 2. API Request Headers
Inject JWT into all API requests:

```javascript
headers: {
  'Content-Type': 'application/json',
  'Cf-Access-Jwt-Assertion': jwtToken
}
```

### 3. Token Validation
Add token validation check before any fetch:
- **If missing** → redirect to `/cdn-cgi/access/login`
- **If expired** → display "Reauthenticate" button

### 4. API Client Wrapper
Apply logic inside `apiClient.js` and auto-wrap `fetch()`:

```javascript
async function authenticatedFetch(url, options = {}) {
  const token = getJWTToken();
  if (!token) {
    window.location.href = '/cdn-cgi/access/login';
    return;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Cf-Access-Jwt-Assertion': token,
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401 || response.status === 403) {
    window.location.href = '/cdn-cgi/access/login';
    return;
  }
  
  return response;
}
```

### 5. User Authentication Display
Add small login banner at the top showing authenticated email from `/api/whoami`:

```html
<div id="auth-banner" class="bg-blue-50 border-b border-blue-200 p-2 text-sm">
  <div class="container mx-auto flex items-center justify-between">
    <span id="user-email" class="text-blue-700">Loading user...</span>
    <button id="logout-btn" class="text-blue-600 hover:text-blue-800">Logout</button>
  </div>
</div>
```

## 🔧 Implementation Steps

1. **Create `src/apiClient.js`** with JWT extraction and authenticated fetch wrapper
2. **Update `phone.html`** to use `authenticatedFetch` for all API calls
3. **Update `canvass.html`** to use `authenticatedFetch` for all API calls  
4. **Add authentication banner** to both volunteer pages
5. **Test authentication flow** with missing/invalid tokens
6. **Verify JWT headers** are present in all API requests

## 🧪 Testing Checklist

- [ ] JWT token extracted correctly from `CF_Authorization` cookie
- [ ] All API calls include `Cf-Access-Jwt-Assertion` header
- [ ] Missing token redirects to `/cdn-cgi/access/login`
- [ ] 401/403 responses trigger reauthentication
- [ ] `/api/whoami` displays authenticated user email
- [ ] Logout button clears session and redirects

---

## 📘 After Completion — Request Summary

**📘 JWT Integration Summary**
✅ JWT token read from cookie  
✅ All API calls include Cf-Access-Jwt-Assertion  
✅ /api/whoami verifies authenticated identity  
✅ Automatic redirect for unauthenticated users  
✅ Token refresh tested successfully