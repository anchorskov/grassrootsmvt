# 🌾 GrassrootsMVT Production Verification Guide

*Last updated: October 12, 2025*

---

## Overview

The `verify_production.sh` script provides comprehensive validation of the GrassrootsMVT production environment, testing all critical components before volunteer onboarding.

## Usage

### Basic Verification (No Authentication)
```bash
./scripts/verify_production.sh
```

### Full Verification with JWT Authentication
```bash
# Set your JWT token from Cloudflare Access
export JWT_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
./scripts/verify_production.sh
```

### Getting Your JWT Token

1. **Browser Method**: 
   - Open browser dev tools (F12)
   - Go to `https://volunteers.grassrootsmvt.org/volunteer/`
   - Check Application → Cookies → `CF_Authorization`
   - Copy the cookie value

2. **Manual Extraction**:
   ```bash
   # After authenticating in browser, extract from cookies
   JWT_TOKEN=$(curl -s -c cookies.txt "https://volunteers.grassrootsmvt.org/volunteer/" && grep CF_Authorization cookies.txt | cut -f7)
   export JWT_TOKEN
   ```

---

## Test Coverage

### 🩺 API Health Checks
- `/api/ping` - Basic connectivity
- `/api/healthz` - Detailed health status
- Response time measurement

### 🔌 Core API Endpoints
- `/api/metadata` - County and district data
- `/api/voters` - Voter query functionality  
- `/api/templates` - Message script library

### 🔐 Authentication Testing
- Protected endpoint authentication requirements
- JWT token format validation
- User identity verification via `/api/whoami`

### 🗄️ Database Integrity
- Voter record count validation (>270k expected)
- Activity table verification (calls, canvasses, opt-ins)
- Performance index verification
- Query performance testing

### ⚡ Performance & Caching
- Cache header validation:
  - Metadata: 24-hour cache
  - Voters: 2-minute cache
  - Templates: 5-minute cache
- API response time measurement (<500ms target)

### 🌐 UI Accessibility
- Main landing page accessibility
- Volunteer portal authentication flow
- HTTP status code validation

### 🔒 Security Configuration
- SSL certificate validation
- Security header verification:
  - X-Content-Type-Options
  - X-Frame-Options  
  - Strict-Transport-Security

---

## Expected Output

### ✅ Success (All Tests Pass)
```
🌾 GrassrootsMVT Production Verification
========================================
Production API: https://api.grassrootsmvt.org
Production UI:  https://volunteers.grassrootsmvt.org

ℹ️  Testing API Health Endpoints...
✅ API ping endpoint responding
✅ API health check passed
   Database status: connected
   Uptime: 72.5 hours

ℹ️  Testing Core API Endpoints...
✅ Metadata endpoint returning counties
   Counties available: 23
✅ Voters endpoint returning data
   Sample voters returned: 5
✅ Templates endpoint responding
   Phone templates available: 3

ℹ️  Testing Authentication Requirements...
✅ Call endpoint properly requires authentication (HTTP 401)
✅ Canvass endpoint properly requires authentication (HTTP 401)
✅ JWT authentication working
   Authenticated as: volunteer@example.com

ℹ️  Testing D1 Database Integrity...
✅ Voter database contains 274521 records
✅ Database activity tables verified
   Call activities: 1247
   Canvass activities: 892
   Pulse opt-ins: 456
✅ Performance indexes are in place (7 indexes on voters table)

ℹ️  Testing Cache Headers and Performance...
✅ Metadata endpoint has correct cache headers (24h)
✅ Voters endpoint has correct cache headers (2m)
✅ API response time acceptable (267ms)

ℹ️  Testing UI Accessibility...
✅ Main UI accessible (HTTP 200)
✅ Volunteer portal accessible with proper auth handling (HTTP 401)

ℹ️  Testing Security Configuration...
✅ SSL certificate valid and HTTPS working
✅ Security headers configured (3/3 headers present)

📘 Production Verification Summary
==================================
Tests passed: 18/18

✅ All tests passed - Production ready!

✅ API endpoints responding correctly
✅ JWT authentication validated
✅ D1 data integrity confirmed
✅ Cache optimization active
✅ Security configuration verified
✅ Ready for production release

🚀 Production deployment verified and ready for volunteer onboarding!
```

### ❌ Failure (Issues Found)
```
📘 Production Verification Summary
==================================
Tests passed: 15/18

❌ Some tests failed:
   • API response time too slow (1247ms > 1000ms)
   • Voters endpoint missing or incorrect cache headers
   • Missing performance indexes (found only 3 indexes)

⚠️  Address failed tests before production release
```

---

## Troubleshooting

### Common Issues

#### "curl: command not found"
```bash
# Ubuntu/Debian
sudo apt-get install curl

# macOS
brew install curl
```

#### "jq: command not found" 
```bash
# Ubuntu/Debian  
sudo apt-get install jq

# macOS
brew install jq

# Note: Script will work without jq but with limited JSON parsing
```

#### "wrangler: command not found"
```bash
npm install -g wrangler
wrangler auth login
```

#### JWT Token Issues
- Ensure you're authenticated to Cloudflare Access first
- Token expires after some time - re-authenticate if needed
- Verify token format: should be three base64 segments separated by dots

#### High Response Times
- Check Cloudflare Analytics for edge cache hit rates
- Verify D1 database performance indexes are in place
- Consider geographic proximity to Cloudflare edge locations

---

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Production Verification
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 8 * * *'  # Daily at 8 AM

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y curl jq
          npm install -g wrangler
      - name: Run production verification
        run: ./scripts/verify_production.sh
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Monitoring Integration
```bash
# Run verification and send results to monitoring system
./scripts/verify_production.sh > verification_results.txt 2>&1
if [ $? -eq 0 ]; then
  echo "VERIFICATION_SUCCESS" | logger -t grassrootsmvt
else
  echo "VERIFICATION_FAILED" | logger -t grassrootsmvt -p user.err
  cat verification_results.txt | mail -s "GrassrootsMVT Verification Failed" admin@example.com
fi
```

---

## Dependencies

### Required
- `curl` - HTTP client for API testing
- `bash` - Shell environment (v4.0+)

### Optional but Recommended  
- `jq` - JSON parsing and validation
- `wrangler` - Direct D1 database access
- `base64` - JWT token decoding

### External Services
- Production API: `https://api.grassrootsmvt.org`
- Production UI: `https://volunteers.grassrootsmvt.org`  
- Cloudflare D1 database: `wy` (production environment)

---

*For issues or questions, see troubleshooting.md or contact the development team.*