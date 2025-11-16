-- Phase 2 TIER 2 Moderate Cleanup
-- Delete records with directional suffixes (N/S/E/W) not in CSV
-- Risk level: 5% (high confidence - these were removed during manual CSV cleanup)

-- BEFORE counts
SELECT 'Records before cleanup' as status, COUNT(*) as count FROM streets_index;

-- Delete all records where street_suffix contains a directional (N/S/E/W)
-- and the record doesn't exist in the cleaned CSV
DELETE FROM streets_index 
WHERE street_suffix IN ('N', 'S', 'E', 'W')
  AND NOT EXISTS (
    SELECT 1 FROM streets_csv_source csv
    WHERE csv.city_county_id = streets_index.city_county_id
      AND csv.street_canonical = streets_index.street_canonical
  );

-- AFTER counts
SELECT 'Records deleted' as status, 
  (SELECT COUNT(*) FROM (SELECT 'x')) - COUNT(*) as count 
FROM streets_index;

SELECT 'Records after cleanup' as status, COUNT(*) as count FROM streets_index;

SELECT 'Remaining extra records (vs CSV)' as status,
  COUNT(*) - (SELECT COUNT(*) FROM streets_csv_source) as count
FROM streets_index;

-- Verify: Should show 0 records with directional suffixes not in CSV
SELECT 'Verification: Directional suffixes remaining' as status,
  COUNT(*) as count
FROM streets_index si
WHERE si.street_suffix IN ('N', 'S', 'E', 'W')
  AND NOT EXISTS (
    SELECT 1 FROM streets_csv_source csv
    WHERE csv.city_county_id = si.city_county_id
      AND csv.street_canonical = si.street_canonical
  );
