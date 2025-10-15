#!/bin/bash

echo "🎛️ Testing Instructions Toggle Functionality..."

# Check if the toggle elements are present in the HTML
echo "1. Checking HTML elements..."
page_content=$(curl -s "http://localhost:8788/canvass/?county=BIG+HORN&city=BURLINGTON&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50")

if echo "$page_content" | grep -q 'id="instructionsToggle"'; then
    echo "✅ instructionsToggle element found"
else
    echo "❌ instructionsToggle element NOT found"
fi

if echo "$page_content" | grep -q 'id="instructionsPanel"'; then
    echo "✅ instructionsPanel element found"
else
    echo "❌ instructionsPanel element NOT found"
fi

if echo "$page_content" | grep -q 'id="instructionText"'; then
    echo "✅ instructionText element found"
else
    echo "❌ instructionText element NOT found"
fi

# Check if the checkbox is checked by default
if echo "$page_content" | grep -q 'checked>'; then
    echo "✅ Checkbox is checked by default"
else
    echo "❌ Checkbox is NOT checked by default"
fi

echo
echo "2. Manual Toggle Testing Instructions:"
echo "======================================"
echo
echo "🌐 Open: http://localhost:8788/canvass/?county=BIG+HORN&city=BURLINGTON&parties=Republican&parties=Democratic&parties=Unaffiliated&limit=50"
echo
echo "📋 In browser console, you should see:"
echo "   '🎛️ Instructions elements found: {toggle: true, panel: true, text: true}'"
echo
echo "🔄 Test the toggle by:"
echo "   1. Click the 'Show step-by-step instructions' checkbox"
echo "   2. Look for console message: '🎛️ Instructions toggle changed to: false'"
echo "   3. Verify the blue instructions panel disappears"
echo "   4. Click the checkbox again"
echo "   5. Look for console message: '🎛️ Instructions toggle changed to: true'"
echo "   6. Verify the blue instructions panel reappears"
echo
echo "❗ If toggle doesn't work, check:"
echo "   - Are there any JavaScript errors in console?"
echo "   - Do you see the element detection messages?"
echo "   - Is the event listener being attached?"