#!/bin/bash

echo "🎯 TESTING ON-FOCUS STREET AUTOCOMPLETE"
echo "======================================="
echo "Testing the new simplified focus-based approach"
echo ""

# Test 1: Verify the exact API call that happens on focus
echo "1. Testing the on-focus API call..."
FOCUS_RESULT=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","district_type":null,"district":null,"parties":["Republican","Democratic","Unaffiliated"]},"limit":200}')

if echo "$FOCUS_RESULT" | jq -e '.ok' > /dev/null; then
  echo "✅ Focus API call succeeds"
  TOTAL=$(echo "$FOCUS_RESULT" | jq -r '.total')
  echo "   Found $TOTAL addresses"
  
  echo ""
  echo "   Streets that should appear in dropdown:"
  echo "$FOCUS_RESULT" | jq -r '.rows[].address' | sed 's/^[0-9]* //' | sort -u | while read street; do
    echo "   📍 $street"
  done
else
  echo "❌ Focus API call failed"
  echo "$FOCUS_RESULT"
fi
echo ""

# Test 2: Check if the simplified page loads correctly
echo "2. Checking simplified page structure..."
PAGE_CONTENT=$(curl -s "http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50")

if echo "$PAGE_CONTENT" | grep -q "Street field focused - loading streets immediately"; then
  echo "✅ On-focus handler found in page"
else
  echo "❌ On-focus handler missing"
fi

if echo "$PAGE_CONTENT" | grep -q "Loading streets..."; then
  echo "✅ Loading indicator found"
else
  echo "❌ Loading indicator missing"
fi

if echo "$PAGE_CONTENT" | grep -q "streetSuggestions"; then
  echo "✅ Dropdown container found"
else
  echo "❌ Dropdown container missing"
fi
echo ""

echo "🎯 NEW APPROACH SUMMARY:"
echo "========================"
echo "✅ Removed complex preloading"
echo "✅ Removed API client dependencies"
echo "✅ Added direct fetch on focus"
echo "✅ Added loading indicator"
echo "✅ Added error handling"
echo ""

echo "📱 USER EXPERIENCE:"
echo "=================="
echo "1. 🌐 Page loads instantly (no waiting for data)"
echo "2. 🖱️ User clicks on 'Street' field"
echo "3. ⏳ Shows 'Loading streets...' immediately"
echo "4. 📡 Direct API call to worker (bypasses any client issues)"
echo "5. 📋 Dropdown appears with: B MCINTYRE HALL # 359, HAYFORD AVE, STEELE ST"
echo "6. ⌨️ User can type to filter or click to select"
echo ""

echo "🧪 TEST INSTRUCTIONS:"
echo "===================="
echo "1. Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50"
echo "2. Click on the 'Street' field"
echo "3. Should see 'Loading streets...' briefly"
echo "4. Should see blue dropdown with 3 street options"
echo "5. Type 'H' → should filter to 'HAYFORD AVE'"
echo "6. Click 'HAYFORD AVE' → should fill the field"