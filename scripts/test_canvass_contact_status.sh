#!/bin/bash

echo "🧪 Testing Contact Status Integration..."
echo "======================================="

# Test 1: Test the new contact status API endpoint
echo "1. Testing contact status API endpoint..."

# Get some voter IDs from the database for testing
echo "   Getting sample voter IDs..."
voter_ids=$(curl -s "http://localhost:8787/api/voters?county=ALBANY&city=LARAMIE&limit=3" | grep -o '"voter_id":"[^"]*"' | head -3 | cut -d'"' -f4 | tr '\n' ',' | sed 's/,$//')

if [ -n "$voter_ids" ]; then
  echo "   Testing with voter IDs: $voter_ids"
  
  # Test the contact status endpoint
  status_response=$(curl -s "http://localhost:8787/api/contact/status?voter_ids=$voter_ids")
  echo "   API Response: $status_response"
  
  if echo "$status_response" | grep -q '"ok":true'; then
    echo "✅ Contact status API working"
  else
    echo "❌ Contact status API issue"
  fi
else
  echo "❌ Could not get voter IDs for testing"
fi

echo ""
echo "2. Testing canvass page contact status display..."

# Check if the canvass page loads with contact status functionality
canvass_check=$(curl -s "http://localhost:8788/canvass/" | grep -E "(contact-status|📞)" | wc -l)

if [ "$canvass_check" -gt 0 ]; then
  echo "✅ Canvass page includes contact status code"
else
  echo "❌ Contact status code not found in canvass page"
fi

echo ""
echo "🧪 Manual Testing Instructions:"
echo "=============================="
echo "1. Open: http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
echo "2. Search for voters (street: HAYFORD AVE, house: 3006)"
echo "3. Click 'Find nearby' and wait for results"
echo "4. Look for contact status information displayed under voter cards:"
echo "   - If no contact: No additional status shown"
echo "   - If contacted: Shows status like '✅ Connected by user@email.com on 10/15/2025 (door)'"
echo "   - Different icons for different outcomes:"
echo "     • ✅ Connected/Contacted (green)"
echo "     • 🚪 No Answer/Not Home (orange)" 
echo "     • 🚫 Refused/DNC (red)"
echo "     • 📦 Moved/Wrong Address (purple)"

echo ""
echo "📋 Contact Status Features:"
echo "=========================="
echo "✅ Shows last contact date and volunteer"
echo "✅ Color-coded status indicators"
echo "✅ Contact method (door/phone) display"
echo "✅ Pulls from both voter_contacts and canvass_activity tables"
echo "✅ Shows most recent contact per voter"
echo "✅ Volunteer email abbreviated to username for privacy"

echo ""
echo "🔧 Database Tables Used:"
echo "========================"
echo "• voter_contacts: Rich contact data with outcomes and preferences"
echo "• canvass_activity: Basic door-to-door contact logging"
echo "• Both tables store volunteer_email/volunteer_id for attribution"

echo ""
echo "🎯 Expected Behavior:"
echo "====================="
echo "1. Voter cards show current contact status when available"
echo "2. Contact history helps volunteers avoid duplicate contacts"
echo "3. Shows who contacted the voter and when"
echo "4. Different visual styles for different contact outcomes"
echo "5. Contact information updates when new contacts are made"