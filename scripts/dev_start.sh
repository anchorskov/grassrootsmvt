#!/bin/bash

# Enhanced local development startup script with environment detection
set -e

# Environment configuration
export NODE_ENV=development
export ENVIRONMENT=local
export LOCAL_DEVELOPMENT=true
export DISABLE_AUTH=true

# Development port
WORKER_PORT=8787

echo "🚀 Starting GrassrootsMVT local development environment..."
echo "   Environment: LOCAL DEVELOPMENT"
echo "   Authentication: BYPASSED"
echo "   Worker API: http://localhost:${WORKER_PORT}"
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

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the unified Worker (serves UI + API)
echo "🔧 Starting Worker (UI + API) on port $WORKER_PORT..."
cd worker && \
    ENVIRONMENT=local \
    LOCAL_DEVELOPMENT=true \
    DISABLE_AUTH=true \
    npx wrangler dev \
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
echo "✅ Worker is responding on port $WORKER_PORT"
else
    echo "⚠️  Worker API not yet responsive, continuing..."
fi

echo ""
echo "🎉 Local development environment started!"
echo ""
echo "📍 Service:"
echo "   • Unified Worker: http://localhost:$WORKER_PORT"
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
echo ""
echo "🛑 To stop: npm run dev:stop"
echo ""

# Optional: Open browser to the application
if command_exists "open"; then
    echo "🌐 Opening browser to http://localhost:$WORKER_PORT"
    open http://localhost:$WORKER_PORT
elif command_exists "xdg-open"; then
    echo "🌐 Opening browser to http://localhost:$WORKER_PORT"
    xdg-open http://localhost:$WORKER_PORT
fi

# Keep script running and show live logs
echo "📡 Live logs (Ctrl+C to stop watching, service will continue running):"
echo ""
tail -f logs/worker-dev.log
