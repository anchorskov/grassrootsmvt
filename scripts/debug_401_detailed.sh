#!/usr/bin/env bash

echo "🔍 Advanced Cloudflare Access Debug - 401 Error Investigation"
echo "==========================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${RED}ISSUE PERSISTS:${NC} Still getting 401 errors after domain fix"
echo "This suggests a deeper JWT verification or Access policy issue"

echo ""
echo "🔧 Step 1: Check Access Policy Domain Coverage"
echo "============================================="
echo "In Cloudflare Dashboard → Zero Trust → Access → Applications:"
echo "1. Find application with AUD: 76fea0745afec089a3eddeba8d982b10aab6d6f871e43661cb4977765b78f3f0"
echo "2. Verify 'volunteers.grassrootsmvt.org' is in subdomain list"
echo "3. Check if policy is 'Active' and covers the correct paths"

echo ""
echo "🍪 Step 2: Extract and Decode JWT"
echo "================================="
echo "After authentication attempt:"
echo ""
cat << 'EOF'
// Run in browser console after auth attempt:
console.log('=== COOKIE INSPECTION ===');
const cookies = document.cookie.split(';');
const cfAuth = cookies.find(c => c.trim().startsWith('CF_Authorization='));
if (cfAuth) {
  const jwt = cfAuth.split('=')[1];
  console.log('JWT Found:', jwt.substring(0, 50) + '...');
  
  // Decode payload (middle part of JWT)
  const parts = jwt.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1]));
      console.log('JWT Payload:', payload);
      console.log('Audience (aud):', payload.aud);
      console.log('Email:', payload.email);
      console.log('Expiry:', new Date(payload.exp * 1000));
    } catch(e) {
      console.error('JWT decode error:', e);
    }
  }
} else {
  console.log('No CF_Authorization cookie found');
  console.log('All cookies:', document.cookie);
}
EOF

echo ""
echo "🔬 Step 3: Test JWT Verification Components"
echo "=========================================="

# Test if we can reach the Access certs endpoint
echo "Testing Access certs endpoint..."
CERTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "https://skovgard.cloudflareaccess.com/cdn-cgi/access/certs")
if [[ "$CERTS_STATUS" == "200" ]]; then
    echo -e "${GREEN}✓${NC} Access certs endpoint reachable (200)"
else
    echo -e "${RED}✗${NC} Access certs endpoint failed ($CERTS_STATUS)"
fi

# Test Worker environment config
echo "Testing Worker environment variables..."
ENV_TEST=$(curl -s -m 10 "https://volunteers.grassrootsmvt.org/api/auth/config" 2>/dev/null)
if [[ "$ENV_TEST" == *"team_domain"* ]]; then
    echo -e "${GREEN}✓${NC} Worker environment config accessible"
    echo "$ENV_TEST" | grep -o '"team_domain":"[^"]*"' | head -1
    echo "$ENV_TEST" | grep -o '"aud":"[^"]*"' | head -1 | sed 's/\(.\{20\}\).*/\1.../'
else
    echo -e "${RED}✗${NC} Worker environment config not accessible"
fi

echo ""
echo "🚨 Step 4: Common 401 Causes"
echo "============================"
echo "Based on Cloudflare documentation, 401 after successful Access login usually means:"
echo ""
echo "A. JWT Audience Mismatch:"
echo "   - JWT 'aud' field doesn't match Worker POLICY_AUD"
echo "   - Access policy configured for different subdomain"
echo ""
echo "B. JWT Signature Verification Failed:"
echo "   - Wrong signing keys fetched"
echo "   - Clock skew issues"
echo "   - Malformed JWT"
echo ""
echo "C. Access Policy Issues:"
echo "   - Policy not applied to volunteers.grassrootsmvt.org"
echo "   - Policy rules blocking after initial authentication"
echo "   - Service token vs browser authentication mismatch"

echo ""
echo "🔧 Step 5: Diagnostic API Calls"
echo "==============================="

echo "Testing different authentication approaches..."

# Test with explicit headers
echo ""
echo "Testing with manual header extraction..."
cat << 'EOF'
// Run in browser console after auth:
fetch('/api/whoami', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Accept': 'application/json',
    'Cf-Access-Jwt-Assertion': 'test' // Will be overridden by cookie
  }
}).then(async r => {
  console.log('Manual test - Status:', r.status);
  const text = await r.text();
  console.log('Response:', text);
  
  if (r.status === 401) {
    try {
      const json = JSON.parse(text);
      console.log('Error details:', json.details);
    } catch(e) {
      console.log('Raw 401 response:', text);
    }
  }
}).catch(err => console.error('Fetch error:', err));
EOF

echo ""
echo "🎯 Step 6: Immediate Actions"
echo "============================"
echo "1. Check Cloudflare Access policy domain configuration"
echo "2. Extract and decode JWT to verify audience field"
echo "3. Compare JWT aud with Worker POLICY_AUD setting"
echo "4. Check Worker logs for specific JWT verification errors"

echo ""
echo "📋 Step 7: Create Detailed Debug Report"
echo "======================================="

if [[ "$1" == "--create-report" ]]; then
    echo "Creating detailed debug report..."
    
    REPORT_FILE="auth_debug_report_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$REPORT_FILE" << EOF
# Cloudflare Access 401 Debug Report
Generated: $(date)

## Issue Description
Authentication completes successfully on Cloudflare Access side, but Worker API returns 401 Unauthorized for /api/whoami endpoint.

## Environment
- Domain: volunteers.grassrootsmvt.org
- Worker: grassrootsmvt-production
- Access Team: skovgard.cloudflareaccess.com
- POLICY_AUD: 76fea0745afec089a3eddeba8d982b10aab6d6f871e43661cb4977765b78f3f0

## Test Results
- Domain fix applied: ✓ (Dynamic hostname in login URL)
- Access redirect working: ✓ (Returns to application)
- JWT cookie present: ? (Need to verify)
- JWT verification: ✗ (Returns 401)

## Next Steps Required
1. Verify Access policy covers volunteers.grassrootsmvt.org
2. Extract and decode JWT to check audience field
3. Check Worker logs for specific verification errors
4. Compare JWT aud with POLICY_AUD environment variable

## Browser Console Commands
Use these commands after authentication attempt:

\`\`\`javascript
// Extract JWT
const jwt = document.cookie.split(';').find(c => c.includes('CF_Authorization'));
console.log('JWT Cookie:', jwt);

// Decode JWT payload
if (jwt) {
  const token = jwt.split('=')[1];
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('JWT Audience:', payload.aud);
  console.log('JWT Email:', payload.email);
}
\`\`\`

## Cloudflare Dashboard Checks
1. Zero Trust → Access → Applications
2. Find app with AUD: 76fea0745afec089...
3. Verify subdomain coverage includes volunteers.grassrootsmvt.org
4. Check policy rules don't block after authentication
EOF

    echo -e "${GREEN}✓${NC} Debug report created: $REPORT_FILE"
else
    echo "To create detailed debug report, run:"
    echo "  $0 --create-report"
fi

echo ""
echo -e "${YELLOW}🔍 The 401 error persisting after domain fix suggests:${NC}"
echo -e "${YELLOW}   1. Access policy may not cover volunteers.grassrootsmvt.org${NC}"
echo -e "${YELLOW}   2. JWT audience field doesn't match Worker POLICY_AUD${NC}"
echo -e "${YELLOW}   3. JWT signature verification is failing for another reason${NC}"
echo ""
echo -e "${BLUE}Next: Extract JWT from browser and compare aud field with Worker config${NC}"