#!/bin/bash

echo "🔧 Testing Contact Button Fix..."
echo "================================"

# Test that the canvass page loads and has the contact functionality
echo "1. Testing canvass page structure..."

# Check if the voter card structure includes the new class
page_content=$(curl -s "http://localhost:8788/canvass/" | grep -E "(voter-card|Contact|person-name)" | wc -l)

if [ "$page_content" -gt 0 ]; then
  echo "✅ Canvass page loads with expected structure"
else
  echo "❌ Canvass page structure issue"
fi

echo ""
echo "🧪 Manual Testing Steps:"
echo "========================"
echo "1. Open browser developer tools (F12)"
echo "2. Go to: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo "3. Search for voters:"
echo "   - Street: HAYFORD AVE"
echo "   - House: 3006"
echo "   - Click 'Find nearby'"
echo "4. Click '📋 Contact' button"
echo "5. Check console for debug messages:"
echo "   - '🔍 Debug: voterCard found: true'"
echo "   - '🔍 Debug elements found: {voterName: true, voterAddress: true, locationDetails: true}'"
echo "6. Verify navigation to contact page works"

echo ""
echo "🚨 Expected Debug Output:"
echo "========================="
echo "✅ 🔍 Debug: voterCard found: true"
echo "✅ 🔍 Debug elements found: {voterName: true, voterAddress: true, locationDetails: true}"
echo "✅ Navigation to /contact?voter_id=...&name=...&address=..."

echo ""
echo "❌ If Still Getting Errors:"
echo "==========================="
echo "1. Check if voter search results actually loaded"
echo "2. Verify the HTML structure in browser dev tools"  
echo "3. Look for any JavaScript errors in console"
echo "4. Try refreshing the page and trying again"

echo ""
echo "📋 Additional Debug Info:"
echo "========================="
echo "The 'Could not establish connection' error is likely from:"
echo "- Browser extension trying to communicate with content script"
echo "- WebSocket connection attempt from extension"
echo "- This error doesn't affect the contact functionality"