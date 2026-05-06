#!/bin/bash

# Resolve project root regardless of where the script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

WORKER_PORT=8787
PID_FILE="logs/worker-dev.pid"

echo "Stopping GrassrootsMVT local development environment..."

if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Stopping worker process (PID: $PID)"
        kill "$PID" 2>/dev/null || true
        sleep 1
        if kill -0 "$PID" 2>/dev/null; then
            echo "Process still running — forcing kill (PID: $PID)"
            kill -9 "$PID" 2>/dev/null || true
        fi
    fi
    rm -f "$PID_FILE"
fi

PORT_PIDS="$(lsof -ti:$WORKER_PORT 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
    echo "Clearing port $WORKER_PORT (PID: $PORT_PIDS)"
    kill $PORT_PIDS 2>/dev/null || true
    sleep 1
    REMAINING="$(lsof -ti:$WORKER_PORT 2>/dev/null || true)"
    if [ -n "$REMAINING" ]; then
        kill -9 $REMAINING 2>/dev/null || true
    fi
fi

echo "Stopped."
