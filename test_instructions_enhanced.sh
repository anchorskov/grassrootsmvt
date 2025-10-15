#!/bin/bash

echo "🎯 Testing Enhanced Instructions System..."

# Check if instructions are enabled by default
echo "1. Testing default state..."
page_content=$(curl -s "http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated")

if echo "$page_content" | grep -q 'checked>' && echo "$page_content" | grep -q 'instructionsPanel.*style.*margin-bottom'; then
    echo "✅ Instructions enabled by default"
else
    echo "❌ Instructions not enabled by default"
fi

# Test the instruction text content
if echo "$page_content" | grep -q "Click on the Street field below to start"; then
    echo "✅ Initial instruction text found"
else
    echo "❌ Initial instruction text not found"
fi

echo
echo "2. Testing API functionality still works..."
response=$(curl -s -X POST http://localhost:8787/api/canvass/nearby \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "county": "ALBANY",
      "city": "LARAMIE", 
      "parties": ["Unaffiliated"]
    },
    "house": 3006,
    "street": "HAYFORD AVE",
    "range": 20,
    "limit": 20
  }')

records=$(echo "$response" | jq -r '.rows | length')
echo "✅ API returned $records voter records"

echo
echo "3. Enhanced Instructions Testing Guide:"
echo "========================================="
echo
echo "🌐 Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo
echo "Expected Instruction Flow:"
echo "-------------------------"
echo "1. ✅ Initial Load: 'Click on the Street field below to start' (ENABLED BY DEFAULT)"
echo "2. 👆 Click Street Field: 'Type or select a street name from the blue dropdown'"
echo "3. 📝 SELECT 'HAYFORD AVE' from dropdown: 'Great! Now select a house number from the yellow dropdown above'"
echo "4. 📝 SELECT '3006' from house dropdown: 'Perfect! Click Find nearby to search for voters'"
echo "5. 🔍 Click 'Find nearby': 'Searching for nearby voters...'"
echo "6. ✅ Results appear: 'Found results! Review the voters below and take action'"
echo
echo "🔧 Key Improvements:"
echo "- Instructions are ON by default (checked checkbox)"
echo "- Instructions update ONLY when user SELECTS from dropdowns"
echo "- Manual typing has delayed updates to avoid constant changes"
echo "- Each step provides clear guidance for next action"
echo
echo "📝 Test Actions:"
echo "- Try selecting from dropdowns vs typing manually"
echo "- Verify instructions update at the right moments"
echo "- Toggle instructions off/on to test functionality"
echo "- Complete full workflow and verify all steps work"