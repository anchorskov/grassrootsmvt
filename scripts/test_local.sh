#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://127.0.0.1:8788}"
RED=$'\e[31m'; GREEN=$'\e[32m'; YEL=$'\e[33m'; NC=$'\e[0m'

need_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "${YEL}jq not found. Install with: sudo apt-get update && sudo apt-get install -y jq${NC}"
    exit 2
  fi
}

check_json() {
  local method="$1" path="$2" data="${3:-}"
  local url="${BASE}${path}"
  local tmp; tmp="$(mktemp)"
  local code

  if [[ "$method" == "GET" ]]; then
    code=$(curl -sS -w "%{http_code}" -H "accept: application/json" "$url" -o "$tmp")
  else
    code=$(curl -sS -w "%{http_code}" -H "content-type: application/json" -H "accept: application/json" -X "$method" --data "${data}" "$url" -o "$tmp")
  fi

  if [[ "$code" != 200 ]]; then
    echo "${RED}[FAIL] $method $path -> HTTP $code${NC}"
    echo "---- response ----"
    cat "$tmp"; echo
    rm -f "$tmp"
    return 1
  fi

  # Must be valid JSON
  if ! jq . >/dev/null 2>&1 < "$tmp"; then
    echo "${RED}[FAIL] $method $path -> not valid JSON${NC}"
    echo "---- body ----"
    cat "$tmp"; echo
    rm -f "$tmp"
    return 1
  fi

  echo "${GREEN}[OK]   $method $path${NC}"
  rm -f "$tmp"
}

check_text() {
  local path="$1"
  local url="${BASE}${path}"
  local body
  body="$(curl -sS "$url")"
  if [[ "$body" == *"hello from functions"* ]]; then
    echo "${GREEN}[OK]   GET $path (functions mounted)${NC}"
  else
    echo "${RED}[FAIL] GET $path (unexpected body)${NC}"
    echo "---- body ----"
    echo "$body"
    return 1
  fi
}

main() {
  need_jq

  echo "Base URL: ${BASE}"

  # 0) Functions mounted?
  check_text "/hello"

  # 1) Ping supports GET+POST and returns JSON
  check_json "GET"  "/api/ping"
  check_json "POST" "/api/ping" "{}"

  # 2) Call flow: next + complete
  check_json "POST" "/api/next" "{}"
  # Save a minimal outcome
  check_json "POST" "/api/complete" '{"voter_id":"TEST123","outcome":"vm"}'

  # 3) Canvass list supports GET+POST and returns JSON
  check_json "GET"  "/api/canvass/list"
  check_json "POST" "/api/canvass/list" "{}"

  echo "${GREEN}All endpoint smoke tests passed.${NC}"
}

main "$@"
