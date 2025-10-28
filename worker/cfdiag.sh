#!/usr/bin/env bash
# ====================================================
# 🌩️ cfdiag.sh — Cloudflare Deployment Diagnostics
# ====================================================
# Verifies Wrangler + Cloudflare environment setup for
# grassrootsmvt-api backend (D1 + Worker routes)
#
# Run:   bash cfdiag.sh [env]
# Example: bash cfdiag.sh production
# ====================================================

set -euo pipefail
ENVIRONMENT="${1:-production}"

echo "🔍 Running Cloudflare Diagnostics for environment: $ENVIRONMENT"
echo "───────────────────────────────────────────────"

# 1️⃣ Confirm Wrangler installation
echo "🧩 Checking Wrangler installation..."
if ! command -v npx &>/dev/null; then
  echo "❌ npx not found — install Node.js >=18"
  exit 1
fi
if ! npx wrangler --version &>/dev/null; then
  echo "❌ Wrangler not found — install with: npm install -g wrangler"
  exit 1
fi
echo "✅ Wrangler available: $(npx wrangler --version)"

# 2️⃣ Verify wrangler.toml
if [ ! -f wrangler.toml ]; then
  echo "❌ wrangler.toml not found in $(pwd)"
  exit 1
fi
echo "✅ Found wrangler.toml"

# 3️⃣ Extract key info
WORKER_NAME=$(grep -E '^name\s*=' wrangler.toml | head -1 | cut -d'"' -f2)
ACCOUNT_ID=$(grep -E '^account_id\s*=' wrangler.toml | cut -d'"' -f2)
ROUTE_PATTERN=$(grep -E 'pattern\s*=' wrangler.toml | cut -d'"' -f2 | head -1)

echo "📄 Worker Name:      $WORKER_NAME"
echo "🪪 Account ID:       $ACCOUNT_ID"
echo "🌐 Route Pattern:    $ROUTE_PATTERN"

# 4️⃣ List deployments
echo "🔎 Checking deployed Workers..."
npx wrangler deployments list --env "$ENVIRONMENT" || echo "⚠️ Could not list deployments — check login."

# 5️⃣ Verify active route mapping via dry-run (since routes list was removed)
echo "🌍 Checking route mapping via dry-run..."
npx wrangler deploy --dry-run --env "$ENVIRONMENT" || echo "⚠️ Dry-run route check failed."

# 6️⃣ D1 binding check
echo "🧱 Checking D1 bindings..."
if grep -q '\[\[d1_databases\]\]' wrangler.toml; then
  DB_BINDING=$(grep -A3 '\[\[d1_databases\]\]' wrangler.toml | grep 'database_name' | cut -d'"' -f2 | head -1)
  echo "✅ D1 binding found: $DB_BINDING"
else
  echo "❌ No D1 binding found in wrangler.toml"
fi

# 7️⃣ Test /api/streets endpoint
API_BASE=$(grep -E 'ALLOW_ORIGIN_DEV' wrangler.toml | cut -d'"' -f2 | cut -d',' -f1)
API_TEST="${API_BASE:-https://volunteers.grassrootsmvt.org}/api/streets"
echo "🧪 Testing API endpoint: $API_TEST"
curl -s -o /dev/null -w "➡️ HTTP %{http_code}\n" -X POST "$API_TEST" \
  -H 'Content-Type: application/json' \
  -d '{"county":"NATRONA","city":"CASPER"}' || echo "⚠️ API test failed."

# 8️⃣ Detect Pages collisions
echo "🧱 Checking for overlapping Pages deployments..."
npx wrangler deployments list | grep grassrootsmvt-production && \
  echo "⚠️ Pages deployment detected — ensure Worker name differs (grassrootsmvt-api)" || \
  echo "✅ No conflicting Pages project found."

echo "✅ Diagnostics complete."
echo "───────────────────────────────────────────────"
echo "Tip: run 'npx wrangler tail --name $WORKER_NAME --env $ENVIRONMENT --filter api/streets' to watch live logs."
