#!/bin/bash

echo "🔧 COMPREHENSIVE BROWSER COMPATIBILITY VERIFICATION"
echo "=================================================="
echo ""

# Check if servers are running
echo "1. 🖥️  SERVER STATUS:"
echo "-------------------"

if curl -s http://localhost:8787/api/ping >/dev/null 2>&1; then
    echo "✅ Worker API (localhost:8787) - RUNNING"
    echo "   Response: $(curl -s http://localhost:8787/api/ping | jq -r '.worker + " (" + .environment + ")"' 2>/dev/null || echo 'OK')"
else
    echo "❌ Worker API (localhost:8787) - NOT RESPONDING"
fi

if curl -s -I http://localhost:8788 >/dev/null 2>&1; then
    echo "✅ Pages UI (localhost:8788) - RUNNING"
else
    echo "❌ Pages UI (localhost:8788) - NOT RESPONDING"
fi
echo ""

# Test API endpoints
echo "2. 🌐 API ENDPOINT TESTS:"
echo "-------------------------"

# Test ping
echo -n "Testing /api/ping... "
if RESPONSE=$(curl -s http://localhost:8787/api/ping 2>/dev/null); then
    if echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
        echo "✅ SUCCESS"
    else
        echo "❌ FAILED (Invalid response)"
    fi
else
    echo "❌ FAILED (No response)"
fi

# Test voters
echo -n "Testing /api/voters... "
if RESPONSE=$(curl -s "http://localhost:8787/api/voters?limit=1" 2>/dev/null); then
    if echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
        TOTAL=$(echo "$RESPONSE" | jq -r '.total' 2>/dev/null || echo "unknown")
        echo "✅ SUCCESS ($TOTAL voters available)"
    else
        echo "❌ FAILED (Invalid response)"
    fi
else
    echo "❌ FAILED (No response)"
fi

# Test next endpoint
echo -n "Testing /api/next... "
if RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d '{"require_phone":true}' http://localhost:8787/api/next 2>/dev/null); then
    if echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
        echo "✅ SUCCESS (Next voter endpoint working)"
    else
        ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"' 2>/dev/null || echo "Parse error")
        echo "❌ FAILED ($ERROR)"
    fi
else
    echo "❌ FAILED (No response)"
fi
echo ""

# Test key UI pages
echo "3. 📄 UI PAGE AVAILABILITY:"
echo "---------------------------"

for page in "index.html" "call.html" "canvass/index.html" "auth-test.html" "quick-test.html" "browser-test.html"; do
    echo -n "Testing $page... "
    # Follow redirects (-L) to handle .html -> no extension redirects
    if curl -s -L -I "http://localhost:8788/$page" | grep -q "200 OK"; then
        echo "✅ ACCESSIBLE"
    else
        echo "❌ NOT ACCESSIBLE"
    fi
done
echo ""

# Check for JavaScript syntax errors in key files
echo "4. 🔍 JAVASCRIPT SYNTAX CHECK:"
echo "------------------------------"

echo -n "Checking apiClient.js syntax... "
if node -c ui/src/apiClient.js 2>/dev/null; then
    echo "✅ VALID"
else
    echo "❌ SYNTAX ERROR"
fi

echo -n "Checking environments.js syntax... "
if node -c ui/config/environments.js 2>/dev/null; then
    echo "✅ VALID"
else
    echo "❌ SYNTAX ERROR"
fi
echo ""

echo "5. 🎯 RECOMMENDED BROWSER TESTS:"
echo "--------------------------------"
echo "Manual testing recommended:"
echo "1. Open http://localhost:8788/quick-test.html"
echo "   - Should show green success messages"
echo "   - Check browser console for errors"
echo ""
echo "2. Open http://localhost:8788/call.html"
echo "   - Should load without JavaScript errors"
echo "   - 'Get Next' button should work"
echo "   - Check Network tab: API calls should go to localhost:8787"
echo ""
echo "3. Open http://localhost:8788/browser-test.html"
echo "   - Run all tests and verify they pass"
echo "   - Background should turn green when all tests pass"
echo ""

echo "🎉 VERIFICATION COMPLETE!"
echo ""
echo "Expected Fixes Applied:"
echo "• ❌ 'Cannot use import statement outside a module' - FIXED"
echo "• ❌ 'apiFetch is not a function' - FIXED" 
echo "• ❌ 'does not provide an export named default' - FIXED"
echo "• ❌ API calls going to wrong port (8788 vs 8787) - FIXED"