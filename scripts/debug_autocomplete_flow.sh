#!/bin/bash

echo "🔍 DEBUGGING AUTOCOMPLETE DATA FLOW"
echo "==================================="
echo "Testing the complete data flow from URL → API → Dropdown"
echo ""

# Test 1: Verify API endpoint works directly
echo "1. Testing API endpoint directly..."
DIRECT_RESULT=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"limit":50}')

if echo "$DIRECT_RESULT" | jq -e '.ok' > /dev/null; then
  echo "✅ Direct API call works"
  echo "   Total addresses: $(echo "$DIRECT_RESULT" | jq -r '.total')"
  echo "   Sample streets: $(echo "$DIRECT_RESULT" | jq -r '.rows[].address' | sed 's/^[0-9]* //' | sort -u | tr '\n' ', ')"
else
  echo "❌ Direct API call failed"
  echo "$DIRECT_RESULT"
fi
echo ""

# Test 2: Check if UI server can reach worker
echo "2. Testing UI → Worker connectivity..."
UI_TO_WORKER=$(curl -s -X POST "http://localhost:8788/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"limit":50}' 2>&1)

if echo "$UI_TO_WORKER" | jq -e '.ok' > /dev/null 2>&1; then
  echo "✅ UI can reach worker API"
else
  echo "❌ UI cannot reach worker API"
  echo "Error: $UI_TO_WORKER"
fi
echo ""

# Test 3: Check what the page actually loads
echo "3. Checking page load..."
PAGE_RESPONSE=$(curl -s "http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50")

if echo "$PAGE_RESPONSE" | grep -q "preloadStreets"; then
  echo "✅ Preload function found in page"
else
  echo "❌ Preload function missing from page"
fi

if echo "$PAGE_RESPONSE" | grep -q "apiFetch"; then
  echo "✅ API client references found"
else
  echo "❌ API client references missing"
fi

if echo "$PAGE_RESPONSE" | grep -q "streetSuggestions"; then
  echo "✅ Autocomplete HTML elements found"
else
  echo "❌ Autocomplete HTML elements missing"
fi
echo ""

echo "🔧 DATA FLOW ANALYSIS:"
echo "======================"
echo "1. Page loads → calls preloadStreets()"
echo "2. preloadStreets() → calls loadStreetNames()"
echo "3. loadStreetNames() → calls jsonFetch('/api/canvass/nearby')"
echo "4. jsonFetch() → should use apiFetch OR fallback to direct worker call"
echo "5. API returns data → streets extracted → populate dropdown"
echo ""

echo "🧪 DEBUGGING STEPS:"
echo "=================="
echo "1. Open browser console (F12)"
echo "2. Load page: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50"
echo "3. Look for these console messages:"
echo "   📋 Parsed URL filters"
echo "   🚀 Starting preload process"
echo "   🔧 API Client available"
echo "   🔗 jsonFetch called with"
echo "   📡 API Response"
echo "   ✅ Pre-loaded X street names"
echo ""
echo "4. Click 'Test Autocomplete' button"
echo "5. Click on Street field"
echo "6. Check if yellow dropdown appears"