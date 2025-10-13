#!/usr/bin/env bash
set -e

echo "🚀 Deploying GrassrootsMVT API + UI..."

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "worker" ]] || [[ ! -d "ui" ]]; then
    echo "❌ Error: Must run from project root directory"
    echo "   Expected: /home/anchor/projects/grassrootsmvt"
    echo "   Current:  $(pwd)"
    exit 1
fi

echo ""
echo "📦 Step 1: Deploying Worker API..."
cd worker
npx wrangler deploy --env production
if [[ $? -eq 0 ]]; then
    echo "✅ Worker deployed successfully"
else
    echo "❌ Worker deployment failed"
    exit 1
fi

echo ""
echo "🌐 Step 2: Deploying Pages UI..."
cd ../ui
npx wrangler pages deploy . --project-name grassrootsmvt-production --commit-dirty=true
if [[ $? -eq 0 ]]; then
    echo "✅ Pages deployed successfully"
else
    echo "❌ Pages deployment failed"
    exit 1
fi

echo ""
echo "🔍 Step 3: Verifying deployments..."
cd ..

# Test API endpoint (should get 302 redirect to Cloudflare Access)
echo "Testing API endpoint..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.grassrootsmvt.org/api/ping)
if [[ "$API_STATUS" == "302" ]]; then
    echo "✅ API endpoint responding (302 - Cloudflare Access protected)"
else
    echo "⚠️  API endpoint returned status: $API_STATUS"
fi

# Get the latest Pages deployment URL
echo "Getting Pages deployment URL..."
PAGES_URL=$(npx wrangler pages project list | grep "grassrootsmvt-production" | awk '{print $3}')
if [[ -n "$PAGES_URL" ]]; then
    echo "✅ Pages URL: https://$PAGES_URL"
else
    echo "⚠️  Could not determine Pages URL, using default"
    PAGES_URL="grassrootsmvt-production.pages.dev"
fi

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "🔗 Production URLs:"
echo "   UI:  https://$PAGES_URL"
echo "   API: https://api.grassrootsmvt.org"
echo ""
echo "🧪 Test URLs:"
echo "   Auth Test: https://$PAGES_URL/auth-test.html"
echo "   Main Page: https://$PAGES_URL/index.html"
echo "   Call Page: https://$PAGES_URL/call.html"
echo ""
echo "📋 Next Steps:"
echo "   1. Visit the auth test page to verify JWT authentication"
echo "   2. Test API calls through the browser interface"
echo "   3. Verify offline queueing by disabling network"
echo "   4. Check console for authentication status logs"
echo ""