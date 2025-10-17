#!/usr/bin/env bash
set -euo pipefail

# Create chat review zip for sharing with AI assistants
# Includes key files needed for understanding the project structure and current state

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_NAME="chat-review-${TIMESTAMP}.zip"
TEMP_DIR="temp_chat_review_${TIMESTAMP}"

echo "Creating chat review package: ${ZIP_NAME}"

# Create temporary directory
mkdir -p "$TEMP_DIR"

echo "Copying essential project files..."

# Core configuration and documentation
cp README.md "$TEMP_DIR/" 2>/dev/null || echo "No README.md found"
cp package.json "$TEMP_DIR/" 2>/dev/null || echo "No package.json found"
cp .gitignore "$TEMP_DIR/" 2>/dev/null || echo "No .gitignore found"
cp DOCS_INDEX.md "$TEMP_DIR/" 2>/dev/null || echo "No DOCS_INDEX.md found"
cp docs_contents_summary.md "$TEMP_DIR/" 2>/dev/null || echo "No docs_contents_summary.md found"

# Environment and configuration
mkdir -p "$TEMP_DIR/config"
cp -r config/* "$TEMP_DIR/config/" 2>/dev/null || echo "No config files found"

# Database schema and queries
mkdir -p "$TEMP_DIR/db"
cp -r db/schema "$TEMP_DIR/db/" 2>/dev/null || echo "No db/schema found"
cp -r db/queries "$TEMP_DIR/db/" 2>/dev/null || echo "No db/queries found"
cp -r db/migrations "$TEMP_DIR/db/" 2>/dev/null || echo "No db/migrations found"

# Documentation
mkdir -p "$TEMP_DIR/docs"
cp -r docs/* "$TEMP_DIR/docs/" 2>/dev/null || echo "No docs found"

# UI source files
mkdir -p "$TEMP_DIR/ui"
cp -r ui/src "$TEMP_DIR/ui/" 2>/dev/null || echo "No ui/src found"
cp ui/*.html "$TEMP_DIR/ui/" 2>/dev/null || echo "No HTML files in ui/"
cp ui/*.js "$TEMP_DIR/ui/" 2>/dev/null || echo "No JS files in ui/"

# Worker source
mkdir -p "$TEMP_DIR/worker"
cp -r worker/src "$TEMP_DIR/worker/" 2>/dev/null || echo "No worker/src found"
cp worker/*.js "$TEMP_DIR/worker/" 2>/dev/null || echo "No JS files in worker/"
cp worker/*.json "$TEMP_DIR/worker/" 2>/dev/null || echo "No JSON files in worker/"

# Scripts (important for understanding development workflow)
mkdir -p "$TEMP_DIR/scripts"
cp scripts/*.sh "$TEMP_DIR/scripts/" 2>/dev/null || echo "No shell scripts found"

# Key project files
cp wrangler.toml "$TEMP_DIR/" 2>/dev/null || echo "No wrangler.toml found"

# Current project state summary
echo "Project: GrassrootsMVT" > "$TEMP_DIR/PROJECT_STATE.md"
echo "Branch: $(git branch --show-current)" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "Last commit: $(git log -1 --oneline)" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "Generated: $(date)" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "## Current Issues/Tasks:" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "- Environment-aware refactoring in progress" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "- API client standardization" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "- Local/production environment detection" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "" >> "$TEMP_DIR/PROJECT_STATE.md"
echo "## File Tree:" >> "$TEMP_DIR/PROJECT_STATE.md"
tree -I 'node_modules|.git|.wrangler|.test-results' -L 3 >> "$TEMP_DIR/PROJECT_STATE.md" 2>/dev/null || ls -la >> "$TEMP_DIR/PROJECT_STATE.md"

# Create zip
echo "Creating zip archive..."
zip -r "$ZIP_NAME" "$TEMP_DIR"

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Copy to Windows Downloads folder
DOWNLOADS_PATH="/mnt/c/Users/ancho/Downloads"
if [ -d "$DOWNLOADS_PATH" ]; then
    echo "Copying to Windows Downloads folder..."
    cp "$ZIP_NAME" "$DOWNLOADS_PATH/"
    echo "✅ Copied $ZIP_NAME to $DOWNLOADS_PATH/"
else
    echo "⚠️  Windows Downloads folder not found at $DOWNLOADS_PATH"
    echo "Current zip location: $(pwd)/$ZIP_NAME"
fi

echo "✅ Chat review package created: $ZIP_NAME"
ls -lh "$ZIP_NAME"