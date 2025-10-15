#!/bin/bash

echo "🔍 Testing canvass debug scenario..."

# Test the exact API call that should happen when house number is selected
echo "1. Testing API call directly..."
curl -s -X POST http://localhost:8787/api/canvass/nearby \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "county": "ALBANY",
      "city": "LARAMIE", 
      "parties": ["Unaffiliated"]
    },
    "house": 3006,
    "street": "HAYFORD AVE",
    "range": 100,
    "limit": 20
  }' | jq '.'

echo
echo "2. Testing if canvass page loads correctly..."
# Check if the page loads
curl -s http://localhost:8788/canvass/?county=ALBANY\&city=LARAMIE\&parties=Unaffiliated | grep -o "Canvass"

echo
echo "3. Testing if API client is available..."
# Open browser and test if apiFetch is available
echo "Open browser console and run: window.apiFetch ? 'apiFetch available' : 'apiFetch not available'"

echo
echo "4. Manual test instructions:"
echo "   - Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo "   - Open browser developer tools (F12)"
echo "   - In console, check: window.apiFetch"
echo "   - Click on street field to load autocomplete"
echo "   - Type or select 'HAYFORD AVE'"
echo "   - Select house number '3006'"
echo "   - Click 'Find nearby'"
echo "   - Check console for any errors"