#!/bin/bash

echo "🔧 Testing Street Selection Instruction Fix..."

echo "1. Testing API functionality..."
response=$(curl -s -X POST http://localhost:8787/api/canvass/nearby \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "county": "BIG HORN",
      "city": "BURLINGTON", 
      "parties": ["Republican", "Democratic", "Unaffiliated"]
    },
    "house": 104,
    "street": "CENTER ST",
    "range": 20,
    "limit": 20
  }')

records=$(echo "$response" | jq -r '.rows | length')
echo "✅ API returned $records voter records for CENTER ST"

echo
echo "2. Fixed Issues:"
echo "================"
echo "✅ Removed streetInput.focus() after dropdown selection"
echo "✅ Made focus event listener smarter to not revert instructions"
echo "✅ Focus only updates to 'streetFocused' if:"
echo "   - Currently at 'street' step, OR" 
echo "   - At 'streetFocused' step with empty input"
echo
echo "3. Expected Instruction Flow Now:"
echo "================================"
echo "1. 👋 Initial: 'Click on the Street field below to start'"
echo "2. 👆 Focus Street: 'Type or select a street name from the blue dropdown'"
echo "3. 📝 SELECT from dropdown: 'Great! Now select a house number' (SHOULD STAY)"
echo "4. 📝 SELECT house number: 'Perfect! Click Find nearby'"
echo "5. 🔍 Click Find: 'Searching...'"
echo "6. ✅ Results: 'Found results!'"
echo
echo "🧪 Test Instructions:"
echo "===================="
echo "🌐 Open: http://localhost:8788/canvass/?county=BIG+HORN&city=BURLINGTON&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50"
echo
echo "📋 Test the flow:"
echo "1. Click street field → should show 'Type or select...'"
echo "2. SELECT 'CENTER ST' from dropdown → should show 'Great! Now select house number' AND STAY"
echo "3. SELECT '104' from house dropdown → should show 'Perfect! Click Find nearby'"
echo "4. Click 'Find nearby' → should show search then results"
echo
echo "✅ Key Fix: Instructions should NO LONGER revert to 'Type or select...' after street selection"