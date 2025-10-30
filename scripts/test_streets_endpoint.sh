#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8787}"
JSON_TMP="$(mktemp)"
STATUS_TMP="$(mktemp)"
cleanup() { rm -f "$JSON_TMP" "$STATUS_TMP"; }
trap cleanup EXIT

echo "🔍 Testing /api/streets against ${BASE_URL}"

payload="$(cat <<'JSON'
{
  "county": "ALBANY",
  "city": "LARAMIE",
  "limit": 50
}
JSON
)"

if ! curl -sS -X POST \
  -H "content-type: application/json" \
  -d "$payload" \
  "${BASE_URL}/api/streets" \
  -o "$JSON_TMP" \
  -w "%{http_code}" > "$STATUS_TMP"; then
  echo "❌ Unable to reach ${BASE_URL}. Start the worker (e.g., 'npx wrangler dev --persist') and retry."
  exit 1
fi

status="$(cat "$STATUS_TMP")"
if [[ "$status" != "200" ]]; then
  echo "❌ POST /api/streets failed (HTTP ${status})"
  cat "$JSON_TMP"
  exit 1
fi

ok="$(jq -r '.ok // empty' "$JSON_TMP" 2>/dev/null || echo "")"
total="$(jq -r '.total // empty' "$JSON_TMP" 2>/dev/null || echo "")"

if [[ "$ok" != "true" ]]; then
  echo "❌ Response did not include ok=true"
  cat "$JSON_TMP"
  exit 1
fi

echo "✅ /api/streets returned $total streets"
echo "   Sample:"
jq -r '.streets[:5][] | "   • \(.name) (\(.count) voters)"' "$JSON_TMP"

echo "🔁 Verifying that GET is rejected with 405"
curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}/api/streets" > "$STATUS_TMP" || true
get_status="$(cat "$STATUS_TMP")"
if [[ "$get_status" != "405" ]]; then
  echo "⚠️ Expected GET /api/streets to return 405, but got ${get_status}"
else
  echo "✅ GET /api/streets correctly returns 405"
fi

echo "✅ Street endpoint checks complete"
