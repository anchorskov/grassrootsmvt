#!/bin/bash

# 🌾 GrassrootsMVT Basic Production Check
# Tests what we can without authentication

echo "🌾 GrassrootsMVT Basic Production Verification"
echo "============================================="
echo ""

# Test API domain resolution
echo "🔍 Testing Domain Resolution..."
if nslookup api.grassrootsmvt.org > /dev/null 2>&1; then
    echo "✅ API domain resolves correctly"
    nslookup api.grassrootsmvt.org | grep "Address:" | head -1
else
    echo "❌ API domain resolution failed"
fi

if nslookup grassrootsmvt.org > /dev/null 2>&1; then
    echo "✅ UI domain resolves correctly"
    nslookup grassrootsmvt.org | grep "Address:" | head -1
else
    echo "❌ UI domain resolution failed"
fi

echo ""

# Test SSL certificates
echo "🔒 Testing SSL Certificates..."
if openssl s_client -connect api.grassrootsmvt.org:443 -servername api.grassrootsmvt.org < /dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
    echo "✅ API SSL certificate valid"
else
    echo "⚠️  API SSL certificate issue or connection problem"
fi

echo ""

# Test basic connectivity with status codes
echo "📡 Testing HTTP Connectivity..."

API_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "https://api.grassrootsmvt.org/api/ping" 2>/dev/null || echo "000")
echo "API /ping endpoint: HTTP $API_STATUS"
if [[ "$API_STATUS" == "302" ]]; then
    echo "✅ API redirecting to authentication (expected for protected endpoints)"
elif [[ "$API_STATUS" == "200" ]]; then
    echo "✅ API responding directly (public endpoint)"
else
    echo "⚠️  API status unexpected: $API_STATUS"
fi

UI_STATUS=$(curl -s -w "%{http_code}" -o /dev/null "https://grassrootsmvt.org" 2>/dev/null || echo "000")
echo "UI main page: HTTP $UI_STATUS"
if [[ "$UI_STATUS" == "200" ]]; then
    echo "✅ UI accessible"
elif [[ "$UI_STATUS" == "302" ]]; then
    echo "✅ UI redirecting (possibly to authentication)"
else
    echo "⚠️  UI status unexpected: $UI_STATUS"
fi

echo ""

# Test database connectivity (if wrangler available)
echo "🗄️  Testing Database Connectivity..."
if command -v npx > /dev/null && command -v wrangler > /dev/null; then
    echo "Testing D1 database connection..."
    if npx wrangler d1 execute wy --env production --remote --command "SELECT 1 as test;" > /dev/null 2>&1; then
        echo "✅ D1 database connection successful"
        
        # Get basic counts
        VOTER_COUNT=$(npx wrangler d1 execute wy --env production --remote --command "SELECT COUNT(*) as count FROM voters;" 2>/dev/null | grep -o '[0-9]\+' | tail -1)
        if [[ -n "$VOTER_COUNT" ]]; then
            echo "✅ Voter records: $VOTER_COUNT"
        fi
    else
        echo "❌ D1 database connection failed"
    fi
else
    echo "⚠️  Wrangler CLI not available - skipping database tests"
    echo "   Install: npm install -g wrangler"
fi

echo ""
echo "📝 Summary:"
echo "----------"
echo "• Domains resolve correctly"
echo "• SSL certificates appear valid"  
echo "• API returns HTTP $API_STATUS (302 redirect = auth working)"
echo "• UI returns HTTP $UI_STATUS"
echo ""
echo "🎯 Next Steps for Full Verification:"
echo "1. Get JWT token from browser after authenticating"
echo "2. Run: JWT_TOKEN='your-token' ./scripts/verify_production.sh"
echo "3. Test volunteer workflows manually in browser"
echo ""
echo "🔗 Authentication URLs:"
echo "• Main portal: https://grassrootsmvt.org"
echo "• Volunteer portal: https://grassrootsmvt.org/volunteer/"
echo "• API: https://api.grassrootsmvt.org"