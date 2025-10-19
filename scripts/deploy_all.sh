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
echo "   CRITICAL: This deploys with ENVIRONMENT=production for real Cloudflare Access auth"
npx wrangler deploy --env production
if [[ $? -eq 0 ]]; then
    echo "✅ Worker deployed successfully to PRODUCTION"
    echo "   Routes: grassrootsmvt.org/api/* and volunteers.grassrootsmvt.org/api/*"
else
    echo "❌ Worker deployment failed"
    exit 1
fi

echo ""
echo "🌐 Step 2: Pages UI (optional) ..."
cd ..
if [[ "$1" == "--with-pages" ]]; then
  echo "   Using: npx wrangler pages deploy ./ui --project-name grassrootsmvt-production"
  npx wrangler pages deploy ./ui --project-name grassrootsmvt-production --commit-dirty=true
  if [[ $? -eq 0 ]]; then
      echo "✅ Pages deployed successfully to PRODUCTION"
      echo "   Domain: volunteers.grassrootsmvt.org"
  else
      echo "❌ Pages deployment failed"
      exit 1
  fi
else
  echo "   Skipping Pages deploy (pass --with-pages to deploy the UI)."
fi

echo ""
echo "🔍 Step 3: Verifying PRODUCTION deployments..."

# Test Worker API endpoints
echo "Testing Worker API endpoints..."

# Test primary API endpoint (grassrootsmvt.org - known working)
echo "  Testing grassrootsmvt.org API..."
API1_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 10 https://grassrootsmvt.org/api/whoami)
if [[ "$API1_STATUS" == "302" ]]; then
    echo "  ✅ grassrootsmvt.org API responding (302 - Cloudflare Access protected)"
elif [[ "$API1_STATUS" == "401" ]]; then
    echo "  ✅ grassrootsmvt.org API responding (401 - authentication required)"
else
    echo "  ⚠️  grassrootsmvt.org API returned status: $API1_STATUS"
fi

# Test volunteers subdomain (may have DNS issues)
echo "  Testing volunteers.grassrootsmvt.org API..."
API2_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 10 --connect-timeout 5 https://volunteers.grassrootsmvt.org/api/whoami 2>/dev/null)
if [[ "$API2_STATUS" == "302" ]]; then
    echo "  ✅ volunteers.grassrootsmvt.org API responding (302 - Cloudflare Access protected)"
elif [[ "$API2_STATUS" == "401" ]]; then
    echo "  ✅ volunteers.grassrootsmvt.org API responding (401 - authentication required)"  
elif [[ "$API2_STATUS" == "000" ]] || [[ -z "$API2_STATUS" ]]; then
    echo "  ⚠️  volunteers.grassrootsmvt.org - DNS/connection issue (custom domain may need setup)"
else
    echo "  ⚠️  volunteers.grassrootsmvt.org API returned status: $API2_STATUS"
fi

# Test Pages deployments
echo "Testing PRODUCTION Pages..."

# Get the latest deployment URL from the output or use a known working one
echo "  Testing custom domain (volunteers.grassrootsmvt.org)..."
PAGES_CUSTOM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 10 --connect-timeout 5 https://volunteers.grassrootsmvt.org 2>/dev/null)
if [[ "$PAGES_CUSTOM_STATUS" == "200" ]]; then
    echo "  ✅ Custom domain responding (200)"
elif [[ "$PAGES_CUSTOM_STATUS" == "000" ]] || [[ -z "$PAGES_CUSTOM_STATUS" ]]; then
    echo "  ⚠️  Custom domain - DNS/connection issue (may need domain setup)"
    
    # Fallback to pages.dev URL
    echo "  Testing fallback pages.dev URL..."
    # Extract deployment ID from recent deploy or use a known working one
    PAGES_DEV_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 10 https://grassrootsmvt-production.pages.dev)
    if [[ "$PAGES_DEV_STATUS" == "200" ]]; then
        echo "  ✅ Pages.dev deployment responding (200) - deployment successful"
    else
        echo "  ⚠️  Pages.dev deployment returned status: $PAGES_DEV_STATUS"
    fi
else
    echo "  ⚠️  Custom domain returned status: $PAGES_CUSTOM_STATUS"
fi

echo ""
echo "🎉 PRODUCTION Deployment Complete!"
echo ""
echo "🔗 PRODUCTION URLs:"
echo "   UI (Custom):  https://volunteers.grassrootsmvt.org (may need DNS setup)"
echo "   UI (Backup):  https://grassrootsmvt-production.pages.dev"
echo "   API (Primary): https://grassrootsmvt.org/api/*"
echo "   API (Volunteers): https://volunteers.grassrootsmvt.org/api/* (if DNS configured)"
echo ""
echo "🧪 Test the Authentication Flow:"
echo "   1. Visit: https://grassrootsmvt-production.pages.dev (always works)"
echo "      OR:    https://volunteers.grassrootsmvt.org (if custom domain configured)"
echo "   2. Should redirect to Cloudflare Access login"  
echo "   3. Complete authentication with your email (NOT dev@localhost)"
echo "   4. Return to authenticated UI with real email displayed"
echo "   5. Verify sign-out button works correctly"
echo ""
echo "� Important Notes:"
echo "   • If volunteers.grassrootsmvt.org shows DNS errors, configure custom domain in:"
echo "     Cloudflare Dashboard > Pages > grassrootsmvt-production > Custom domains"
echo "   • Worker routes are deployed to both grassrootsmvt.org and volunteers.grassrootsmvt.org"
echo "   • ENVIRONMENT=production ensures real Cloudflare Access authentication"
echo ""
echo "�🔍 Monitoring:"
echo "   • Check Worker logs in Cloudflare Dashboard"  
echo "   • Verify real email displayed (not dev@localhost)"
echo "   • Test call.html and canvass/index.html pages"
echo "   • Ensure no authentication loops occur"
echo ""