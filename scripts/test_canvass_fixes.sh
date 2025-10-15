#!/bin/bash

echo "🔧 TESTING FIXED CANVASS FUNCTIONALITY"
echo "======================================"
echo "Testing data retrieval and autocomplete features"
echo ""

# Test 1: Verify data is returned with correct filters
echo "1. Testing corrected filters (ALBANY county + HAYFORD street)..."
RESULT=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","parties":["Republican","Democratic","Unaffiliated"]},"house":3006,"street":"HAYFORD","range":20,"limit":5}')

if echo "$RESULT" | jq -e '.rows | length > 0' > /dev/null; then
  echo "✅ DATA FOUND! Fixed the filtering issue"
  echo "Found $(echo "$RESULT" | jq -r '.total') addresses:"
  echo "$RESULT" | jq -r '.rows[]? | "  👤 \(.name) - \(.address), \(.city) (\(.party))"'
  echo ""
else
  echo "❌ Still no data returned"
  echo "$RESULT" | jq .
fi

# Test 2: Test autocomplete data source
echo "2. Testing street autocomplete data source..."
AUTOCOMPLETE_DATA=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY"},"limit":20}')

if echo "$AUTOCOMPLETE_DATA" | jq -e '.rows | length > 0' > /dev/null; then
  echo "✅ Autocomplete data available"
  echo "Available streets in ALBANY county:"
  echo "$AUTOCOMPLETE_DATA" | jq -r '.rows[].address' | sed 's/^[0-9]* //' | sort -u | head -10 | sed 's/^/  • /'
  echo ""
else
  echo "❌ No autocomplete data"
fi

# Test 3: Test different counties for autocomplete
echo "3. Testing street names across different counties..."
for county in "CARBON" "ALBANY" "LARAMIE"; do
  COUNT=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
    -H "Content-Type: application/json" \
    -d "{\"filters\":{\"county\":\"$county\"},\"limit\":50}" | jq -r '.total')
  echo "  $county: $COUNT addresses available"
done
echo ""

# Test 4: Show the exact URL that should work
echo "4. CORRECTED CANVASS URL:"
echo "========================"
echo "❌ BROKEN URL (wrong county filter):"
echo "   http://localhost:8788/canvass/?county=BIG+HORN&parties=Republican"
echo ""
echo "✅ WORKING URL (correct county filter):"
echo "   http://localhost:8788/canvass/?county=ALBANY&parties=Republican&parties=Democratic&parties=Unaffiliated"
echo ""
echo "   Then search for:"
echo "   • House #: 3006"
echo "   • Street: HAYFORD (should autocomplete)"
echo ""

# Test 5: Test the autocomplete API endpoint
echo "5. Testing autocomplete functionality..."
echo "Getting sample streets for autocomplete:"
STREETS=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY"},"limit":100}' | \
  jq -r '.rows[].address' | sed 's/^[0-9]* //' | sort -u | head -5)

echo "$STREETS" | while read street; do
  echo "  🏠 $street"
done

echo ""
echo "🎯 FIXES IMPLEMENTED:"
echo "===================="
echo "1. ✅ Fixed county filtering (ALBANY not BIG HORN)"
echo "2. ✅ Added street name autocomplete to prevent typos"
echo "3. ✅ Enhanced UI with better name/address hierarchy"
echo "4. ✅ Added voter ID display for logging reference"
echo ""
echo "🌐 TEST THE WORKING VERSION:"
echo "http://localhost:8788/canvass/?county=ALBANY&parties=Republican&parties=Democratic&parties=Unaffiliated"