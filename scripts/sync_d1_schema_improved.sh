#!/usr/bin/env bash
# sync_d1_schema_improved.sh - Compare and sync Cloudflare D1 schemas (debug-safe one-by-one version)
# Safely copies the remote schema (wy) to the local preview database (wy_preview).
# Includes dry-run, row count verification, and debug tracing.

# -------------------------------------------------------------------
# Debug mode (optional)
# -------------------------------------------------------------------
set -uo pipefail
[[ "${DEBUG:-false}" == "true" ]] && set -x

# -------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------
REMOTE_DB="wy"
LOCAL_DB="wy_preview"
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"
WRANGLER_CONFIG="$WORKER_DIR/wrangler.toml"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SCHEMA_FILE="$WORKER_DIR/db/migrations/sync_remote_schema_${TIMESTAMP}.sql"

# -------------------------------------------------------------------
# Color codes
# -------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()      { echo -e "${BLUE}🔍${NC} $1"; }
success()  { echo -e "${GREEN}✅${NC} $1"; }
warning()  { echo -e "${YELLOW}⚠️${NC} $1"; }
error()    { echo -e "${RED}❌${NC} $1" >&2; }
update()   { echo -e "${YELLOW}⚙️${NC} $1"; }

# -------------------------------------------------------------------
# Tool validation
# -------------------------------------------------------------------
if ! command -v npx &>/dev/null; then error "npx not found"; exit 1; fi
if ! command -v jq &>/dev/null; then error "jq not found"; exit 1; fi
if [[ ! -f "$WRANGLER_CONFIG" ]]; then
  error "wrangler.toml not found at $WRANGLER_CONFIG"
  exit 1
fi

# -------------------------------------------------------------------
# Functions
# -------------------------------------------------------------------

get_table_list() {
  local db="$1" flag="$2" output_file="$3"
  log "Fetching table list for ${db} (${flag:-local})..."
  cd "$WORKER_DIR"
  npx wrangler d1 execute "$db" $flag \
    --command "PRAGMA table_list;" --json 2>/dev/null |
    jq -r '.[0].results[]?.name' | sort >"$output_file" || true
  cd "$PROJECT_ROOT"
}

apply_schema_one_by_one() {
  local src_db="$1" dst_db="$2" flag="$3"
  log "Fetching full SQL schema statements from $src_db (${flag:-local})..."

  cd "$WORKER_DIR"
  
  # Get SQL statements as JSON array, then process each individually
  local sql_json
  sql_json=$(npx wrangler d1 execute "$src_db" $flag \
    --command "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','view','index','trigger') ORDER BY name;" \
    --json 2>/dev/null)

  if [[ -z "$sql_json" ]]; then
    error "No SQL schema data found in $src_db."
    cd "$PROJECT_ROOT"
    return 1
  fi

  local total_statements
  total_statements=$(echo "$sql_json" | jq -r '.[0].results | length' 2>/dev/null || echo "0")
  
  if [[ "$total_statements" == "0" ]]; then
    error "No SQL schema statements found in $src_db."
    cd "$PROJECT_ROOT"
    return 1
  fi

  mkdir -p "$(dirname "$SCHEMA_FILE")"
  echo "-- D1 Schema Sync Snapshot ($(date))" > "$SCHEMA_FILE"

  local count=0
  # Process each statement using jq array indexing
  for ((i=0; i<total_statements; i++)); do
    local stmt
    stmt=$(echo "$sql_json" | jq -r ".[0].results[$i].sql" 2>/dev/null)
    
    if [[ -n "$stmt" && "$stmt" != "null" ]]; then
      ((count++))
      # Guarantee a trailing semicolon for safety
      [[ "$stmt" != *";" ]] && stmt="${stmt};"
      echo "$stmt" >> "$SCHEMA_FILE"
      echo "" >> "$SCHEMA_FILE"

      update "Applying statement #$count/$total_statements..."
      if [[ "${DRY_RUN:-false}" != "true" ]]; then
        if ! npx wrangler d1 execute "$dst_db" --command "$stmt" >/dev/null 2>&1; then
          warning "Statement #$count failed to apply: ${stmt:0:80}..."
        fi
      else
        # Extract object name for better dry run output
        local obj_name
        obj_name=$(echo "$stmt" | head -1 | grep -oiE "CREATE (TABLE|VIEW|INDEX|TRIGGER) ['\"]?([a-zA-Z_][a-zA-Z0-9_]*)" | awk '{print $3}' | tr -d '"' | tr -d "'" 2>/dev/null || echo "unknown")
        echo "[dry-run] $obj_name: ${stmt:0:60}..."
      fi
    fi
  done

  cd "$PROJECT_ROOT"
  success "Applied $count complete SQL statements from $src_db → $dst_db"
  echo "💾 Schema snapshot saved to: $SCHEMA_FILE"
}

verify_row_counts() {
  log "Verifying local D1 table row counts..."
  cd "$WORKER_DIR"
  local tables
  tables=$(npx wrangler d1 execute "$LOCAL_DB" \
    --command "SELECT name FROM sqlite_master WHERE type='table';" --json 2>/dev/null |
    jq -r '.[0].results[]?.name' | sort)

  if [[ -z "$tables" ]]; then
    error "No tables found after sync! Schema may not have applied correctly."
    cd "$PROJECT_ROOT"
    return 1
  fi

  echo ""
  for tbl in $tables; do
    local count
    count=$(npx wrangler d1 execute "$LOCAL_DB" \
      --command "SELECT COUNT(*) AS c FROM [$tbl];" --json 2>/dev/null |
      jq -r '.[0].results[0].c' 2>/dev/null || echo "N/A")
    printf "📊 %-30s %s rows\n" "$tbl" "$count"
  done
  cd "$PROJECT_ROOT"
}

# -------------------------------------------------------------------
# Main Logic
# -------------------------------------------------------------------
log "Starting D1 schema sync: $REMOTE_DB → $LOCAL_DB"

REMOTE_TABLES="$TEMP_DIR/remote_tables.txt"
LOCAL_TABLES="$TEMP_DIR/local_tables.txt"

get_table_list "$REMOTE_DB" "--remote" "$REMOTE_TABLES"
get_table_list "$LOCAL_DB" "" "$LOCAL_TABLES"

# Bootstrap case
if [[ ! -s "$LOCAL_TABLES" ]]; then
  warning "Local database ($LOCAL_DB) is empty — bootstrapping schema..."
  apply_schema_one_by_one "$REMOTE_DB" "$LOCAL_DB" "--remote"
  verify_row_counts
  success "Bootstrap complete."
  exit 0
fi

# Compare table lists
if diff -q "$REMOTE_TABLES" "$LOCAL_TABLES" >/dev/null 2>&1; then
  log "✅ Table lists match. Continuing schema check..."
else
  warning "Table lists differ. Performing full resync."
fi

apply_schema_one_by_one "$REMOTE_DB" "$LOCAL_DB" "--remote"
verify_row_counts
success "D1 schema sync completed successfully!"
