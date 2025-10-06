#!/usr/bin/env bash
set -euo pipefail

set -o pipefail

echo "[1/5] Building Pages Functions into ui/.wrangler..."
npx wrangler@4.42.0 pages functions build ./ui/functions --outdir ui/.wrangler

if [ -z "${CF_API_TOKEN-}" ] || [ -z "${ACCOUNT_ID-}" ] || [ -z "${PROJECT-}" ]; then
  echo "CF_API_TOKEN, ACCOUNT_ID, and PROJECT must be set in the environment to verify deployments." >&2
  exit 2
fi

echo "[2/5] Deploying ./ui to Pages (will include uncommitted changes)..."
set -x
npx wrangler@4.42.0 pages deploy ./ui --project-name="$PROJECT" --commit-dirty=true
DEPLOY_EXIT=$?
set +x
if [ $DEPLOY_EXIT -ne 0 ]; then
  echo "wrangler pages deploy failed (exit $DEPLOY_EXIT)." >&2
  exit $DEPLOY_EXIT
fi

echo "[3/5] Polling Pages deployments for uses_functions=true (will try up to 10 times)..."
TRY=0
MAX_TRIES=10
SLEEP=2
while [ $TRY -lt $MAX_TRIES ]; do
  DEP_JSON=$(curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT/deployments?per_page=1") || true

  ID=$(echo "$DEP_JSON" | jq -r '.result[0].id // empty')
  USES=$(echo "$DEP_JSON" | jq -r '.result[0].uses_functions // empty')

  if [ -n "$ID" ]; then
    echo "attempt $((TRY+1)): deployment id=$ID uses_functions=$USES"
  else
    echo "attempt $((TRY+1)): no deployment found yet"
  fi

  if [ "$USES" = "true" ]; then
    echo "✅ Deployment includes functions (uses_functions=true)."
    break
  fi

  TRY=$((TRY+1))
  sleep $SLEEP
done

if [ "$USES" != "true" ]; then
  echo "❌ Deployment does not include a Functions bundle (uses_functions=$USES). Printing full deployment JSON for diagnosis:" >&2
  echo "$DEP_JSON" | jq '.' >&2 || true
  exit 3
fi

echo "[4/5] Creating zip archive of the built bundle..."
ZIP_NAME="grassrootsmvt-functions-$(date +%Y%m%d%H%M%S).zip"
rm -f "$ZIP_NAME"
cd ui/.wrangler
zip -r "../../$ZIP_NAME" .
cd - >/dev/null
echo "Created $ZIP_NAME"

echo "[5/5] Showing archive details..."
ls -lh "$ZIP_NAME"

echo "Done. Zip: $ZIP_NAME"
exit 0
