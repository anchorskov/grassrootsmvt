#!/usr/bin/env bash
set -euo pipefail

missing=0
for v in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  if [ -z "${!v-}" ]; then
    echo "⚠️  Missing environment variable: $v"
    missing=1
  else
    echo "✅ $v present"
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "\nPlease set the required environment variables. In CI, use repository secrets. For local testing, create a .env file and export it." >&2
  exit 1
fi

echo "All required env vars present."
