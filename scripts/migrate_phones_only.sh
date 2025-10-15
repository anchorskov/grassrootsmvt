#!/usr/bin/env bash
# migrate_phones_only.sh - Migrate only phone data from SQLite to D1
# Focused migration for phone records with conservative batch sizing

set -euo pipefail

SOURCE_DB="/home/anchor/projects/voterdata/wyoming/wy.sqlite"
LOCAL_DB="wy_preview"
PROJECT_ROOT=$(pwd)
WORKER_DIR="$PROJECT_ROOT/worker"
TEMP_DIR=$(mktemp -d)

# Conservative batch sizing for phone data
BATCH_SIZE=2000  # Start smaller for phone data
BATCH_MIN=500    # Minimum batch size if errors occur
BATCH_MAX=5000   # Maximum batch size
BATCH_INCREMENT=1000  # Smaller increments
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

# Get total phone records
info "Checking source database for phone records..."
TOTAL_PHONES=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM v_best_phone;")
info "Found $TOTAL_PHONES phone records to migrate"

echo
echo "📱 Phone Migration Configuration:"
echo "Starting batch size: $BATCH_SIZE records (will adapt automatically)"
echo "Max batch size: $BATCH_MAX records"
echo "Total records to migrate: $TOTAL_PHONES"
echo

# Clear existing phone data
info "Clearing existing phone data..."
cd "$WORKER_DIR"
npx wrangler d1 execute "$LOCAL_DB" --local --command "DELETE FROM v_best_phone;"

# Function to migrate phone data only
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
        
        # Add small delay to prevent overwhelming the database
        sleep 1
      else
        error "Failed to execute phone batch at offset $offset"
        adapt_batch_size "false"
        # Don't increment offset on failure - retry with smaller batch
      fi
    else
      warning "No more phone data to migrate"
      break
    fi
  done
  
  success "Completed phones migration: $count records"
}

# Verify results
verify_migration() {
  info "Verifying phone migration..."
  
  cd "$WORKER_DIR"
  
  local phone_count=$(npx wrangler d1 execute "$LOCAL_DB" --local --command "SELECT COUNT(*) as count FROM v_best_phone;" | grep -o '[0-9]*' | tail -1)
  
  success "Phone records migrated: $phone_count"
  
  if [ "$phone_count" -eq "$TOTAL_PHONES" ]; then
    success "🎉 All phone records migrated successfully!"
  else
    warning "⚠️ Phone migration incomplete: $phone_count/$TOTAL_PHONES"
  fi
}

# Main execution
main() {
  # Confirm before proceeding
  echo "📱 This will migrate phone data to the local D1 database."
  read -p "Continue? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Migration cancelled"
    exit 0
  fi
  
  # Migrate phone data
  migrate_phones
  
  # Verify results
  verify_migration
  
  success "🎉 Phone data migration complete!"
  echo
  echo "📋 Next steps:"
  echo "1. Test the canvass page to verify phone data is working"
  echo "2. Consider running address migration separately if needed"
}

# Run main function
main "$@"