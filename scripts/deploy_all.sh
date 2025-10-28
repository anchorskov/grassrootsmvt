#!/usr/bin/env bash
set -e

# ============================================
# 🌐 GrassrootsMVT Full Production Deployment
# Works from ANY directory in the repo.
# ============================================

# --- Normalize path to project root ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Deploying GrassrootsMVT to PRODUCTION..."
echo "⚠️  WARNING: This will deploy to the live production environment!"
echo ""

# --- Validate directory context ---
if [[ ! -f "package.json" ]] || [[ ! -d "worker" ]] || [[ ! -d "ui" ]]; then
    echo "❌ Error: Must run from project root directory"
    echo "   Expected to find package.json, worker/, and ui/ here."
    echo "   Current:  $(pwd)"
    exit 1
fi

# --- Deploy Worker API ---
echo ""
echo "📦 Step 1: Deploying Worker API to PRODUCTION..."
cd worker
echo "   Using: npx wrangler deploy --env production"
npx wrangler deploy --env production
if [[ $? -eq 0 ]]; then
    echo "✅ Worker deployed successfully to PRODUCTION"
    echo "   Routes: volunteers.grassrootsmvt.org/api/*"
else
    echo "❌ Worker deployment failed"
    exit 1
fi

# --- Deploy UI (Pages) ---
echo ""
echo "🌐 Step 2: Deploying Pages UI to PRODUCTION..."
cd "$PROJECT_ROOT"
echo "   Using: npx wrangler pages deploy ./ui --project-name grassrootsmvt-production"
npx wrangler pages deploy ./ui --project-name grassrootsmvt-production --commit-dirty=true
if [[ $? -eq 0 ]]; then
    echo "✅ Pages deployed successfully to PRODUCTION"
    echo "   Domain: volunteers.grassrootsmvt.org"
else
    echo "❌ Pages deployment failed"
    exit 1
fi

# --- Verify Deployments ---
echo ""
echo "🔍 Step 3: Verifying PRODUCTION deployments..."

# Test API (expect 302 for Access, 401 or 200 for valid responses)
echo "Testing PRODUCTION API endpoint..."
API_URL="https://volunteers.grassrootsmvt.org/api/ping"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL")

case $API_STATUS in
  302)
    echo "✅ Cloudflare Access gate active (302 redirect to login)"
    ;;
  401)
    echo "✅ API reachable (401 - Unauthorized as expected)"
    ;;
  200)
    echo "✅ API reachable (200 OK)"
    ;;
  *)
    echo "⚠️  Unexpected API response from $API_URL: $API_STATUS"
    ;;
esac

# Test config endpoint
echo "Testing public config endpoint..."
CONFIG_URL="https://volunteers.grassrootsmvt.org/api/auth/config"
CONFIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONFIG_URL")
if [[ "$CONFIG_STATUS" == "200" ]]; then
    echo "✅ Public config endpoint responding (200)"
else
    echo "⚠️  Public config endpoint returned status: $CONFIG_STATUS"
fi

# Test UI (should return 200)
echo "Testing PRODUCTION Pages..."
PAGES_URL="https://volunteers.grassrootsmvt.org"
PAGES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PAGES_URL")
if [[ "$PAGES_STATUS" == "200" ]]; then
    echo "✅ PRODUCTION Pages responding (200)"
else
    echo "⚠️  PRODUCTION Pages returned status: $PAGES_STATUS"
fi

# --- Summary ---
echo ""
echo "🎉 PRODUCTION Deployment Complete!"
echo ""
echo "🔗 PRODUCTION URLs:"
echo "   UI:        https://volunteers.grassrootsmvt.org"
echo "   API:       https://volunteers.grassrootsmvt.org/api"
echo "   Config:    https://volunteers.grassrootsmvt.org/api/auth/config"
echo "   Diagnostics: https://volunteers.grassrootsmvt.org/diagnostics.html"
echo ""
echo "🧪 Test the Ultra-Clean Access Flow:"
echo "   1️⃣ Visit: https://volunteers.grassrootsmvt.org"
echo "   2️⃣ Should redirect to Cloudflare Access login"
echo "   3️⃣ Authenticate"
echo "   4️⃣ Return to authenticated UI"
echo ""
echo "🔍 Monitoring:"
echo "   • Logs: npx wrangler tail --env production"
echo "   • Diagnostics: /diagnostics.html"
echo "   • Verify no AUD-in-path URLs"
echo ""
