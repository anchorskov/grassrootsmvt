#!/bin/bash

echo "🔒 TESTING PROGRESSIVE FIELD ENABLING"
echo "====================================="
echo "Testing that house number field is disabled until street is selected"
echo ""

# Test 1: Check page load state
echo "1. Testing initial page state..."
PAGE_CONTENT=$(curl -s "http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50")

if echo "$PAGE_CONTENT" | grep -q 'placeholder="Select street first".*disabled'; then
  echo "✅ House field starts disabled with correct placeholder"
elif echo "$PAGE_CONTENT" | grep -q 'disabled.*placeholder="Select street first"'; then
  echo "✅ House field starts disabled with correct placeholder"  
else
  echo "❌ House field initial state incorrect"
  echo "Looking for disabled house field..."
  echo "$PAGE_CONTENT" | grep -A2 -B2 'id="house"'
fi

if echo "$PAGE_CONTENT" | grep -q 'enableHouseField'; then
  echo "✅ Enable/disable functions found in page"
else
  echo "❌ Enable/disable functions missing"
fi

echo ""

# Test 2: Test the API calls for street selection
echo "2. Testing street selection workflow..."

echo "   📍 Available streets:"
STREETS=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"limit":50}' | \
  jq -r '.rows[].address' | sed 's/^[0-9]* //' | sort -u)
echo "$STREETS" | while read street; do
  echo "      📍 $street"
done

echo ""
echo "   📍 Testing HAYFORD AVE selection..."
HAYFORD_HOUSES=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","city":"LARAMIE","parties":["Republican","Democratic","Unaffiliated"]},"street":"HAYFORD AVE","limit":100}' | \
  jq -r '.rows[].address' | grep -o '^[0-9]*' | sort -n | uniq)

if [ -n "$HAYFORD_HOUSES" ]; then
  echo "✅ HAYFORD AVE has house numbers: $HAYFORD_HOUSES"
else
  echo "❌ No house numbers found for HAYFORD AVE"
fi

echo ""

echo "🎯 PROGRESSIVE WORKFLOW:"
echo "========================"
echo "1. 🔒 INITIAL STATE:"
echo "   • Street field: ✅ Enabled, placeholder 'e.g. RAVEN ST'"
echo "   • House field:  🚫 Disabled, placeholder 'Select street first'"
echo ""
echo "2. 🖱️ USER CLICKS STREET FIELD:"
echo "   • Blue dropdown appears with 3 streets"
echo "   • House field remains disabled"
echo ""
echo "3. 🖱️ USER SELECTS 'HAYFORD AVE':"
echo "   • Street field fills with 'HAYFORD AVE'"
echo "   • House field: ✅ BECOMES ENABLED"
echo "   • House field placeholder changes to 'e.g. 5201'"
echo "   • House numbers auto-load in background"
echo ""
echo "4. 🖱️ USER CLICKS HOUSE FIELD:"
echo "   • Yellow dropdown shows: 3006"
echo "   • User can now select house number"
echo ""
echo "5. 🔄 IF USER CLEARS STREET:"
echo "   • House field: 🚫 BECOMES DISABLED AGAIN"
echo "   • House field value cleared"
echo "   • Placeholder returns to 'Select street first'"
echo ""

echo "🎨 VISUAL STATES:"
echo "================"
echo "DISABLED House Field:"
echo "  • Gray background (#f8fafc)"
echo "  • Gray text (#64748b)"
echo "  • Gray border (#e2e8f0)"
echo "  • 'not-allowed' cursor"
echo "  • Placeholder: 'Select street first'"
echo ""
echo "ENABLED House Field:"
echo "  • White background"
echo "  • Normal text color"
echo "  • Normal border"
echo "  • Normal cursor"
echo "  • Placeholder: 'e.g. 5201'"
echo ""

echo "🧪 TEST STEPS:"
echo "=============="
echo "1. Load page → House field should be grayed out"
echo "2. Click Street → House field stays disabled"
echo "3. Select HAYFORD AVE → House field enables (white background)"
echo "4. Click House field → Yellow dropdown with '3006'"
echo "5. Clear street → House field disables again"