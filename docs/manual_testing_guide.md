# 🧪 GrassrootsMVT Manual Testing Guide
## Comprehensive Test Plan for Local Development

### Prerequisites ✅
- [ ] Worker API running on `localhost:8787`
- [ ] Pages UI running on `localhost:8788`
- [ ] Both terminals showing active processes

---

## 🚀 **AUTOMATED TESTS**

### Run the Comprehensive Test Suite
```bash
cd /home/anchor/projects/grassrootsmvt
./scripts/test_comprehensive.sh
```

This will run **35+ automated tests** covering:
- Basic connectivity
- Authentication bypass
- Database operations
- CORS functionality
- API endpoints
- Error handling
- Performance tests

---

## 🖱️ **MANUAL UI TESTING**

### 1. **Browser Testing**
Open: `http://localhost:8788`

**Expected Results:**
- [ ] Page loads without errors
- [ ] Shows "✅ Authenticated (Local)" in top-right corner
- [ ] Title: "GrassrootsMVT Volunteer Hub"
- [ ] County dropdown is populated
- [ ] Console shows environment detection logs

### 2. **Environment Detection Test**
**Steps:**
1. Open browser developer tools (F12)
2. Go to Console tab
3. Refresh the page
4. Look for initialization messages

**Expected Console Output:**
```
🚀 GrassrootsMVT initializing in local environment...
[ENV-LOCAL] Environment configuration: {...}
[ENV-LOCAL] Skipping authentication check in local development
👤 User info: {email: "dev@localhost", ...}
```

### 3. **County/District Selection Test**
**Steps:**
1. Select a county (e.g., "Albany")
2. Observe city dropdown enables
3. Select district type (House/Senate)
4. Select a district number
5. Check party filters (R, D, Unaffiliated)
6. Click "Start Calls" or "Start Canvass"

**Expected Results:**
- [ ] Dropdowns populate dynamically
- [ ] Buttons enable when valid selections made
- [ ] Navigation works (may show 404 for call.html - that's normal)

---

## 🔧 **API ENDPOINT TESTING**

### Quick API Tests
```bash
# 1. Health Check
curl http://localhost:8787/api/ping

# 2. Authentication Status
curl http://localhost:8787/api/whoami

# 3. Environment Config
curl http://localhost:8787/auth/config

# 4. Database Tables
curl http://localhost:8787/api/db/tables

# 5. Get Some Voters
curl "http://localhost:8787/api/voters?limit=5"

# 6. Get Counties
curl http://localhost:8787/api/metadata
```

### Expected API Responses
```json
// /api/ping
{"ok":true,"worker":"grassrootsmvt","environment":"local","timestamp":...,"auth":"bypassed"}

// /api/whoami  
{"ok":true,"email":"dev@localhost","name":"Local Developer","environment":"local","source":"Local Development"}

// /auth/config
{"environment":"local","authRequired":false,"message":"Local development - authentication bypassed"}
```

---

## 🧪 **ADVANCED TESTING SCENARIOS**

### 1. **CORS Testing**
```bash
# Test cross-origin requests
curl -H "Origin: http://localhost:8788" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:8787/api/ping
```

### 2. **Data Operations Testing**
```bash
# Test call logging (should work without authentication)
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"voter_id":"TEST123","call_result":"contacted","notes":"Test call from manual testing"}' \
     http://localhost:8787/api/call

# Test activity retrieval
curl http://localhost:8787/api/activity
```

### 3. **Error Handling Testing**
```bash
# Test 404 handling
curl http://localhost:8787/api/nonexistent

# Test invalid JSON
curl -X POST \
     -H "Content-Type: application/json" \
     -d 'invalid-json' \
     http://localhost:8787/api/error-log
```

---

## 🔍 **DEBUGGING CHECKLIST**

### If Tests Fail:

#### **Worker API Issues (8787)**
- [ ] Check terminal running Worker for error messages
- [ ] Verify `wrangler dev` is running successfully
- [ ] Test direct API call: `curl http://localhost:8787/api/ping`
- [ ] Check environment variables are set correctly

#### **Pages UI Issues (8788)**
- [ ] Check terminal running Pages for error messages
- [ ] Verify `wrangler pages dev` is running
- [ ] Test direct UI access: `curl http://localhost:8788`
- [ ] Check for JavaScript errors in browser console

#### **CORS Issues**
- [ ] Verify Worker has `ALLOW_ORIGIN=http://localhost:8788`
- [ ] Check browser Network tab for failed requests
- [ ] Ensure both services are on correct ports

#### **Environment Detection Issues**
- [ ] Check `ui/config/environments.js` exists
- [ ] Verify import path in `ui/index.html`
- [ ] Test environment config: `curl http://localhost:8787/auth/config`

---

## 📊 **SUCCESS CRITERIA**

### ✅ **Minimum Passing Requirements:**
- [ ] Automated test suite passes with 0 failures
- [ ] UI loads and shows "Authenticated (Local)"
- [ ] API responds to health checks
- [ ] Environment detection shows "local"
- [ ] Authentication is bypassed
- [ ] CORS allows localhost:8788 requests

### 🚀 **Optimal Performance:**
- [ ] All 35+ automated tests pass
- [ ] UI loads in <2 seconds
- [ ] API responses in <100ms
- [ ] No JavaScript console errors
- [ ] County/district selection works smoothly
- [ ] Database operations succeed

---

## 🛠️ **Troubleshooting Commands**

```bash
# Check running processes
lsof -i :8787 -i :8788

# View real-time logs
tail -f logs/worker-dev.log
tail -f logs/pages-dev.log

# Restart services
npm run dev:stop
npm run dev

# Test individual components
curl -v http://localhost:8787/api/ping
curl -v http://localhost:8788
```

---

## 📝 **Test Results Template**

```
🧪 TESTING SESSION: [DATE/TIME]
================================

AUTOMATED TESTS:
[ ] Comprehensive test suite: ___/35 passed
[ ] No failures in any phase

MANUAL UI TESTS:
[ ] Page loads correctly
[ ] Environment detection works
[ ] County/district selection functions
[ ] Authentication shows "(Local)"

API ENDPOINT TESTS:
[ ] Health check responds
[ ] Authentication bypassed
[ ] Database operations work
[ ] CORS configured correctly

ISSUES FOUND:
- [ ] None
- [ ] [Describe any issues]

OVERALL STATUS: ✅ PASS / ❌ FAIL
```

## 🎯 **Next Steps After Testing**

1. **If All Tests Pass:**
   - Ready for development work
   - Can start modifying code with confidence
   - Environment is properly configured

2. **If Tests Fail:**
   - Review failure details from automated tests
   - Check terminal logs for errors
   - Verify service configurations
   - Re-run tests after fixes

---

**Happy Testing! 🚀**