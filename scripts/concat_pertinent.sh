#!/usr/bin/env bash
# Concatenate only pertinent source and instruction files for review
set -euo pipefail

OUT="docs_combined_review.txt"
LIST="scripts/pertinent_files.txt"

# Create the curated file list (no old docs)
cat > "$LIST" <<'FILES'
# Core Configuration
ui/config/environments.js
worker/wrangler.toml
worker/src/index.js

# API + Utils
ui/src/apiClient.js
ui/functions/_utils/verifyAccessJWT.js

# UI Entry Points
ui/index.html
ui/volunteer/index.html
ui/call.html
ui/canvass/index.html

# Scripts and Testing
scripts/preflight_check.sh
scripts/test_api_endpoints.mjs

# Instructional / Active Project Guidance
instructions/Local_D1_Schema_Snapshot_wy_local_20251026.md
instructions/project_instructions.md
instructions/STATUS_CURRENT.md
instructions/zip_prompt.md
FILES

echo "🧩 Concatenating pertinent project files..."
> "$OUT"
while IFS= read -r file; do
  # skip comments or blank lines
  [[ -z "$file" || "$file" == \#* ]] && continue
  if [[ -f "$file" ]]; then
    echo "===== BEGIN $file =====" >> "$OUT"
    cat "$file" >> "$OUT"
    echo -e "\n===== END $file =====\n" >> "$OUT"
  else
    echo "⚠️ Missing file: $file" >&2
  fi
done < "$LIST"

echo "✅ Concatenation complete → $OUT"
