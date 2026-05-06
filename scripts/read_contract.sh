#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_FILE="$ROOT_DIR/AI_CONTRACT.md"

if [[ ! -f "$CONTRACT_FILE" ]]; then
  echo "AI contract not found at $CONTRACT_FILE" >&2
  exit 1
fi

echo "== AI CONTRACT =="
cat "$CONTRACT_FILE"
