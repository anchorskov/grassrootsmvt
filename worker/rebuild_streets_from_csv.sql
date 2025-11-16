-- Rebuild streets_index from cleaned CSV
-- Nuclear option: Drop all existing data and import from CSV

-- Step 1: Count before
SELECT 'Records in streets_index BEFORE' as status, COUNT(*) as count FROM streets_index;
SELECT 'Records in streets_csv_source' as status, COUNT(*) as count FROM streets_csv_source;

-- Step 2: Drop all existing data
DELETE FROM streets_index;

-- Step 3: Import from CSV (deduplicate on composite key)
INSERT INTO streets_index (
  city_county_id,
  street_prefix,
  street_core,
  street_type,
  street_suffix,
  street_canonical,
  raw_address
)
SELECT 
  city_county_id,
  street_prefix,
  street_core,
  street_type,
  street_suffix,
  street_canonical,
  NULL as raw_address  -- CSV doesn't have raw_address, set to NULL
FROM streets_csv_source
GROUP BY city_county_id, street_canonical;  -- Deduplicate on composite key

-- Step 4: Verify results
SELECT 'Records in streets_index AFTER' as status, COUNT(*) as count FROM streets_index;

-- Step 5: Verify RODEO RANCH RD is correct now
SELECT 'RODEO check' as status, street_canonical, street_core, street_type 
FROM streets_index 
WHERE city_county_id = 1 AND street_canonical LIKE '%RODEO%';

-- Step 6: Clean up temp table (optional - comment out if you want to keep for reference)
-- DROP TABLE streets_csv_source;
