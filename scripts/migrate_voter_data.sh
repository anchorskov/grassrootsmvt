#!/usr/bin/env bash
# migrate_voter_data.sh - Migrate complete Wyoming voter data from SQLite to D1
# Transfers voters, addresses, and phone data from /home/anchor/projects/voterdata/wyoming/wy.sqlite

set -euo pipefail

SOURCE_DB="/home/anchor/projects/voterdata/wyoming/wy.sqlite"
LOCAL_DB="wy_preview"
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"
WRANGLER_CONFIG="$WORKER_DIR/wrangler.toml"
TEMP_DIR=$(mktemp -d)
BATCH_SIZE=5000  # Starting batch size - will adapt automatically
BATCH_MIN=1000   # Minimum batch size if errors occur
BATCH_MAX=5000   # Maximum batch size (reduced for phone data complexity)
BATCH_INCREMENT=2000  # How much to increase each successful round
MAX_TOTAL_RECORDS=999999  # No limit - migrate all records

# Adaptive batch sizing variables
current_batch_size=$BATCH_SIZE
consecutive_successes=0
error_count=0

trap 'rm -rf "$TEMP_DIR"' EXIT

# Color codes
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info(){ echo -e "${BLUE}🔍${NC} $1"; }
success(){ echo -e "${GREEN}✅${NC} $1"; }
warning(){ echo -e "${YELLOW}⚠️${NC} $1"; }
error(){ echo -e "${RED}❌${NC} $1" >&2; }

# Adaptive batch sizing function
adapt_batch_size() {
  local success=$1
  
  if [ "$success" = "true" ]; then
    consecutive_successes=$((consecutive_successes + 1))
    error_count=0
    
    # Increase batch size after 3 consecutive successes
    if [ $consecutive_successes -ge 3 ] && [ $current_batch_size -lt $BATCH_MAX ]; then
      local new_size=$((current_batch_size + BATCH_INCREMENT))
      if [ $new_size -le $BATCH_MAX ]; then
        current_batch_size=$new_size
        consecutive_successes=0
        success "🚀 Batch size increased to $current_batch_size (performance optimization)"
      fi
    fi
  else
    error_count=$((error_count + 1))
    consecutive_successes=0
    
    # Decrease batch size on error
    if [ $current_batch_size -gt $BATCH_MIN ]; then
      current_batch_size=$((current_batch_size / 2))
      if [ $current_batch_size -lt $BATCH_MIN ]; then
        current_batch_size=$BATCH_MIN
      fi
      warning "⚠️ Batch size reduced to $current_batch_size (error recovery)"
    fi
    
    # Fail after too many errors
    if [ $error_count -ge 5 ]; then
      error "Too many consecutive errors. Aborting migration."
      exit 1
    fi
  fi
}

# Verify source database exists
if [ ! -f "$SOURCE_DB" ]; then
  error "Source database not found: $SOURCE_DB"
  exit 1
fi

info "Starting voter data migration from Wyoming SQLite to D1"
echo "Source: $SOURCE_DB"
echo "Target: D1 database '$LOCAL_DB'"
echo "Starting batch size: $BATCH_SIZE records (will adapt automatically)"
echo "Max records: $MAX_TOTAL_RECORDS"
echo

# Check source data counts
info "Analyzing source data..."
TOTAL_VOTERS=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM voters;")
TOTAL_PHONES=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM v_best_phone;")
TOTAL_ADDRESSES=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM v_voters_addr_norm;")

echo "📊 Source data counts:"
echo "   Voters: $TOTAL_VOTERS"
echo "   Phone records: $TOTAL_PHONES"
echo "   Address records: $TOTAL_ADDRESSES"
echo

# Function to execute D1 command
d1_exec() {
  cd "$WORKER_DIR"
  npx wrangler d1 execute "$LOCAL_DB" --command "$1" --local
}

# Function to clear table if it exists
clear_table() {
  local table="$1"
  info "Clearing existing data from $table..."
  d1_exec "DELETE FROM $table;" 2>/dev/null || {
    warning "Table $table might not exist yet"
  }
}

# Function to create table schema
create_voters_schema() {
  info "Creating/updating voters table schema..."
  
  d1_exec "
    CREATE TABLE IF NOT EXISTS voters (
      voter_id TEXT PRIMARY KEY,
      political_party TEXT,
      county TEXT,
      senate TEXT,
      house TEXT
    );
  "
  
  # Create indexes for performance
  d1_exec "CREATE INDEX IF NOT EXISTS idx_voters_party ON voters(political_party);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_voters_county ON voters(county);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_voters_house ON voters(house);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_voters_senate ON voters(senate);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_voters_county_party ON voters(county, political_party);"
  
  success "Voters table schema ready"
}

create_addresses_schema() {
  info "Creating/updating voter addresses schema..."
  
  d1_exec "
    CREATE TABLE IF NOT EXISTS v_voters_addr_norm (
      voter_id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      address TEXT,
      city TEXT,
      state TEXT DEFAULT 'WY',
      zip TEXT,
      senate_district TEXT,
      house_district TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
    );
  "
  
  d1_exec "CREATE INDEX IF NOT EXISTS idx_addr_city ON v_voters_addr_norm(city);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_addr_zip ON v_voters_addr_norm(zip);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_addr_voter_id ON v_voters_addr_norm(voter_id);"
  
  success "Address table schema ready"
}

create_phones_schema() {
  info "Creating/updating phone numbers schema..."
  
  d1_exec "
    CREATE TABLE IF NOT EXISTS v_best_phone (
      voter_id TEXT PRIMARY KEY,
      phone_e164 TEXT,
      confidence_code INTEGER,
      is_wy_area INTEGER,
      imported_at TEXT
    );
  "
  
  d1_exec "CREATE INDEX IF NOT EXISTS idx_phone_voter_id ON v_best_phone(voter_id);"
  d1_exec "CREATE INDEX IF NOT EXISTS idx_phone_e164 ON v_best_phone(phone_e164);"
  
  success "Phone table schema ready"
}

# Function to migrate voters data in batches
migrate_voters() {
  info "Migrating voters data..."
  
  local count=0
  local offset=0
  
  while [ $count -lt $MAX_TOTAL_RECORDS ] && [ $offset -lt $TOTAL_VOTERS ]; do
    local batch_file="$TEMP_DIR/voters_batch_$offset.sql"
    
    info "Processing voters batch: offset $offset, limit $current_batch_size"
    
    # Extract batch from SQLite and convert to D1 INSERT statements
    sqlite3 "$SOURCE_DB" "
      SELECT 
        'INSERT OR REPLACE INTO voters (voter_id, political_party, county, senate, house) VALUES (' ||
        '''' || REPLACE(voter_id, '''', '''''') || ''', ' ||
        CASE WHEN political_party IS NULL THEN 'NULL' ELSE '''' || REPLACE(political_party, '''', '''''') || '''' END || ', ' ||
        CASE WHEN county IS NULL THEN 'NULL' ELSE '''' || REPLACE(county, '''', '''''') || '''' END || ', ' ||
        CASE WHEN senate_district IS NULL THEN 'NULL' ELSE '''' || REPLACE(senate_district, '''', '''''') || '''' END || ', ' ||
        CASE WHEN house_district IS NULL THEN 'NULL' ELSE '''' || REPLACE(house_district, '''', '''''') || '''' END || ');'
      FROM voters 
      ORDER BY voter_id
      LIMIT $current_batch_size OFFSET $offset;
    " > "$batch_file"
    
    # Execute the batch
    if [ -s "$batch_file" ]; then
      cd "$WORKER_DIR"
      if npx wrangler d1 execute "$LOCAL_DB" --file "$batch_file" --local; then
        local batch_count=$(wc -l < "$batch_file")
        count=$((count + batch_count))
        success "Migrated $batch_count voters (total: $count)"
        adapt_batch_size "true"
        offset=$((offset + current_batch_size))
      else
        error "Failed to execute batch at offset $offset"
        adapt_batch_size "false"
        # Don't increment offset on failure, retry with smaller batch
      fi
    else
      warning "No more voter data to migrate"
      break
    fi
  done
  
  success "Voters migration complete: $count records"
}

# Function to migrate address data
migrate_addresses() {
  info "Migrating address data..."
  
  local count=0
  local offset=0
  
  while [ $count -lt $MAX_TOTAL_RECORDS ] && [ $offset -lt $TOTAL_ADDRESSES ]; do
    local batch_file="$TEMP_DIR/addresses_batch_$offset.sql"
    
    info "Processing addresses batch: offset $offset, limit $current_batch_size"
    
    sqlite3 "$SOURCE_DB" "
      SELECT 
        'INSERT OR REPLACE INTO v_voters_addr_norm (voter_id, ln, fn, addr1, city, state, zip, senate, house) VALUES (' ||
        '''' || REPLACE(voter_id, '''', '''''') || ''', ' ||
        CASE WHEN ln IS NULL THEN 'NULL' ELSE '''' || REPLACE(ln, '''', '''''') || '''' END || ', ' ||
        CASE WHEN fn IS NULL THEN 'NULL' ELSE '''' || REPLACE(fn, '''', '''''') || '''' END || ', ' ||
        CASE WHEN addr1 IS NULL THEN 'NULL' ELSE '''' || REPLACE(addr1, '''', '''''') || '''' END || ', ' ||
        CASE WHEN city IS NULL THEN 'NULL' ELSE '''' || REPLACE(city, '''', '''''') || '''' END || ', ' ||
        CASE WHEN state IS NULL THEN 'NULL' ELSE '''' || REPLACE(state, '''', '''''') || '''' END || ', ' ||
        CASE WHEN zip IS NULL THEN 'NULL' ELSE '''' || REPLACE(zip, '''', '''''') || '''' END || ', ' ||
        CASE WHEN senate IS NULL THEN 'NULL' ELSE '''' || REPLACE(senate, '''', '''''') || '''' END || ', ' ||
        CASE WHEN house IS NULL THEN 'NULL' ELSE '''' || REPLACE(house, '''', '''''') || '''' END || ');'
      FROM v_voters_addr_norm 
      ORDER BY voter_id
      LIMIT $current_batch_size OFFSET $offset;
    " > "$batch_file"
    
    if [ -s "$batch_file" ]; then
      cd "$WORKER_DIR"
      if npx wrangler d1 execute "$LOCAL_DB" --file "$batch_file" --local; then
        local batch_count=$(wc -l < "$batch_file")
        count=$((count + batch_count))
        success "Migrated $batch_count addresses (total: $count)"
        adapt_batch_size "true"
        offset=$((offset + current_batch_size))
      else
        error "Failed to execute address batch at offset $offset"
        adapt_batch_size "false"
      fi
    else
      warning "No more address data to migrate"
      break
    fi
  done
  
  success "Completed addresses migration: $count records"
}

# Function to migrate phone data
migrate_phones() {
  info "Migrating phone data..."
  
  local count=0
  local offset=0
  
  while [ $count -lt $MAX_TOTAL_RECORDS ] && [ $offset -lt $TOTAL_PHONES ]; do
    local batch_file="$TEMP_DIR/phones_batch_$offset.sql"
    
    info "Processing phones batch: offset $offset, limit $current_batch_size"
    
    sqlite3 "$SOURCE_DB" "
      SELECT 
        'INSERT OR REPLACE INTO v_best_phone (voter_id, phone_e164, confidence_code, is_wy_area, imported_at) VALUES (' ||
        '''' || REPLACE(voter_id, '''', '''''') || ''', ' ||
        CASE WHEN phone_e164 IS NULL THEN 'NULL' ELSE '''' || REPLACE(phone_e164, '''', '''''') || '''' END || ', ' ||
        CASE WHEN confidence_code IS NULL THEN 'NULL' ELSE confidence_code END || ', ' ||
        CASE WHEN is_wy_area IS NULL THEN '0' ELSE is_wy_area END || ', ' ||
        CASE WHEN imported_at IS NULL THEN 'NULL' ELSE '''' || REPLACE(imported_at, '''', '''''') || '''' END || ');'
      FROM v_best_phone 
      ORDER BY voter_id
      LIMIT $current_batch_size OFFSET $offset;
    " > "$batch_file"
    
    if [ -s "$batch_file" ]; then
      cd "$WORKER_DIR"
      if npx wrangler d1 execute "$LOCAL_DB" --file "$batch_file" --local; then
        local batch_count=$(wc -l < "$batch_file")
        count=$((count + batch_count))
        success "Migrated $batch_count phone records (total: $count)"
        adapt_batch_size "true"
        offset=$((offset + current_batch_size))
      else
        error "Failed to execute phone batch at offset $offset"
        adapt_batch_size "false"
      fi
    else
      warning "No more phone data to migrate"
      break
    fi
  done
  
  success "Completed phones migration: $count records"
}

# Function to verify migration
verify_migration() {
  info "Verifying migration results..."
  
  cd "$WORKER_DIR"
  
  local voters_count=$(npx wrangler d1 execute "$LOCAL_DB" --command "SELECT COUNT(*) FROM voters;" --local | grep -o '[0-9]\+' | tail -1)
  local addresses_count=$(npx wrangler d1 execute "$LOCAL_DB" --command "SELECT COUNT(*) FROM v_voters_addr_norm;" --local | grep -o '[0-9]\+' | tail -1)
  local phones_count=$(npx wrangler d1 execute "$LOCAL_DB" --command "SELECT COUNT(*) FROM v_best_phone;" --local | grep -o '[0-9]\+' | tail -1)
  
  echo "📊 Migration Results:"
  echo "   Voters: $voters_count"
  echo "   Addresses: $addresses_count"
  echo "   Phone records: $phones_count"
  
  # Test sample data
  info "Testing sample queries..."
  
  echo "🧪 Sample voter:"
  npx wrangler d1 execute "$LOCAL_DB" --command "SELECT voter_id, first_name, last_name, political_party, county FROM voters LIMIT 1;" --local
  
  echo
  echo "🧪 County breakdown:"
  npx wrangler d1 execute "$LOCAL_DB" --command "SELECT county, COUNT(*) as count FROM voters GROUP BY county ORDER BY count DESC LIMIT 5;" --local
  
  echo
  echo "🧪 Party breakdown:"
  npx wrangler d1 execute "$LOCAL_DB" --command "SELECT political_party, COUNT(*) as count FROM voters GROUP BY political_party ORDER BY count DESC;" --local
  
  success "Migration verification complete"
}

# Main execution
main() {
  # Confirm before proceeding
  echo "⚠️  This will replace existing voter data in the local D1 database."
  read -p "Continue? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Migration cancelled"
    exit 0
  fi
  
  # Create schemas
  create_voters_schema
  create_addresses_schema  
  create_phones_schema
  
  # Clear existing data
  clear_table "v_best_phone"
  clear_table "v_voters_addr_norm"
  clear_table "voters"
  
  # Migrate data
  migrate_voters
  migrate_addresses
  migrate_phones
  
  # Verify results
  verify_migration
  
  success "🎉 Voter data migration complete!"
  echo
  echo "📋 Next steps:"
  echo "1. Test the canvass page to verify data is working"
  echo "2. Check API endpoints: /api/voters, /api/canvass/nearby"
  echo "3. Consider running the contact status integration test"
  echo
  echo "🌐 Test URL:"
  echo "http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated"
}

# Run main function
main "$@"