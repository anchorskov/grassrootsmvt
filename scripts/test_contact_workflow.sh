#!/bin/bash

echo "🧪 Testing Contact Page Workflow..."
echo "=================================="

# Test 1: Check if canvass page loads
echo "1. Testing canvass page load..."
canvass_load=$(curl -s "http://localhost:8788/canvass/" | grep -o "📋 Contact")
if [ "$canvass_load" = "📋 Contact" ]; then
  echo "✅ Canvass page loads with contact button"
else
  echo "❌ Canvass page not loading properly"
fi

# Test 2: Check if contact page loads
echo ""
echo "2. Testing contact page load..."
contact_load=$(curl -s "http://localhost:8788/contact" | grep -o "Contact Voter")
if [ "$contact_load" = "Contact Voter" ]; then
  echo "✅ Contact page loads correctly"
else
  echo "❌ Contact page not loading"
fi

# Test 3: Test contact page with parameters
echo ""
echo "3. Testing contact page with voter data..."
contact_params=$(curl -s "http://localhost:8788/contact?voter_id=12345&name=Test%20Voter&address=123%20Main%20St&city=Laramie&zip=82070&party=Republican&phone=+15551234567" | grep -E "Contact Voter")
if [ -n "$contact_params" ]; then
  echo "✅ Contact page accepts voter data parameters"
else
  echo "❌ Contact page parameter handling issue"
fi

# Test 4: Test API endpoint
echo ""
echo "4. Testing contact API endpoint..."
api_test=$(curl -s -X POST http://localhost:8787/api/contact \
  -H "Content-Type: application/json" \
  -d '{"voter_id":"test123","method":"door","outcome":"connected","comments":"Test from workflow"}' | grep -o success)

if [ "$api_test" = "success" ]; then
  echo "✅ Contact API endpoint working"
else
  echo "❌ Contact API endpoint issue"
fi

echo ""
echo "🎯 Manual Test Instructions:"
echo "============================"
echo "1. Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo "2. Search for voter: street='HAYFORD AVE', house='3006'"
echo "3. Click 'Find nearby' to load voters"
echo "4. Click '📋 Contact' button on any voter"
echo "5. Verify navigation to contact page with voter data populated"
echo "6. Fill out contact form and submit"
echo "7. Verify success message and API integration"

echo ""
echo "🚨 Expected Behavior:"
echo "===================="
echo "- No console errors when clicking contact button"
echo "- Smooth navigation to contact page"
echo "- Voter data appears in contact form"
echo "- Form submission works properly"
echo "- Success feedback after submission"