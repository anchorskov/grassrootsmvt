#!/bin/bash

set -e

WORKER_PORT=8787
PID_FILE="logs/worker-dev.pid"

echo "Stopping GrassrootsMVT local development environment..."

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "Stopping Worker process from $PID_FILE (PID: $PID)"
    kill "$PID" 2>/dev/null || true
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      echo "Worker process still running; forcing stop (PID: $PID)"
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
  REMAINING_PIDS="$(lsof -ti:$WORKER_PORT 2>/dev/null || true)"
  if [ -n "$REMAINING_PIDS" ]; then
    echo "Port $WORKER_PORT still occupied; forcing stop (PID: $REMAINING_PIDS)"
    kill -9 $REMAINING_PIDS 2>/dev/null || true
  fi
fi

echo "Local development environment stopped."
