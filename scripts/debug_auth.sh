#!/usr/bin/env bash

echo "🔍 Cloudflare Access Authentication Debug Script"
echo "=============================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "🌟 ISSUE IDENTIFIED:"
echo "==================="
echo -e "${RED}Problem:${NC} Worker hardcodes 'api.grassrootsmvt.org' in Access login URL"
echo -e "${RED}Effect:${NC} Domain mismatch causes JWT verification to fail"
echo -e "${GREEN}Solution:${NC} Use dynamic hostname in Access login URL"

echo ""
echo "📍 Location: worker/src/index.js line 342"
echo "Current code:"
echo '  const login = `${team}/cdn-cgi/access/login/api.grassrootsmvt.org?kid=${aud}&redirect_url=${back}`;'
echo ""
echo "Should be:"
echo '  const login = `${team}/cdn-cgi/access/login/${request.headers.get("host")}?kid=${aud}&redirect_url=${back}`;'

echo ""
echo "🔧 Environment Variables Check:"
echo "=============================="

echo "Testing Worker environment variables..."
echo ""

# Test TEAM_DOMAIN
echo -n "TEAM_DOMAIN: "
TEAM_DOMAIN_TEST=$(curl -s "https://volunteers.grassrootsmvt.org/api/auth/config" | grep -o '"team_domain":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$TEAM_DOMAIN_TEST" ]]; then
    echo -e "${GREEN}✓${NC} $TEAM_DOMAIN_TEST"
else
    echo -e "${RED}✗${NC} Not found"
fi

# Test POLICY_AUD 
echo -n "POLICY_AUD: "
POLICY_AUD_TEST=$(curl -s "https://volunteers.grassrootsmvt.org/api/auth/config" | grep -o '"aud":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$POLICY_AUD_TEST" ]]; then
    echo -e "${GREEN}✓${NC} ${POLICY_AUD_TEST:0:20}..."
else
    echo -e "${RED}✗${NC} Not found"
fi

echo ""
echo "🧪 Access Policy Check:"
echo "======================="

echo "To verify Access policy configuration:"
echo "1. Go to Cloudflare Dashboard → Zero Trust → Access → Applications"
echo "2. Find your application with AUD: ${POLICY_AUD_TEST:0:20}..."
echo "3. Check if 'volunteers.grassrootsmvt.org' is included in the subdomain list"
echo "4. Verify the policy allows your email address"

echo ""
echo "🔍 JWT Debug Steps:"
echo "=================="

echo "To debug the JWT issue:"
echo "1. Visit: https://volunteers.grassrootsmvt.org"
echo "2. Complete authentication"
echo "3. Open Developer Tools → Application → Cookies"
echo "4. Find 'CF_Authorization' cookie"
echo "5. Copy the JWT value and decode at https://jwt.io"
echo "6. Check if 'aud' field matches: ${POLICY_AUD_TEST:0:20}..."

echo ""
echo "🚨 Critical Fix Needed:"
echo "======================"

echo -e "${YELLOW}The Worker code has a hardcoded domain that doesn't match your access URL.${NC}"
echo -e "${YELLOW}This is causing the authentication to fail even after successful login.${NC}"

echo ""
echo "📦 Files for External Analysis:"
echo "==============================="

if [[ "$1" == "--create-zip" ]]; then
    echo "Creating debug zip file..."
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    DEBUG_DIR="$TEMP_DIR/grassrootsmvt-auth-debug"
    mkdir -p "$DEBUG_DIR"
    
    # Copy key files (redacting sensitive data)
    echo "Copying Worker files..."
    cp worker/src/index.js "$DEBUG_DIR/worker-index.js"
    cp worker/functions/_utils/verifyAccessJWT.js "$DEBUG_DIR/verifyAccessJWT.js"
    
    # Copy and redact wrangler.toml
    sed 's/POLICY_AUD.*=.*/POLICY_AUD = "[REDACTED]"/' worker/wrangler.toml > "$DEBUG_DIR/wrangler.toml"
    
    # Copy UI files
    echo "Copying UI files..."
    cp ui/index.html "$DEBUG_DIR/ui-index.html"
    cp ui/src/apiClient.js "$DEBUG_DIR/apiClient.js"
    
    # Create issue summary
    cat > "$DEBUG_DIR/ISSUE_SUMMARY.md" << 'EOF'
# Authentication 401 Error - Issue Summary

## Problem
- User completes Cloudflare Access authentication
- Returns to application successfully  
- API call to `/api/whoami` returns 401 Unauthorized
- Console shows: "Authentication failed after Access redirect"

## Environment
- Production Cloudflare Workers + Pages
- Cloudflare Access with custom domain: volunteers.grassrootsmvt.org
- Authentication works on Access side, fails on Worker JWT verification

## Suspected Root Cause
Worker code hardcodes 'api.grassrootsmvt.org' in Access login URL (line 342 of worker-index.js)
but application runs on 'volunteers.grassrootsmvt.org', causing domain mismatch in JWT verification.

## Key Files Included
- worker-index.js: Main Worker authentication logic
- verifyAccessJWT.js: JWT verification implementation  
- wrangler.toml: Environment configuration (sensitive values redacted)
- ui-index.html: Frontend authentication flow
- apiClient.js: API client making the failing requests

## Next Steps
Need to verify if the hardcoded domain is causing the JWT audience mismatch
and update to use dynamic hostname from request headers.
EOF

    # Create zip
    cd "$TEMP_DIR"
    zip -r "grassrootsmvt-auth-debug.zip" grassrootsmvt-auth-debug/
    mv "grassrootsmvt-auth-debug.zip" /home/anchor/projects/grassrootsmvt/
    cd - > /dev/null
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    echo -e "${GREEN}✓${NC} Debug zip created: grassrootsmvt-auth-debug.zip"
    echo "This file is ready to share with another developer for analysis."
else
    echo "To create debug zip file for external analysis, run:"
    echo "  $0 --create-zip"
fi

echo ""
echo "💡 Immediate Action Required:"
echo "============================"
echo -e "${YELLOW}Fix the hardcoded domain in worker/src/index.js line 342${NC}"
echo -e "${YELLOW}Replace 'api.grassrootsmvt.org' with dynamic hostname${NC}"
echo -e "${YELLOW}Then redeploy with: ./scripts/deploy_all.sh${NC}"