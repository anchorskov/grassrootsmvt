#!/usr/bin/env bash
# seed_local_d1.sh – Seed local D1 (wy_preview) from remote D1 (wy)
# Copies up to 50 rows from remote → local only if local table is empty.
# Safe for repeated use.

set -euo pipefail

REMOTE_DB="wy"
LOCAL_DB="wy_preview"
LIMIT=50
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"
WRANGLER_CONFIG="$WORKER_DIR/wrangler.toml"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Tables with data in remote database (based on row count analysis):
# voters: 274,656 rows | voters_norm: 1,001 rows | v_best_phone: 113,221 rows | voters_raw: 1 row
# Other tables are empty but included for completeness
TABLES=("voters" "voters_norm" "v_best_phone" "voters_raw" "voter_contacts" "volunteers" "call_activity" "call_assignments" "call_followups" "walk_batches" "walk_assignments" "message_templates" "v_best_phone_old" "v_voters_addr_norm")

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info(){ echo -e "${BLUE}🔍${NC} $1"; }
success(){ echo -e "${GREEN}✅${NC} $1"; }
warning(){ echo -e "${YELLOW}⚠️${NC} $1"; }
error(){ echo -e "${RED}❌${NC} $1" >&2; }

# Check if table exists in local DB
table_exists_local() {
  local table="$1"
  cd "$WORKER_DIR"
  local result
  result=$(npx wrangler d1 execute "$LOCAL_DB" \
    --command "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" \
    --json 2>/dev/null | jq -r '.[0].results | length' 2>/dev/null || echo "0")
  cd "$PROJECT_ROOT"
  [[ "$result" -gt 0 ]]
}

# Check if table exists in remote DB
table_exists_remote() {
  local table="$1"
  cd "$WORKER_DIR"
  local result
  result=$(npx wrangler d1 execute "$REMOTE_DB" --remote \
    --command "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" \
    --json 2>/dev/null | jq -r '.[0].results | length' 2>/dev/null || echo "0")
  cd "$PROJECT_ROOT"
  [[ "$result" -gt 0 ]]
}

check_table_empty() {
  local table="$1"
  cd "$WORKER_DIR"
  local count
  count=$(npx wrangler d1 execute "$LOCAL_DB" \
    --command "SELECT COUNT(*) AS c FROM [$table];" \
    --json 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo "0")
  cd "$PROJECT_ROOT"
  echo "$count"
}

fetch_remote_data() {
  local table="$1"
  cd "$WORKER_DIR"
  local data
  data=$(npx wrangler d1 execute "$REMOTE_DB" --remote \
    --command "SELECT * FROM [$table] LIMIT 50;" \
    --json 2>/dev/null | jq -c '.[0].results' 2>/dev/null || echo "[]")
  cd "$PROJECT_ROOT"
  echo "$data"
}

insert_local_data() {
  local table="$1" data="$2"
  [[ "$data" == "null" || -z "$data" || "$data" == "[]" ]] && return

  local tmp_sql="$TEMP_DIR/${table}_insert.sql"
  echo "BEGIN TRANSACTION;" > "$tmp_sql"

  echo "$data" | jq -c '.[]' | while read -r row; do
    # Build dynamic insert from object keys
    local cols vals
    cols=$(echo "$row" | jq -r 'keys_unsorted | map("[" + . + "]") | join(", ")')
    vals=$(echo "$row" | jq -r '[.[] | if type=="string" then "\"" + gsub("\""; "\"\"") + "\"" else tostring end] | join(", ")')
    echo "INSERT INTO [$table] ($cols) VALUES ($vals);" >> "$tmp_sql"
  done

  echo "COMMIT;" >> "$tmp_sql"

  if [[ "${DRY_RUN:-false}" == "true" ]]; then
    warning "Dry run: would apply inserts to $table"
    echo "First few statements:"
    head -n 5 "$tmp_sql"
    echo "..."
  else
    cd "$WORKER_DIR"
    if npx wrangler d1 execute "$LOCAL_DB" --file "$tmp_sql" >/dev/null 2>&1; then
      success "Successfully seeded $table"
    else
      error "Failed to seed $table"
    fi
    cd "$PROJECT_ROOT"
  fi
}

info "🌱 Starting local D1 seed..."

# Seed tables with data  
for table in "${TABLES[@]}"; do
  info "Processing table: $table"
  
  # Check if table exists locally first
  if ! table_exists_local "$table"; then
    warning "Table $table doesn't exist locally, skipping"
    continue
  fi
  
  # Check if table is already seeded (has data)
  local_count=$(check_table_empty "$table")
  if [[ "$local_count" -gt 0 ]]; then
    info "Table $table already has $local_count rows, skipping"
    continue
  fi
  
  # Get data from remote
  info "Fetching up to $LIMIT rows from remote $table..."
  remote_data=$(fetch_remote_data "$table")
  
  if [[ "$remote_data" == "[]" || "$remote_data" == "null" ]]; then
    warning "No data in remote $table, skipping"
    continue
  fi
  
  # Insert data locally
  info "Inserting data into local $table..."
  insert_local_data "$table" "$remote_data"
  success "Completed processing $table"
done

success "Local D1 seed completed."
echo "💾 Database: $LOCAL_DB"
