#!/bin/bash

echo "🏠 TESTING COMPLETE STREET + HOUSE NUMBER WORKFLOW"
echo "=================================================="
echo "Testing the full autocomplete workflow: Street → House Numbers → Search"
echo ""

# Test 1: Street selection and house number population
echo "1. Testing available house numbers for each street..."

echo "   📍 HAYFORD AVE:"
HAYFORD_HOUSES=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"street":"HAYFORD AVE","limit":100}' | \
  jq -r '.rows[].address' | grep -o '^[0-9]*' | sort -n | uniq)
echo "$HAYFORD_HOUSES" | while read house; do
  echo "      🏠 $house"
done

echo ""
echo "   📍 STEELE ST:"
STEELE_HOUSES=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"street":"STEELE ST","limit":100}' | \
  jq -r '.rows[].address' | grep -o '^[0-9]*' | sort -n | uniq)
echo "$STEELE_HOUSES" | while read house; do
  echo "      🏠 $house"
done

echo ""
echo "   📍 B MCINTYRE HALL # 359:"
MCINTYRE_HOUSES=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"street":"B MCINTYRE HALL # 359","limit":100}' | \
  jq -r '.rows[].address' | grep -o '^[0-9]*' | sort -n | uniq)
echo "$MCINTYRE_HOUSES" | while read house; do
  echo "      🏠 $house"
done

echo ""

# Test 2: Complete workflow test  
echo "2. Testing complete workflow: HAYFORD AVE + 3006..."
COMPLETE_RESULT=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"house":3006,"street":"HAYFORD AVE","range":20,"limit":5}')

if echo "$COMPLETE_RESULT" | jq -e '.ok' > /dev/null; then
  echo "✅ Complete search works"
  echo "   Found $(echo "$COMPLETE_RESULT" | jq -r '.total') nearby addresses:"
  echo "$COMPLETE_RESULT" | jq -r '.rows[]? | "   👤 \(.name) - \(.address), \(.city) (\(.party))"'
else
  echo "❌ Complete search failed"
fi

echo ""

echo "🎯 USER WORKFLOW:"
echo "================="
echo "1. 🖱️ Click 'Street' field"
echo "   → Shows: B MCINTYRE HALL # 359, HAYFORD AVE, STEELE ST (blue dropdown)"
echo ""
echo "2. 🖱️ Click 'HAYFORD AVE'"
echo "   → Street field fills with 'HAYFORD AVE'"
echo "   → House number field automatically gets house numbers: 3006"
echo ""
echo "3. 🖱️ Click 'House #' field"
echo "   → Shows: 3006 (yellow dropdown)"
echo ""
echo "4. 🖱️ Click '3006'"
echo "   → House field fills with '3006'"
echo ""
echo "5. 🖱️ Click 'Find nearby'"
echo "   → Shows 3 results with David, Monique, and Jake Aadland"
echo ""

echo "🎨 VISUAL INDICATORS:"
echo "===================="
echo "• 🔵 Street dropdown: Light blue background"
echo "• 🟡 House dropdown: Light yellow background"  
echo "• ⏳ Loading states: 'Loading streets...' and 'Loading house numbers...'"
echo "• 🎯 Auto-population: House numbers appear after street selection"
echo ""

echo "🧪 TEST THE WORKFLOW:"
echo "===================="
echo "1. Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50"
echo "2. Click Street → Select HAYFORD AVE"
echo "3. Click House # → Should show 3006"
echo "4. Click 3006 → Fill house field"
echo "5. Click Find nearby → Should show 3 results"
echo ""
echo "🔧 Alternative street test:"
echo "• Select STEELE ST → House # should show 1507"
echo "• Complete search should find Nathan Aagard"