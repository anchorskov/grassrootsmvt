#!/bin/bash

# Test browser compatibility for fixed module loading
echo "Testing browser compatibility after module loading fixes..."

# Function to check if a process is running on a port
check_port() {
    netstat -tuln | grep ":$1 " > /dev/null
    return $?
}

# Check if workers are running
if ! check_port 8787; then
    echo "❌ Worker not running on port 8787"
    echo "Please start the worker with: cd worker && npm run dev"
    exit 1
fi

if ! check_port 8788; then
    echo "❌ UI dev server not running on port 8788"
    echo "Please start the UI dev server with: cd ui && npx wrangler pages dev . --port 8788"
    exit 1
fi

echo "✅ Both servers are running"

# Test API endpoints directly
echo ""
echo "Testing API endpoints..."

# Test ping endpoint
echo "Testing /ping endpoint..."
curl -s -w "\nStatus: %{http_code}\n" http://localhost:8787/ping | head -3

# Test voters endpoint
echo ""
echo "Testing /voters endpoint..."
curl -s -w "\nStatus: %{http_code}\n" http://localhost:8787/voters | head -3

echo ""
echo "🎉 Browser compatibility test complete!"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:8788/call.html in your browser"
echo "2. Check browser console for any remaining JavaScript errors"
echo "3. Test the 'Get Next' button functionality"
echo "4. Open http://localhost:8788/canvass/ to test canvassing interface"
echo "5. Verify environment detection is working (check console logs)"
echo ""
echo "Expected behavior:"
echo "- No 'Cannot use import statement outside a module' errors"
echo "- No 'apiFetch is not a function' errors"
echo "- Console should show '[ENV-LOCAL]' debug messages"
echo "- API calls should go to http://localhost:8787"