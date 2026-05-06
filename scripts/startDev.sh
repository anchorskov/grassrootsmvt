#!/bin/bash

set -e

# Resolve project root regardless of where the script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

export NODE_ENV=development
export ENVIRONMENT=local
export LOCAL_DEVELOPMENT=true
export DISABLE_AUTH=true

WORKER_PORT=8787

echo "Starting GrassrootsMVT local development environment..."
echo "  Environment : LOCAL"
echo "  Auth        : BYPASSED"
echo "  Worker URL  : http://localhost:${WORKER_PORT}"
echo ""

kill_port() {
    local port=$1
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "Killing existing process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
}

if ! command -v wrangler >/dev/null 2>&1; then
    echo "Error: wrangler not found. Run: npm install -g wrangler"
    exit 1
fi

kill_port $WORKER_PORT

mkdir -p logs

echo "Starting Worker (UI + API) on port $WORKER_PORT..."
(
  cd "$PROJECT_ROOT/worker"
  ENVIRONMENT=local \
  LOCAL_DEVELOPMENT=true \
  DISABLE_AUTH=true \
  npx wrangler dev \
      --env preview \
      --port $WORKER_PORT \
      --local \
      --persist-to .wrangler/state \
      > "$PROJECT_ROOT/logs/worker-dev.log" 2>&1
) &
worker_pid=$!
echo $worker_pid > logs/worker-dev.pid

sleep 3

if curl -s http://localhost:$WORKER_PORT/api/ping > /dev/null; then
    echo "Worker is responding on port $WORKER_PORT"
else
    echo "Worker not yet responsive — check logs/worker-dev.log if it fails to start"
fi

echo ""
echo "Development environment ready"
echo ""
echo "  App        : http://localhost:$WORKER_PORT"
echo "  Ping       : curl http://localhost:$WORKER_PORT/api/ping"
echo "  Whoami     : curl http://localhost:$WORKER_PORT/api/whoami"
echo "  Logs       : tail -f $PROJECT_ROOT/logs/worker-dev.log"
echo "  Stop       : npm run stop"
echo ""

if [ "${OPEN_BROWSER:-0}" = "1" ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://localhost:$WORKER_PORT
    elif command -v open >/dev/null 2>&1; then
        open http://localhost:$WORKER_PORT
    fi
fi

echo "Live logs (Ctrl+C stops watching; server keeps running):"
echo ""
tail -f "$PROJECT_ROOT/logs/worker-dev.log"
