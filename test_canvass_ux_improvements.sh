#!/bin/bash

echo "� Testing enhanced canvass page with instructions..."

# Check if the page loads with the new instructions feature
echo "1. Testing page load..."
curl -s http://localhost:8788/canvass/?county=ALBANY\&city=LARAMIE\&parties=Unaffiliated | grep -q "Show step-by-step instructions"
if [ $? -eq 0 ]; then
    echo "✅ Instructions toggle found on page"
else
    echo "❌ Instructions toggle not found"
fi

# Check if the instructions panel exists
curl -s http://localhost:8788/canvass/?county=ALBANY\&city=LARAMIE\&parties=Unaffiliated | grep -q "instructionsPanel"
if [ $? -eq 0 ]; then
    echo "✅ Instructions panel element found"
else
    echo "❌ Instructions panel element not found"
fi

# Check if the API is still working
echo
echo "2. Testing API functionality..."
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

echo "$response" | jq -r '.rows | length' | xargs -I {} echo "✅ API returned {} voter records"

echo
echo "3. Manual testing instructions:"
echo "   - Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo "   - Toggle the 'Show step-by-step instructions' checkbox"
echo "   - Follow the step-by-step instructions:"
echo "     • Click on Street field → should show 'Type or select a street name'"
echo "     • Type 'HAYFORD AVE' → should show 'Great! Now select a house number'"
echo "     • Select house '3006' → should show 'Perfect! Click Find nearby'"
echo "     • Click 'Find nearby' → should show 'Searching...' then 'Found results!'"
echo "   - Verify the instructions update at each step"