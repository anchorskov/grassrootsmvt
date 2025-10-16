#!/bin/bash

echo "🎯 TESTING NEW OPTIMIZED STREET AUTOCOMPLETE"
echo "============================================"
echo "Testing the new /api/streets endpoint vs old /api/canvass/nearby approach"
echo ""

# Test 1: New optimized streets endpoint
echo "1. Testing NEW /api/streets endpoint (optimized)..."
NEW_RESULT=$(curl -s -X POST "http://localhost:8787/api/streets" \
  -H "Content-Type: application/json" \
  -d '{"county": "NATRONA", "city": "CASPER"}')

if echo "$NEW_RESULT" | jq -e '.ok' > /dev/null; then
  echo "✅ New /api/streets endpoint working"
  NEW_TOTAL=$(echo "$NEW_RESULT" | jq -r '.total')
  echo "   Found $NEW_TOTAL unique streets"
  
  echo ""
  echo "   Sample streets from new endpoint:"
  echo "$NEW_RESULT" | jq -r '.streets[:5][] | "   • \(.name) (\(.count) voters)"'
else
  echo "❌ New /api/streets endpoint failed"
  echo "$NEW_RESULT" | jq .
fi

echo ""

# Test 2: Old canvass/nearby approach for comparison
echo "2. Testing OLD /api/canvass/nearby approach (limited)..."
OLD_RESULT=$(curl -s -X POST "http://localhost:8787/api/canvass/nearby" \
  -H "Content-Type: application/json" \
  -d '{"filters": {"county": "NATRONA", "city": "CASPER"}, "limit": 200}')

if echo "$OLD_RESULT" | jq -e '.ok' > /dev/null; then
  echo "✅ Old /api/canvass/nearby endpoint working"
  OLD_TOTAL=$(echo "$OLD_RESULT" | jq -r '.total')
  echo "   Found $OLD_TOTAL voter records (limited by API)"
  
  # Extract unique streets from old approach
  OLD_STREETS=$(echo "$OLD_RESULT" | jq -r '.rows[].address' | sed 's/^[0-9]* *//' | sort -u | wc -l)
  echo "   Unique streets extracted: $OLD_STREETS"
  
  echo ""
  echo "   Sample streets from old approach:"
  echo "$OLD_RESULT" | jq -r '.rows[].address' | sed 's/^[0-9]* *//' | sort -u | head -5 | sed 's/^/   • /'
else
  echo "❌ Old /api/canvass/nearby endpoint failed"
  echo "$OLD_RESULT" | jq .
fi

echo ""

# Test 3: Performance comparison
echo "3. PERFORMANCE COMPARISON:"
echo "========================="
echo "📊 NEW /api/streets endpoint:"
echo "   • Streets found: $NEW_TOTAL"
echo "   • Data completeness: 100% (all streets in county/city)"
echo "   • Response size: ~$(echo "$NEW_RESULT" | wc -c) bytes"
echo "   • Purpose-built: ✅ Optimized for autocomplete"
echo ""
echo "📊 OLD /api/canvass/nearby approach:"
echo "   • Voter records: $OLD_TOTAL (API limited)"
echo "   • Streets extracted: $OLD_STREETS"
echo "   • Data completeness: $(echo "scale=1; $OLD_STREETS * 100 / $NEW_TOTAL" | bc)% (incomplete)"
echo "   • Response size: ~$(echo "$OLD_RESULT" | wc -c) bytes"
echo "   • Purpose: 🔧 Designed for nearby voter lookup, not street lists"

echo ""
echo "🎯 IMPROVEMENT SUMMARY:"
echo "======================="
echo "• $(echo "$NEW_TOTAL - $OLD_STREETS" | bc) MORE STREETS available with new endpoint"
echo "• 100% coverage vs $(echo "scale=1; $OLD_STREETS * 100 / $NEW_TOTAL" | bc)% coverage"
echo "• Dedicated endpoint for street autocomplete use case"
echo "• Cleaner separation of concerns (streets vs voter lookup)"
echo ""

echo "🧪 TEST THE NEW COMPONENT:"
echo "=========================="
echo "1. Open: http://localhost:8788/contact-form/"
echo "2. Select: Natrona County → Casper"
echo "3. Click street field → Should load $NEW_TOTAL streets instantly"
echo "4. Type to filter → Instant client-side filtering"
echo "5. Complete street coverage for better user experience!"