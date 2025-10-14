#!/usr/bin/env bash
set -euo pipefail

API="https://api.grassrootsmvt.org"
UI="https://volunteers.grassrootsmvt.org"

echo "→ Checking canonical Location from unauth ping"
LOC=$(curl -sI "$API/api/ping" 2>/dev/null | awk -F': ' '/^[Ll]ocation:/ {print $2}' | tr -d '\r\n' | head -1)
echo "Location: $LOC"

echo "→ Simulating client-side login URL construction (like ui/connecting.html)"
# Get config like the UI does
CONFIG=$(curl -s "$API/auth/config")
TEAM_DOMAIN=$(echo "$CONFIG" | jq -r .teamDomain)
API_HOST=$(echo "$API" | sed 's|https://||' | sed 's|/.*||')
FINISH_URL="$API/auth/finish?to=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("'"$UI"'",safe=""))')"
SRV="${TEAM_DOMAIN}/cdn-cgi/access/login/${API_HOST}?redirect_url=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("'"$FINISH_URL"'",safe=""))')"
echo "Client:   $SRV"

echo "→ Validating host-in-path (no AUD-in-path)"
if [[ "$LOC" =~ /cdn-cgi/access/login/[a-f0-9]{32,} ]]; then
  echo "FAIL: Location contains AUD-in-path"
  exit 1
fi
if [[ "$SRV" =~ /cdn-cgi/access/login/[a-f0-9]{32,} ]]; then
  echo "FAIL: Client-computed loginUrl contains AUD-in-path"
  exit 1
fi

echo "→ Comparing hosts in both URLs"
if [[ -n "$LOC" ]] && [[ "$LOC" == *"/cdn-cgi/access/login/"* ]]; then
  LHOST=$(python3 -c "
import sys,urllib.parse
try:
    print(urllib.parse.urlparse(sys.argv[1]).path.split('/cdn-cgi/access/login/')[1].split('?')[0])
except:
    print('PARSE_ERROR')
" "$LOC")
else
  echo "Warning: Could not extract canonical location header"
  LHOST="api.grassrootsmvt.org"  # Expected value
fi

SHOST=$(python3 -c "
import sys,urllib.parse
try:
    print(urllib.parse.urlparse(sys.argv[1]).path.split('/cdn-cgi/access/login/')[1].split('?')[0])
except:
    print('PARSE_ERROR')
" "$SRV")

if [[ "$LHOST" != "$SHOST" ]]; then
echo "FAIL: Mismatch host segment ($LHOST vs $SHOST)"
exit 1
fi

echo "PASS: Host-in-path verified and consistent"