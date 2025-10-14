#!/bin/bash
set -e

echo "🚀 Starting GrassrootsMVT Worker Deployment"

# Store original directory
ORIGINAL_DIR=$(pwd)
PROJECT_ROOT="/home/anchor/projects/grassrootsmvt"

# Navigate to project root if not already there
if [ "$(basename "$PWD")" != "grassrootsmvt" ]; then
    echo "📁 Navigating to project root: $PROJECT_ROOT"
    cd "$PROJECT_ROOT"
fi

# Navigate to worker directory
if [ -d "worker" ]; then
    echo "📁 Entering worker directory..."
    cd worker
else
    echo "❌ ERROR: Worker directory not found!"
    echo "Please run this script from the GrassrootsMVT project root."
    exit 1
fi

# Verify the entrypoint exists
if [ ! -f "src/index.js" ]; then
    echo "❌ ERROR: Worker entrypoint src/index.js not found!"
    echo "Current directory: $(pwd)"
    echo "Files in src/: $(ls -la src/ 2>/dev/null || echo 'src/ directory not found')"
    echo "Please verify your wrangler.toml configuration or ensure the Worker code is in the correct location."
    exit 1
fi

echo "✅ Entrypoint found: src/index.js"
echo "📄 Worker directory: $(pwd)"

# Verify wrangler.toml exists and is configured
if [ ! -f "wrangler.toml" ]; then
    echo "❌ ERROR: wrangler.toml not found!"
    exit 1
fi

echo "✅ Configuration found: wrangler.toml"

# Check if production environment is configured
if ! grep -q "\[env\.production\]" wrangler.toml; then
    echo "⚠️  WARNING: No [env.production] section found in wrangler.toml"
    echo "Deploying to default environment..."
    npx wrangler deploy 2>&1 | tee deploy_output.tmp
else
    echo "✅ Production environment configured"
    echo "🚀 Deploying to production environment..."
    npx wrangler deploy --env production 2>&1 | tee deploy_output.tmp
fi

# Check if deployment was successful (worker uploaded even if routes conflict)
if grep -q "Uploaded.*grassrootsmvt-production" deploy_output.tmp; then
    if grep -q "already assigned to routes" deploy_output.tmp; then
        echo ""
        echo "✅ Worker code updated successfully!"
        echo "⚠️  Routes already assigned to this worker (this is expected for updates)"
        DEPLOYMENT_SUCCESS=true
    else
        echo ""
        echo "🎉 Worker deployment completed successfully!"
        DEPLOYMENT_SUCCESS=true
    fi
else
    echo ""
    echo "❌ Deployment failed! Worker code was not uploaded."
    DEPLOYMENT_SUCCESS=false
fi

# Clean up temporary file
rm -f deploy_output.tmp

# Continue with verification if deployment was successful
if [ "$DEPLOYMENT_SUCCESS" = true ]; then
    echo ""
    echo "🎉 Worker deployment completed successfully!"
    echo ""
    
    # Show deployment information
    echo "📊 Checking deployment status..."
    npx wrangler deployments list --env production | head -10
    
    echo ""
    echo "🌐 Testing production endpoints:"
    echo "   • https://api.grassrootsmvt.org/ping"
    echo "   • https://grassrootsmvt.org/api/ping"
    echo ""
    echo "🔐 Note: All endpoints are protected by Cloudflare Access"
    echo "   You'll need to authenticate to test them in a browser"
    
    # Return to original directory
    cd "$ORIGINAL_DIR"
    echo "✅ Deploy script completed successfully!"
else
    echo "❌ Deployment failed! Check the error messages above."
    cd "$ORIGINAL_DIR"
    exit 1
fi