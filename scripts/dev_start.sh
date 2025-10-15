#!/bin/bash

# Enhanced local development startup script with environment detection
set -e

# Environment configuration
export NODE_ENV=development
export ENVIRONMENT=local
export LOCAL_DEVELOPMENT=true
export DISABLE_AUTH=true

# Development ports
WORKER_PORT=8787
PAGES_PORT=8788

echo "🚀 Starting GrassrootsMVT local development environment..."
echo "   Environment: LOCAL DEVELOPMENT"
echo "   Authentication: BYPASSED"
echo "   Worker API: http://localhost:${WORKER_PORT}"
echo "   Pages UI: http://localhost:${PAGES_PORT}"
echo ""

# Function to kill existing processes on ports
kill_port() {
    local port=$1
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ ! -z "$pid" ]; then
        echo "🔄 Killing existing process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required commands
if ! command_exists "wrangler"; then
    echo "❌ Error: wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# Kill any existing processes on our development ports
kill_port $WORKER_PORT
kill_port $PAGES_PORT

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the Cloudflare Worker (API)
echo "🔧 Starting Worker API on port $WORKER_PORT..."
cd worker && \
    ENVIRONMENT=local \
    LOCAL_DEVELOPMENT=true \
    DISABLE_AUTH=true \
    wrangler dev \
        --env preview \
        --port $WORKER_PORT \
        --local \
        --persist-to .wrangler/state \
        > ../logs/worker-dev.log 2>&1 &
worker_pid=$!
echo $worker_pid > ../logs/worker-dev.pid
cd ..

# Wait for worker to start
sleep 3

# Test worker availability
echo "🧪 Testing Worker API..."
if curl -s http://localhost:$WORKER_PORT/api/ping > /dev/null; then
    echo "✅ Worker API is responding on port $WORKER_PORT"
else
    echo "⚠️  Worker API not yet responsive, continuing..."
fi

# Start the Cloudflare Pages (UI)
echo "🔧 Starting Pages UI on port $PAGES_PORT..."
cd ui && \
    ENVIRONMENT=local \
    LOCAL_DEVELOPMENT=true \
    wrangler pages dev . \
        --port $PAGES_PORT \
        --compatibility-date 2024-01-01 \
        --local \
        > ../logs/pages-dev.log 2>&1 &
pages_pid=$!
echo $pages_pid > ../logs/pages-dev.pid
cd ..

# Wait for pages to start
sleep 3

# Test pages availability
echo "🧪 Testing Pages UI..."
if curl -s http://localhost:$PAGES_PORT > /dev/null; then
    echo "✅ Pages UI is responding on port $PAGES_PORT"
else
    echo "⚠️  Pages UI not yet responsive, continuing..."
fi

echo ""
echo "🎉 Local development environment started!"
echo ""
echo "📍 Services:"
echo "   • Worker API: http://localhost:$WORKER_PORT"
echo "   • Pages UI:   http://localhost:$PAGES_PORT"
echo ""
echo "🔍 Quick Tests:"
echo "   • API Health:   curl http://localhost:$WORKER_PORT/api/ping"
echo "   • Auth Config:  curl http://localhost:$WORKER_PORT/auth/config"
echo "   • Who Am I:     curl http://localhost:$WORKER_PORT/api/whoami"
echo ""
echo "📋 Environment:"
echo "   • Environment: LOCAL DEVELOPMENT"
echo "   • Authentication: BYPASSED (no Cloudflare Access required)"
echo "   • API Client: Auto-detects localhost and bypasses auth"
echo "   • Worker: Environment-aware CORS and auth bypass"
echo ""
echo "📝 Logs:"
echo "   • Worker: tail -f logs/worker-dev.log"
echo "   • Pages:  tail -f logs/pages-dev.log"
echo ""
echo "🛑 To stop: npm run dev:stop"
echo ""

# Optional: Open browser to the application
if command_exists "open"; then
    echo "🌐 Opening browser to http://localhost:$PAGES_PORT"
    open http://localhost:$PAGES_PORT
elif command_exists "xdg-open"; then
    echo "🌐 Opening browser to http://localhost:$PAGES_PORT"
    xdg-open http://localhost:$PAGES_PORT
fi

# Keep script running and show live logs
echo "📡 Live logs (Ctrl+C to stop watching, services will continue running):"
echo ""
tail -f logs/worker-dev.log logs/pages-dev.log