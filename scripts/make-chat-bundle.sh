#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/make-chat-bundle.sh
# Creates chat-review-YYYYMMDD-HHMMSS.zip with only the listed files.

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="chat-review-${STAMP}.zip"
STAGE=".chat_bundle_tmp"

required_files=(
  "ui/config/environments.js"
  "worker/src/index.js"
  "ui/src/apiClient.js"
  "ui/call.html"
  "ui/canvass/index.html"
  "ui/shared/streetAutocomplete.js"
)

optional_files=(
  "static/_headers"
  "worker/src/static-environments.js"
  "ui/contact.html"
  "ui/src/api-shim.js"
  "ui/auth-test.html"
  "ui/quick-test.html"
  "ui/final-test.html"
  "docs/ARCHITECTURE.md"
  "docs/API_CONTRACT.md"
  "docs/FRONTEND_RULES.md"
  "docs/CHANGELOG.md"
)

# Prereqs
command -v zip >/dev/null 2>&1 || { echo "zip not found. Install it and retry."; exit 1; }

# Validate required
missing=0
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: required file missing: $f"
    missing=1
  fi
done
[[ $missing -eq 1 ]] && exit 1

# Stage
rm -rf "$STAGE"
mkdir -p "$STAGE"

copy_in() {
  local src="$1"
  local dst="$STAGE/$1"
  mkdir -p "$(dirname "$dst")"
  cp -f "$src" "$dst"
}

# Copy required
for f in "${required_files[@]}"; do
  copy_in "$f"
done

# Copy optional if present
for f in "${optional_files[@]}"; do
  [[ -f "$f" ]] && copy_in "$f"
done

# Manifest
{
  echo "MANIFEST for $OUT"
  echo "Timestamp: $(date -Iseconds)"
  if command -v git >/dev/null 2>&1; then
    sha=$(git rev-parse --short HEAD 2>/dev/null || true)
    echo "Git SHA: ${sha:-'(no git)'}"
  else
    echo "Git SHA: (git not installed)"
  fi
  echo "Repo: $(pwd)"
  echo
  echo "Included files:"
  (cd "$STAGE" && find . -type f | sed 's#^\./##' | sort)
} > "$STAGE/MANIFEST.txt"

# Zip (exclude junk)
(
  cd "$STAGE"
  zip -qr "../$OUT" . -x "*.DS_Store" -x "*Thumbs.db" -x "__MACOSX*"
)

# Cleanup
rm -rf "$STAGE"

echo "Created: ./$OUT"