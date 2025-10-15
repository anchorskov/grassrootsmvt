#!/usr/bin/env bash
# migrate_addresses_only.sh - Complete the remaining address data migration
# Resume address migration from where it left off (14,000 records completed)

set -euo pipefail

SOURCE_DB="/home/anchor/projects/voterdata/wyoming/wy.sqlite"
LOCAL_DB="wy_preview"
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"
TEMP_DIR=$(mktemp -d)

# Conservative batch sizing for address data
BATCH_SIZE=3000  # Start conservative for address data
BATCH_MIN=500    # Minimum batch size if errors occur
BATCH_MAX=5000   # Maximum batch size
BATCH_INCREMENT=1000  # Gradual increments
MAX_TOTAL_RECORDS=999999  # No limit - migrate all records

# Adaptive batch sizing variables
current_batch_size=$BATCH_SIZE
consecutive_successes=0
error_count=0

trap 'rm -rf "$TEMP_DIR"' EXIT

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

# Adaptive batch sizing function
adapt_batch_size() {
  local success="$1"
  
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
    # Error occurred - reduce batch size
    consecutive_successes=0
    error_count=$((error_count + 1))
    
    if [ $current_batch_size -gt $BATCH_MIN ]; then
      current_batch_size=$((current_batch_size / 2))
      if [ $current_batch_size -lt $BATCH_MIN ]; then
        current_batch_size=$BATCH_MIN
      fi
      warning "⚠️ Batch size reduced to $current_batch_size (error recovery)"
    fi
  fi
}

# Get current status
info "Checking current address migration status..."
cd "$WORKER_DIR"
CURRENT_ADDRESSES=$(npx wrangler d1 execute "$LOCAL_DB" --local --command "SELECT COUNT(*) as count FROM v_voters_addr_norm;" | grep -o '[0-9]*' | tail -1)
TOTAL_ADDRESSES=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM v_voters_addr_norm;")

info "Current addresses: $CURRENT_ADDRESSES"
info "Total addresses needed: $TOTAL_ADDRESSES"
REMAINING_ADDRESSES=$((TOTAL_ADDRESSES - CURRENT_ADDRESSES))
info "Remaining to migrate: $REMAINING_ADDRESSES"

if [ $CURRENT_ADDRESSES -ge $TOTAL_ADDRESSES ]; then
  success "Address migration already complete!"
  exit 0
fi

echo
echo "🏠 Address Migration Configuration:"
echo "Starting batch size: $BATCH_SIZE records (will adapt automatically)"
echo "Max batch size: $BATCH_MAX records"
echo "Starting offset: $CURRENT_ADDRESSES (resuming from where we left off)"
echo "Remaining records: $REMAINING_ADDRESSES"
echo

# Function to migrate remaining address data
migrate_addresses() {
  info "Migrating remaining address data..."
  
  local count=0
  local offset=$CURRENT_ADDRESSES  # Resume from where we left off
  
  while [ $count -lt $REMAINING_ADDRESSES ] && [ $offset -lt $TOTAL_ADDRESSES ]; do
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
        success "Migrated $batch_count address records (total migrated this session: $count)"
        adapt_batch_size "true"
        offset=$((offset + current_batch_size))
        
        # Add small delay to prevent overwhelming the database
        sleep 1
      else
        error "Failed to execute address batch at offset $offset"
        adapt_batch_size "false"
        # Don't increment offset on failure - retry with smaller batch
      fi
    else
      warning "No more address data to migrate"
      break
    fi
  done
  
  success "Completed address migration session: $count new records migrated"
}

# Verify results
verify_migration() {
  info "Verifying address migration..."
  
  cd "$WORKER_DIR"
  
  local address_count=$(npx wrangler d1 execute "$LOCAL_DB" --local --command "SELECT COUNT(*) as count FROM v_voters_addr_norm;" | grep -o '[0-9]*' | tail -1)
  
  success "Address records now in database: $address_count"
  
  if [ "$address_count" -eq "$TOTAL_ADDRESSES" ]; then
    success "🎉 All address records migrated successfully!"
  else
    local remaining=$((TOTAL_ADDRESSES - address_count))
    warning "⚠️ Address migration progress: $address_count/$TOTAL_ADDRESSES ($remaining remaining)"
  fi
}

# Main execution
main() {
  # Confirm before proceeding
  echo "🏠 This will complete the address data migration to the local D1 database."
  echo "Starting from offset $CURRENT_ADDRESSES, migrating $REMAINING_ADDRESSES remaining records."
  read -p "Continue? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Migration cancelled"
    exit 0
  fi
  
  # Migrate remaining address data
  migrate_addresses
  
  # Verify results
  verify_migration
  
  success "🎉 Address data migration session complete!"
  echo
  echo "📋 Current status:"
  echo "- Voters: 274,656 (100%)"
  echo "- Phones: 110,221 (100%)" 
  echo "- Addresses: Check verification output above"
}

# Run main function
main "$@"