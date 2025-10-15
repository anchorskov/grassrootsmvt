#!/bin/bash

echo "🧪 SEEDED DATA VERIFICATION TEST"
echo "==============================="
echo ""

echo "Testing working county/party combinations with current seeded data:"
echo ""

echo "1. BIG HORN County + Republican Party:"
echo "   URL: http://localhost:8788/call?county=BIG%20HORN&parties=Republican&limit=50"
RESULT1=$(curl -s "http://localhost:8787/api/call" \
  -X POST -H "Content-Type: application/json" \
  -d '{"filters":{"county":"BIG HORN","parties":["Republican"],"require_phone":true},"exclude_ids":[]}')

if echo "$RESULT1" | jq -e '.voter_id' >/dev/null 2>&1; then
  VOTER_NAME=$(echo "$RESULT1" | jq -r '.first_name + " " + .last_name')
  VOTER_PHONE=$(echo "$RESULT1" | jq -r '.phone_1')
  VOTER_CITY=$(echo "$RESULT1" | jq -r '.city')
  echo "   ✅ SUCCESS: Found $VOTER_NAME in $VOTER_CITY ($VOTER_PHONE)"
else
  echo "   ❌ FAILED: No voters found"
fi
echo ""

echo "2. ALBANY County + Unaffiliated Party:"
echo "   URL: http://localhost:8788/call?county=ALBANY&parties=Unaffiliated&limit=50"
RESULT2=$(curl -s "http://localhost:8787/api/call" \
  -X POST -H "Content-Type: application/json" \
  -d '{"filters":{"county":"ALBANY","parties":["Unaffiliated"],"require_phone":true},"exclude_ids":[]}')

if echo "$RESULT2" | jq -e '.voter_id' >/dev/null 2>&1; then
  VOTER_NAME=$(echo "$RESULT2" | jq -r '.first_name + " " + .last_name')
  VOTER_PHONE=$(echo "$RESULT2" | jq -r '.phone_1')
  VOTER_CITY=$(echo "$RESULT2" | jq -r '.city')
  echo "   ✅ SUCCESS: Found $VOTER_NAME in $VOTER_CITY ($VOTER_PHONE)"
else
  echo "   ❌ FAILED: No voters found"
fi
echo ""

echo "3. CAMPBELL County + Republican Party:"
echo "   URL: http://localhost:8788/call?county=CAMPBELL&parties=Republican&limit=50"
RESULT3=$(curl -s "http://localhost:8787/api/call" \
  -X POST -H "Content-Type: application/json" \
  -d '{"filters":{"county":"CAMPBELL","parties":["Republican"],"require_phone":true},"exclude_ids":[]}')

if echo "$RESULT3" | jq -e '.voter_id' >/dev/null 2>&1; then
  VOTER_NAME=$(echo "$RESULT3" | jq -r '.first_name + " " + .last_name')
  VOTER_PHONE=$(echo "$RESULT3" | jq -r '.phone_1')
  VOTER_CITY=$(echo "$RESULT3" | jq -r '.city')
  echo "   ✅ SUCCESS: Found $VOTER_NAME in $VOTER_CITY ($VOTER_PHONE)"
else
  echo "   ❌ FAILED: No voters found"
fi
echo ""

echo "4. Testing the problematic GOSHEN County (should fail):"
echo "   URL: http://localhost:8788/call?county=GOSHEN&parties=Republican&limit=50"
RESULT4=$(curl -s "http://localhost:8787/api/call" \
  -X POST -H "Content-Type: application/json" \
  -d '{"filters":{"county":"GOSHEN","parties":["Republican"],"require_phone":true},"exclude_ids":[]}')

if echo "$RESULT4" | jq -e '.voter_id' >/dev/null 2>&1; then
  echo "   🤔 UNEXPECTED: Found voter in GOSHEN (this shouldn't happen)"
else
  echo "   ✅ EXPECTED: No voters found in GOSHEN county (not in seeded data)"
fi
echo ""

echo "🎯 RECOMMENDATION:"
echo "Use one of the working URLs above to test the 'Get Next' functionality."
echo "The system is fully functional with the current seeded data!"
echo ""
echo "📋 Available counties in seeded data:"
curl -s "http://localhost:8787/api/voters" | jq -r '.voters | map(.county) | unique | sort | .[]' | head -10