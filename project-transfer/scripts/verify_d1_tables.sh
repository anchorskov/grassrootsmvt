#!/usr/bin/env bash
# verify_d1_tables.sh - Verify and compare remote/local D1 tables
# Checks table existence, row counts, and shows sample data safely (read-only)

set -euo pipefail

REMOTE_DB="wy"
LOCAL_DB="wy_preview"
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"
WRANGLER_CONFIG="$WORKER_DIR/wrangler.toml"

# Target tables to check
TABLES=("voters" "addresses" "volunteers" "canvass_sessions" "call_activity" "activity_log" "users")

# Color codes
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log(){ echo -e "${BLUE}🔍${NC} $1"; }
success(){ echo -e "${GREEN}✅${NC} $1"; }
warning(){ echo -e "${YELLOW}⚠️${NC} $1"; }
error(){ echo -e "${RED}❌${NC} $1" >&2; }

# Check if table exists in database
table_exists() {
  local db="$1" table="$2" flag="$3"
  cd "$WORKER_DIR"
  local result
  result=$(npx wrangler d1 execute "$db" $flag \
    --command "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" \
    --json 2>/dev/null | jq -r '.[0].results | length' 2>/dev/null || echo "0")
  cd "$PROJECT_ROOT"
  [[ "$result" -gt 0 ]]
}

# Get row count for table
get_row_count() {
  local db="$1" table="$2" flag="$3"
  cd "$WORKER_DIR"
  local count
  count=$(npx wrangler d1 execute "$db" $flag \
    --command "SELECT COUNT(*) AS c FROM [$table];" \
    --json 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo "ERROR")
  cd "$PROJECT_ROOT"
  echo "$count"
}

# Get sample data from table
get_sample_data() {
  local db="$1" table="$2" flag="$3" limit="${4:-50}"
  cd "$WORKER_DIR"
  local data
  data=$(npx wrangler d1 execute "$db" $flag \
    --command "SELECT * FROM [$table] LIMIT $limit;" \
    --json 2>/dev/null | jq '.[0].results' 2>/dev/null || echo "[]")
  cd "$PROJECT_ROOT"
  echo "$data"
}

# Get CREATE TABLE statement for table
get_create_statement() {
  local db="$1" table="$2" flag="$3"
  cd "$WORKER_DIR"
  local sql
  sql=$(npx wrangler d1 execute "$db" $flag \
    --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='$table';" \
    --json 2>/dev/null | jq -r '.[0].results[0].sql' 2>/dev/null || echo "")
  cd "$PROJECT_ROOT"
  echo "$sql"
}

# Tool validation
if ! command -v npx &>/dev/null; then error "npx not found"; exit 1; fi
if ! command -v jq &>/dev/null; then error "jq not found"; exit 1; fi
if [[ ! -f "$WRANGLER_CONFIG" ]]; then
  error "wrangler.toml not found at $WRANGLER_CONFIG"
  exit 1
fi

log "🔍 Starting D1 table verification: $REMOTE_DB (remote) vs $LOCAL_DB (local)"
echo ""

# Summary arrays
declare -a existing_remote=()
declare -a existing_local=()
declare -a missing_local=()
declare -a empty_remote=()
declare -a empty_local=()

# Check each table
for table in "${TABLES[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "Checking table: $table"
  
  # Check remote existence
  if table_exists "$REMOTE_DB" "$table" "--remote"; then
    existing_remote+=("$table")
    success "✓ Remote table exists: $table"
    
    # Get remote row count
    remote_count=$(get_row_count "$REMOTE_DB" "$table" "--remote")
    if [[ "$remote_count" == "ERROR" ]]; then
      warning "Could not get row count for remote $table"
    elif [[ "$remote_count" == "0" ]]; then
      empty_remote+=("$table")
      warning "Remote $table is empty (0 rows)"
    else
      success "Remote $table has $remote_count rows"
      
      # Show sample data
      log "Sample data from remote $table (first 5 rows):"
      sample_data=$(get_sample_data "$REMOTE_DB" "$table" "--remote" "5")
      if [[ "$sample_data" != "[]" && -n "$sample_data" ]]; then
        echo "$sample_data" | jq '.[0:5]' 2>/dev/null || echo "$sample_data"
      else
        warning "No sample data available"
      fi
    fi
  else
    error "✗ Remote table missing: $table"
  fi
  
  echo ""
  
  # Check local existence
  if table_exists "$LOCAL_DB" "$table" ""; then
    existing_local+=("$table")
    success "✓ Local table exists: $table"
    
    # Get local row count
    local_count=$(get_row_count "$LOCAL_DB" "$table" "")
    if [[ "$local_count" == "ERROR" ]]; then
      warning "Could not get row count for local $table"
    elif [[ "$local_count" == "0" ]]; then
      empty_local+=("$table")
      warning "Local $table is empty (0 rows)"
    else
      success "Local $table has $local_count rows"
    fi
  else
    missing_local+=("$table")
    error "✗ Local table missing: $table"
    
    # If remote exists but local doesn't, show CREATE statement
    if table_exists "$REMOTE_DB" "$table" "--remote"; then
      log "CREATE statement for missing local table:"
      create_sql=$(get_create_statement "$REMOTE_DB" "$table" "--remote")
      if [[ -n "$create_sql" && "$create_sql" != "null" ]]; then
        echo "$create_sql;"
      else
        warning "Could not retrieve CREATE statement"
      fi
    fi
  fi
  
  echo ""
done

# Print summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "📊 SUMMARY"
echo ""

success "Tables existing remotely (${#existing_remote[@]}): ${existing_remote[*]}"
success "Tables existing locally (${#existing_local[@]}): ${existing_local[*]}"

if [[ ${#missing_local[@]} -gt 0 ]]; then
  warning "Tables missing locally (${#missing_local[@]}): ${missing_local[*]}"
else
  success "All target tables exist locally ✓"
fi

if [[ ${#empty_remote[@]} -gt 0 ]]; then
  warning "Remote tables that are empty (${#empty_remote[@]}): ${empty_remote[*]}"
fi

if [[ ${#empty_local[@]} -gt 0 ]]; then
  warning "Local tables that are empty (${#empty_local[@]}): ${empty_local[*]}"
fi

echo ""
log "🎯 RECOMMENDATIONS:"

if [[ ${#missing_local[@]} -gt 0 ]]; then
  warning "• Run schema sync to create missing local tables"
fi

if [[ ${#empty_local[@]} -gt 0 ]]; then
  warning "• Consider seeding these empty local tables: ${empty_local[*]}"
fi

if [[ ${#existing_local[@]} -eq ${#TABLES[@]} && ${#empty_local[@]} -eq 0 ]]; then
  success "• All tables exist and have data - no action needed! ✅"
fi

echo ""
success "Verification completed!"