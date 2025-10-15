#!/bin/bash

echo "🧪 TESTING 'GET NEXT' VOTER FUNCTIONALITY"
echo "========================================="
echo ""

echo "1. Testing Get Next Voter (what the 'Get Next' button does):"
echo "   Sending: {filters: {require_phone: true}, exclude_ids: []}"
echo ""
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"filters":{"require_phone":true},"exclude_ids":[]}' \
  http://localhost:8787/api/call)

echo "Response:"
echo "$RESPONSE" | jq
echo ""

if echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
  if echo "$RESPONSE" | jq -e '.voter_id' >/dev/null 2>&1; then
    VOTER_ID=$(echo "$RESPONSE" | jq -r '.voter_id')
    VOTER_NAME=$(echo "$RESPONSE" | jq -r '.first_name + " " + .last_name')
    VOTER_PHONE=$(echo "$RESPONSE" | jq -r '.phone_1 // "N/A"')
    echo "✅ SUCCESS: Got next voter!"
    echo "   Voter ID: $VOTER_ID"
    echo "   Name: $VOTER_NAME"
    echo "   Phone: $VOTER_PHONE"
    echo ""
    
    echo "2. Testing Call Logging (what happens after a call):"
    echo "   Sending: {voter_id: \"$VOTER_ID\", call_result: \"contacted\", notes: \"test call\"}"
    echo ""
    
    LOG_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
      -d "{\"voter_id\":\"$VOTER_ID\",\"call_result\":\"contacted\",\"notes\":\"test call from automated test\"}" \
      http://localhost:8787/api/call)
    
    echo "Response:"
    echo "$LOG_RESPONSE" | jq
    echo ""
    
    if echo "$LOG_RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
      echo "✅ SUCCESS: Call logged successfully!"
      echo ""
      echo "🎉 BOTH OPERATIONS WORKING!"
      echo "The 'Get Next' button should now work in the browser!"
    else
      echo "❌ FAILED: Call logging not working"
    fi
    
  elif echo "$RESPONSE" | jq -e '.empty' >/dev/null 2>&1; then
    echo "ℹ️ No eligible voters found with current filters"
    echo "   This is normal if database is empty or all voters have been called"
  else
    echo "❌ FAILED: Unexpected response format"
  fi
else
  echo "❌ FAILED: API returned error"
  echo "   Error: $(echo "$RESPONSE" | jq -r '.error // "Unknown error"')"
fi

echo ""
echo "🌐 Next step: Open http://localhost:8788/call and click 'Get Next'!"