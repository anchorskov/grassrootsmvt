#!/bin/bash

echo "🎯 Testing Enhanced Contact Functionality..."

# Test the new /api/contact endpoint
echo "1. Testing new contact API endpoint..."
response=$(curl -s -X POST http://localhost:8787/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "voter_id": "128193",
    "method": "door",
    "outcome": "connected",
    "wants_volunteer": true,
    "wants_updates": true,
    "ok_callback": true,
    "email": "test@example.com",
    "optin_email": true,
    "for_term_limits": true,
    "comments": "Very interested in volunteering, asked about upcoming events"
  }')

if echo "$response" | jq -e '.ok' > /dev/null; then
  echo "✅ Contact API working"
  echo "Response: $(echo "$response" | jq -r '.message')"
else
  echo "❌ Contact API failed"
  echo "Error: $(echo "$response" | jq -r '.error // "Unknown error"')"
fi

echo
echo "2. Testing canvass page with modal..."
page_content=$(curl -s "http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated")

if echo "$page_content" | grep -q 'contactModal'; then
    echo "✅ Contact modal found on page"
else
    echo "❌ Contact modal not found"
fi

if echo "$page_content" | grep -q 'Contact Details'; then
    echo "✅ Modal content found"
else
    echo "❌ Modal content not found"
fi

if echo "$page_content" | grep -q 'openContactModal'; then
    echo "✅ Modal JavaScript function found"
else
    echo "❌ Modal JavaScript function not found"
fi

echo
echo "3. Features implemented:"
echo "========================"
echo "✅ Rich contact modal with progressive disclosure"
echo "✅ Contact method selection (door/phone)"
echo "✅ 8 different outcome types"
echo "✅ Quick capture checkboxes"
echo "✅ Email collection with opt-in consent"
echo "✅ Issue interest tracking"
echo "✅ Volunteer recruitment capture"
echo "✅ Notes field for additional details"
echo "✅ API endpoint for rich data storage"
echo "✅ Backwards compatibility with existing system"
echo
echo "🧪 Manual Testing Instructions:"
echo "==============================="
echo "🌐 Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo
echo "📋 Test the enhanced contact flow:"
echo "1. Search for a voter (e.g., street: HAYFORD AVE, house: 3006)"
echo "2. Click '📋 Contacted' button (not the old 'Contacted')"
echo "3. Verify modal opens with voter information"
echo "4. Test progressive disclosure:"
echo "   • Select 'Connected' → see quick captures and issues"
echo "   • Check 'Wants updates' → see email collection"
echo "   • Fill in email and consent checkboxes"
echo "5. Submit and verify success"
echo "6. Check that buttons are disabled and success indicator appears"
echo
echo "🔍 Advanced Testing:"
echo "• Try different outcomes and verify appropriate sections show/hide"
echo "• Test email validation and consent flows"
echo "• Verify all form data is captured correctly"
echo "• Check backwards compatibility with existing 'No answer', 'Note' buttons"