#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
UI_DIR="$ROOT/ui"
PORT=8788
WRANGLER_BIN="npx wrangler@4.42.0"

RESULT_DIR="$ROOT/.test-results"
mkdir -p "$RESULT_DIR"
OUT_MD="$RESULT_DIR/api-verification.md"

echo "# API Verification Results" > "$OUT_MD"
echo "" >> "$OUT_MD"
echo "Endpoint | Tried Method | Status | Access-Control-Allow-Origin" >> "$OUT_MD"
echo "--- | --- | --- | ---" >> "$OUT_MD"

# Start pages dev in background
cd "$ROOT"
$WRANGLER_BIN pages dev "$UI_DIR" --port=$PORT > /tmp/wrangler-pages-dev.log 2>&1 &
WRANGLER_PID=$!

echo "Started wrangler pages dev (PID $WRANGLER_PID), waiting for port $PORT..."

# wait for server
for i in {1..60}; do
  if ss -ltn | awk '{print $4}' | grep -q ":$PORT$"; then
    echo "Server is up"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "Timeout waiting for wrangler pages dev to start. See /tmp/wrangler-pages-dev.log"
    tail -n +1 /tmp/wrangler-pages-dev.log || true
    kill $WRANGLER_PID || true
    exit 1
  fi
done

BASE_URL="http://127.0.0.1:$PORT"

# Discover endpoints from ui/functions/api
MAP_FILE="/tmp/api_endpoints.txt"
find "$ROOT/ui/functions/api" -type f -name "*.js" | sort > $MAP_FILE

probe_methods=(GET OPTIONS POST)

while read -r filepath; do
  # compute URL path from file path
  rel="${filepath#$ROOT/ui/functions/api}"
  path="${rel%.js}"
  url="$BASE_URL$path"

  echo "\nTesting $path -> $url"

  success=0
  tried_method=""
  final_status=""
  final_origin="(missing)"

  for m in "${probe_methods[@]}"; do
    tried_method=$m
    # prepare curl args
    hdrfile=/tmp/headers.txt
    bodyfile=/tmp/body.txt
    if [ "$m" = "GET" ]; then
      curl -sS -D "$hdrfile" -o "$bodyfile" -H "Origin: http://localhost:$PORT" "$url" || true
    elif [ "$m" = "OPTIONS" ]; then
      curl -sS -D "$hdrfile" -o "$bodyfile" -X OPTIONS -H "Origin: http://localhost:$PORT" -H "Access-Control-Request-Method: GET" "$url" || true
    else
      curl -sS -D "$hdrfile" -o "$bodyfile" -X POST -H "Origin: http://localhost:$PORT" -H "Content-Type: application/json" -d '{}' "$url" || true
    fi

    status=$(head -n1 "$hdrfile" 2>/dev/null | awk '{print $2}' || echo "?")
    origin_hdr=$(grep -i -m1 '^Access-Control-Allow-Origin:' "$hdrfile" 2>/dev/null | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r' || echo "(missing)")

    if [ "$status" = "200" ]; then
      success=1
      final_status=$status
      final_origin=$origin_hdr
      break
    else
      final_status=$status
      final_origin=$origin_hdr
    fi
  done

  echo "$path | $tried_method | $final_status | $final_origin" >> "$OUT_MD"

  if [ "$success" -ne 1 ]; then
    echo "\n--- DIAGNOSTIC for $path ---" >> "$OUT_MD"
    echo "Tried method: $tried_method" >> "$OUT_MD"
    echo "Status: $final_status" >> "$OUT_MD"
    echo "\nHeaders:" >> "$OUT_MD"
    sed -n '1,200p' /tmp/headers.txt >> "$OUT_MD" 2>/dev/null || true
    echo "\nBody:" >> "$OUT_MD"
    sed -n '1,400p' /tmp/body.txt >> "$OUT_MD" 2>/dev/null || true
  fi

done < "$MAP_FILE"

# Stop wrangler dev
echo "Stopping wrangler (PID $WRANGLER_PID)"
kill $WRANGLER_PID || true
sleep 1
if ps -p $WRANGLER_PID > /dev/null; then
  kill -9 $WRANGLER_PID || true
fi

echo "Results written to $OUT_MD"
echo "--- summary ---"
tail -n +1 "$OUT_MD" | sed -n '1,200p' || true

exit 0
