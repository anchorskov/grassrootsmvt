#!/usr/bin/env bash
set -e

echo "🚀 Deploying GrassrootsMVT to PRODUCTION..."
echo "⚠️  WARNING: This will deploy to live production environment!"
echo ""

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "worker" ]] || [[ ! -d "ui" ]]; then
    echo "❌ Error: Must run from project root directory"
    echo "   Expected: /home/anchor/projects/grassrootsmvt"
    echo "   Current:  $(pwd)"
    exit 1
fi

echo ""
echo "📦 Step 1: Deploying Worker API to PRODUCTION..."
cd worker
echo "   Using: npx wrangler deploy --env production"
npx wrangler deploy --env production
if [[ $? -eq 0 ]]; then
    echo "✅ Worker deployed successfully to PRODUCTION"
    echo "   Routes: api.grassrootsmvt.org/* and grassrootsmvt.org/api/*"
else
    echo "❌ Worker deployment failed"
    exit 1
fi

echo ""
echo "🌐 Step 2: Deploying Pages UI to PRODUCTION..."
cd ..
echo "   Using: npx wrangler pages deploy ./ui --project-name grassrootsmvt-production"
npx wrangler pages deploy ./ui --project-name grassrootsmvt-production --commit-dirty=true
if [[ $? -eq 0 ]]; then
    echo "✅ Pages deployed successfully to PRODUCTION"
    echo "   Domain: volunteers.grassrootsmvt.org"
else
    echo "❌ Pages deployment failed"
    exit 1
fi

echo ""
echo "🔍 Step 3: Verifying PRODUCTION deployments..."

# Test API endpoint (should get 302 redirect to Cloudflare Access)
echo "Testing PRODUCTION API endpoint..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.grassrootsmvt.org/api/ping)
if [[ "$API_STATUS" == "302" ]]; then
    echo "✅ PRODUCTION API endpoint responding (302 - Cloudflare Access protected)"
elif [[ "$API_STATUS" == "200" ]]; then
    echo "✅ PRODUCTION API endpoint responding (200 - authenticated)"
else
    echo "⚠️  PRODUCTION API endpoint returned status: $API_STATUS"
fi

# Test public config endpoint (should be 200)
echo "Testing public config endpoint..."
CONFIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.grassrootsmvt.org/auth/config)
if [[ "$CONFIG_STATUS" == "200" ]]; then
    echo "✅ Public config endpoint responding (200)"
else
    echo "⚠️  Public config endpoint returned status: $CONFIG_STATUS"
fi

# Test Pages
echo "Testing PRODUCTION Pages..."
PAGES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://volunteers.grassrootsmvt.org)
if [[ "$PAGES_STATUS" == "200" ]]; then
    echo "✅ PRODUCTION Pages responding (200)"
else
    echo "⚠️  PRODUCTION Pages returned status: $PAGES_STATUS"
fi

echo ""
echo "🎉 PRODUCTION Deployment Complete!"
echo ""
echo "🔗 PRODUCTION URLs:"
echo "   UI:  https://volunteers.grassrootsmvt.org"
echo "   API: https://api.grassrootsmvt.org"
echo "   Config: https://api.grassrootsmvt.org/auth/config"
echo "   Diagnostics: https://volunteers.grassrootsmvt.org/diagnostics.html"
echo ""
echo "🧪 Test the Ultra-Clean Access Flow:"
echo "   1. Visit: https://volunteers.grassrootsmvt.org"
echo "   2. Should redirect to connecting page"
echo "   3. Cloudflare Access login (NO MORE 404s!)"
echo "   4. Return to authenticated UI"
echo ""
echo "🔍 Monitoring:"
echo "   • Check Worker logs in Cloudflare Dashboard"
echo "   • Monitor /diagnostics.html for error tracking"
echo "   • Verify no AUD-in-path URLs in network tab"
echo ""