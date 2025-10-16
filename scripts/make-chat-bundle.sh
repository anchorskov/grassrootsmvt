#!/bin/bash
set -euo pipefail

# make-chat-bundle.sh - Create a ZIP bundle for chat review
# POSIX-compliant bash script for macOS and Linux

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ZIP_NAME="chat-review-${TIMESTAMP}.zip"
STAGING_DIR="${REPO_ROOT}/.chat_bundle_tmp"

# Show usage
show_usage() {
    cat << 'EOF'
Usage: make-chat-bundle.sh [-h|--help]

Create a ZIP bundle containing specific project files for chat review.

Creates: chat-review-YYYYMMDD-HHMMSS.zip

The bundle includes:
- Core documentation files
- Environment configuration
- Worker source code
- UI source files and components
- Test files (if present)

Excludes system files, node_modules, and build output.
Validates all required files exist before creating the bundle.

Options:
  -h, --help    Show this help message

The script will fail if any required files are missing.
Optional files are included only if they exist.
EOF
}

# Check if help requested
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    show_usage
    exit 0
fi

# Check dependencies
if ! command -v zip >/dev/null 2>&1; then
    echo "Error: zip command not found. Please install zip:" >&2
    echo "  macOS: Already installed or 'brew install zip'" >&2
    echo "  Linux: apt-get install zip / yum install zip" >&2
    exit 1
fi

# Change to repo root
cd "$REPO_ROOT"

# Define required files (must exist)
REQUIRED_FILES=(
    "ui/config/environments.js"
    "worker/src/index.js"
    "ui/index.html"
    "ui/call.html"
    "ui/canvass/index.html"
    "ui/shared/streetAutocomplete.js"
    "ui/src/apiClient.js"
)

# Define optional files (include if present)
OPTIONAL_FILES=(
    "docs/ARCHITECTURE.md"
    "docs/API_CONTRACT.md"
    "docs/FRONTEND_RULES.md"
    "docs/CHANGELOG.md"
    "static/_headers"
    "worker/src/static-environments.js"
    "ui/contact.html"
    "ui/src/api-shim.js"
    "ui/auth-test.html"
    "ui/quick-test.html"
    "ui/final-test.html"
)

# Validate required files exist
echo "Validating required files..."
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Error: Required file missing: $file" >&2
        exit 1
    fi
done

# Clean up any existing staging directory
if [ -d "$STAGING_DIR" ]; then
    rm -rf "$STAGING_DIR"
fi

# Create staging directory
mkdir -p "$STAGING_DIR"

# Copy required files
echo "Copying required files..."
copied_files=()
for file in "${REQUIRED_FILES[@]}"; do
    target_dir="$STAGING_DIR/$(dirname "$file")"
    mkdir -p "$target_dir"
    cp "$file" "$target_dir/"
    copied_files+=("$file")
    echo "  ✓ $file"
done

# Copy optional files if they exist
echo "Copying optional files..."
for file in "${OPTIONAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        target_dir="$STAGING_DIR/$(dirname "$file")"
        mkdir -p "$target_dir"
        cp "$file" "$target_dir/"
        copied_files+=("$file")
        echo "  ✓ $file"
    else
        echo "  - $file (not present)"
    fi
done

# Get git commit SHA if available
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
    GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
else
    GIT_SHA="(no git)"
fi

# Create manifest
echo "Creating manifest..."
cat > "$STAGING_DIR/MANIFEST.txt" << EOF
Chat Review Bundle Manifest
===========================

Generated: $(date)
Git SHA: $GIT_SHA
Repository: $REPO_ROOT

Included Files:
$(printf '%s\n' "${copied_files[@]}" | sort)

Total files: ${#copied_files[@]}
EOF

# Create ZIP from staging directory
echo "Creating ZIP archive..."
cd "$STAGING_DIR"
zip -r "$ZIP_NAME" . \
    -x "*.DS_Store" \
    -x "*Thumbs.db" \
    -x "__MACOSX*" \
    >/dev/null

# Move ZIP to repo root and clean up
mv "$ZIP_NAME" "$REPO_ROOT/"
cd "$REPO_ROOT"
rm -rf "$STAGING_DIR"

# Success
echo "✅ Bundle created successfully: $REPO_ROOT/$ZIP_NAME"
echo "   Files included: ${#copied_files[@]}"
echo "   Size: $(du -h "$ZIP_NAME" | cut -f1)"