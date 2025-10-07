#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT_DIR"

echo "🔍 Checking required files..."

MISSING=0
if [[ -f ".env" ]]; then
  echo "✅ .env found"
else
  echo "❌ .env not found in repo root: $ROOT_DIR/.env"
  MISSING=1
fi

if [[ -f "ui/wrangler.toml" ]]; then
  echo "✅ ui/wrangler.toml found"
else
  echo "❌ ui/wrangler.toml not found: $ROOT_DIR/ui/wrangler.toml"
  MISSING=1
fi

if [[ $MISSING -ne 0 ]]; then
  echo "⚠️ Preflight failed — please add the missing files and retry."
  exit 1
fi

echo "🚀 Ready to deploy from ui/"
exit 0
