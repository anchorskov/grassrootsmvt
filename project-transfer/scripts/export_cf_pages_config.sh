#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="grassrootsmvt"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR="exports"
OUT_FILE="$OUT_DIR/${PROJECT_NAME}-config-$STAMP.json"

echo "Exporting Cloudflare Pages project config for project: $PROJECT_NAME"

if [ -z "${CF_API_TOKEN-}" ] || [ -z "${ACCOUNT_ID-}" ] || [ -z "${PROJECT-}" ]; then
  echo "CF_API_TOKEN, ACCOUNT_ID, and PROJECT must be set in the environment." >&2
  exit 2
fi

mkdir -p "$OUT_DIR"

URL="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT"
echo "Fetching project JSON from Cloudflare API..."

HTTP_BODY=$(mktemp)

status_code=0
if ! status_code=$(curl -sS -w "%{http_code}" -H "Authorization: Bearer $CF_API_TOKEN" "$URL" -o "$HTTP_BODY"); then
  echo "Failed to fetch project JSON from Cloudflare." >&2
  rm -f "$HTTP_BODY"
  exit 3
fi

if [ "$status_code" -lt 200 ] || [ "$status_code" -ge 300 ]; then
  echo "Cloudflare API returned HTTP $status_code" >&2
  cat "$HTTP_BODY" >&2
  rm -f "$HTTP_BODY"
  exit 4
fi

# Save full JSON to file
mv "$HTTP_BODY" "$OUT_FILE"
echo "Saved full project JSON to: $OUT_FILE"

echo
echo "Summary of extracted fields:" 
jq '(.result // .) | {
  name: .name,
  subdomain: .subdomain,
  domains: .domains,
  production_script_name: .production_script_name,
  preview_script_name: .preview_script_name,
  env_vars: (if (.deployment_configs.production.env_vars != null) then .deployment_configs.production.env_vars else .env_vars end),
  deployment_configs: .deployment_configs,
  build_config: .build_config,
  framework: .framework,
  compatibility_date: .compatibility_date,
  compatibility_flags: .compatibility_flags
}' "$OUT_FILE"

echo
echo "Done. Export file: $OUT_FILE"
exit 0
