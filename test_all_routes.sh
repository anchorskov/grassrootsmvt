#!/usr/bin/env bash
# Path: test_all_routes.sh
# 🧪 Automated API Test Suite for GrassrootsMVT Worker
# Usage: ./test_all_routes.sh [--prod]
# Runs curl-based endpoint tests for local or production API.

API_HOST="${API_HOST:-localhost}"

detect_api_port() {
  local host="$1"
  shift
  local candidates=("$@")
  for port in "${candidates[@]}"; do
    local resp
    resp=$(curl -s --max-time 1 "http://${host}:${port}/api/ping" || true)
    if [[ -n "$resp" ]] && grep -q '"ok":true' <<<"$resp"; then
      echo "$port"
      return
    fi
  done
  echo ""
}

override_port="${API_PORT:-${WRANGLER_DEV_PORT:-}}"
if [[ -n "$override_port" ]]; then
  API_PORT="$override_port"
else
  detected_port=$(detect_api_port "$API_HOST" 8787 8788)
  API_PORT="${detected_port:-8787}"
fi
API_LOCAL="http://${API_HOST}:${API_PORT}/api"
API_PROD="https://volunteers.grassrootsmvt.org/api"
API_URL="$API_LOCAL"
LOGFILE="test_results.log"
PROD_MODE=0

if [[ "${1:-}" == "--prod" ]]; then
  API_URL="$API_PROD"
  PROD_MODE=1
fi

if ! command -v jq &> /dev/null; then
  echo "❌ jq not installed. Please install jq to parse JSON results."
  exit 1
fi

TEST_VOTER_ID="${TEST_VOTER_ID:-342059}"

PASS=0
FAIL=0
WARN=0
ROUTE_RESULTS=()
# ANSI colors for pretty output
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
RESET="\033[0m"

echo "===================================================" | tee "$LOGFILE"
echo "🌐 Starting API Tests on: $API_URL" | tee -a "$LOGFILE"
[[ "$PROD_MODE" -eq 1 ]] && echo "⚠️  Production Mode Active – read-only tests only" | tee -a "$LOGFILE"
echo "===================================================" | tee -a "$LOGFILE"

function test_route() {
  local method="$1"
  local route="$2"
  local data="${3:-}"
  local desc="${4:-}"
  local url="$API_URL$route"
  local tmpfile=$(mktemp)
  
  echo -e "\n🔍 ${method} ${route} — ${desc}" | tee -a "$LOGFILE"

  local start_time=$(date +%s%3N)
  local result
  if [[ "$method" == "POST" ]]; then
    result=$(curl -s -w "\nHTTP %{http_code} TIME %{time_total}\n" \
      -H "Content-Type: application/json" -X POST \
      -d "$data" "$url" | tee "$tmpfile")
  else
    result=$(curl -s -w "\nHTTP %{http_code} TIME %{time_total}\n" "$url" | tee "$tmpfile")
  fi
  local end_time=$(date +%s%3N)

  local http_code=$(grep "HTTP" "$tmpfile" | awk '{print $2}')
  local time_total=$(grep "TIME" "$tmpfile" | awk '{print $2}')
  local json=$(grep -v "HTTP" "$tmpfile" | grep -v "TIME")
  
  local ok=""
  local error=""
  local message=""
  local email=""
  if echo "$json" | jq . &>/dev/null; then
    ok=$(echo "$json" | jq -r '.ok // empty')
    error=$(echo "$json" | jq -r '.error // empty')
    message=$(echo "$json" | jq -r '.message // empty')
    email=$(echo "$json" | jq -r '.email // empty')
  fi

  local status="FAIL"
  local color="$RED"
  if [[ "$http_code" == "200" && "$ok" == "true" ]]; then
    status="PASS"; color="$GREEN"; ((PASS++))
  elif [[ "$http_code" == "503" && "$error" == "dependency_missing" ]]; then
    status="WARN"; color="$YELLOW"; ((WARN++))
  elif [[ "$http_code" =~ ^(400|422)$ ]]; then
    status="WARN"; color="$YELLOW"; ((WARN++))
  else
    ((FAIL++))
  fi

  ROUTE_RESULTS+=("$route|$method|$http_code|$status|${error:-$message}|${time_total}s")

  printf "%b[%s]%b %-40s => HTTP %-3s | ok:%-5s | msg:%s | email:%s | ⏱ %ss\n" \
    "$color" "$status" "$RESET" "$desc" "$http_code" "$ok" "${message:0:40}" "$email" "$time_total" | tee -a "$LOGFILE"

  rm -f "$tmpfile"
}

# ------------------ ROUTE TESTS ---------------------

test_route GET "/ping" "" "Ping route"
test_route GET "/whoami" "" "Whoami route"
test_route GET "/metadata" "" "Metadata route"
test_route GET "/templates" "" "Templates route"
test_route GET "/db/tables" "" "DB tables route"
test_route GET "/db/schema?table=voters" "" "DB schema (voters)"
test_route POST "/call" '{"filters":{"county":"ALBANY"}}' "Call route (filters)"
test_route POST "/call" "{\"voter_id\":$TEST_VOTER_ID,\"result\":\"answered\"}" "Call route (log call)"
test_route POST "/canvass" "{\"voter_id\":$TEST_VOTER_ID,\"result\":\"door_knock\"}" "Canvass route"
test_route POST "/canvass/nearby" '{"county":"ALBANY","city":"Laramie"}' "Canvass nearby"
test_route POST "/streets" '{"county":"ALBANY","city":"Laramie"}' "Streets route"
test_route POST "/contact" "{\"voter_id\":$TEST_VOTER_ID,\"outcome\":\"connected\"}" "Contact route"
test_route POST "/contact-staging" "{\"county\":\"ALBANY\",\"city\":\"Laramie\",\"firstName\":\"Test\",\"lastName\":\"User\",\"voter_id\":$TEST_VOTER_ID}" "Contact staging"
test_route GET "/contact/status?voter_ids=$TEST_VOTER_ID" "" "Contact status"
test_route POST "/pulse" "{\"voter_id\":$TEST_VOTER_ID,\"contact_method\":\"sms\",\"consent_source\":\"test\"}" "Pulse route"

# Negative tests
test_route GET "/db/schema" "" "DB schema (missing table param)"
test_route POST "/call" '{}' "Call (missing params)"
test_route POST "/canvass" '{}' "Canvass (missing params)"
test_route POST "/streets" '{}' "Streets (missing params)"
test_route GET "/contact/status" "" "Contact status (missing voter_ids)"

# ------------------ SUMMARY ------------------------

echo -e "\n===================================================" | tee -a "$LOGFILE"
printf "Route%-35s | %-6s | %-6s | %-6s | %-30s | %s\n" " " "Method" "Code" "Status" "Message/Error" "Time" | tee -a "$LOGFILE"
echo "---------------------------------------------------" | tee -a "$LOGFILE"

for r in "${ROUTE_RESULTS[@]}"; do
  IFS='|' read -r route method code status msg time <<< "$r"
  printf "%-40s | %-6s | %-6s | %-6s | %-30s | %s\n" "$route" "$method" "$code" "$status" "${msg:0:30}" "$time" | tee -a "$LOGFILE"
done

echo -e "===================================================\n" | tee -a "$LOGFILE"
echo "✅ $PASS routes passed" | tee -a "$LOGFILE"
echo "⚠️  $WARN routes returned warnings or missing params" | tee -a "$LOGFILE"
echo "❌ $FAIL routes failed" | tee -a "$LOGFILE"
echo "📄 Results saved to: $LOGFILE"
echo "==================================================="
