-- ============================================================================
-- Add city_county_id to voter_addresses for Faster Queries
-- ============================================================================
-- This migration adds a foreign key to wy_city_county to avoid expensive
-- text-based county+city filtering and enable direct joins with streets_index
-- ============================================================================

-- Step 1: Add the column
ALTER TABLE voter_addresses ADD COLUMN city_county_id INTEGER;

-- Step 2: Populate city_county_id by joining voters and wy_city_county
UPDATE voter_addresses
SET city_county_id = (
  SELECT cc.id
  FROM voters v
  JOIN wy_city_county cc 
    ON UPPER(v.county) = cc.county_norm 
    AND UPPER(voter_addresses.city) = cc.city_norm
  WHERE v.voter_id = voter_addresses.voter_id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM voters v WHERE v.voter_id = voter_addresses.voter_id
);

-- Step 3: Create index for fast lookups by location
CREATE INDEX idx_voter_addresses_city_county 
  ON voter_addresses(city_county_id);

-- Step 4: Create composite index for common query patterns
CREATE INDEX idx_voter_addresses_location_kind 
  ON voter_addresses(city_county_id, kind);

-- Step 5: Verify the migration
SELECT 
  'Total addresses' as metric,
  COUNT(*) as count,
  COUNT(city_county_id) as with_city_county_id,
  COUNT(*) - COUNT(city_county_id) as missing
FROM voter_addresses;

-- Step 6: Show sample data
SELECT 
  va.voter_id,
  va.addr1,
  va.city,
  va.city_county_id,
  cc.county_norm,
  cc.city_norm
FROM voter_addresses va
LEFT JOIN wy_city_county cc ON va.city_county_id = cc.id
LIMIT 10;

-- ============================================================================
-- Expected Performance Improvement:
-- 
-- BEFORE (2-table join + TEXT filters):
--   SELECT streets WHERE county='ALBANY' AND city='LARAMIE'
--   → 200-500ms for 34,931 voters
--
-- AFTER (single integer lookup):
--   SELECT streets WHERE city_county_id=7
--   → 50-100ms (4-5x faster)
-- ============================================================================
