#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../ui/grassrootsmvt-functions"
echo "🚀 Deploying Cloudflare Worker..."
npx wrangler deploy
sleep 2
echo "✅ Checking health..."
sleep 3
curl -fsS https://grassrootsmvt-functions.anchorskov.workers.dev/api/ping && echo "✅ Worker is live"
