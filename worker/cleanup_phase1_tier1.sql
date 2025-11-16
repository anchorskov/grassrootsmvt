-- Phase 1: TIER 1 Cleanup - Very High Confidence Malformed Records (98%+)
-- Removes 285 records with <2% risk

-- TIER 1.1: Leading spaces (47 records)
DELETE FROM streets_index 
WHERE rowid IN (
  SELECT si.rowid
  FROM streets_index si
  WHERE NOT EXISTS (
    SELECT 1 FROM streets_csv_source csv
    WHERE csv.city_county_id = si.city_county_id
      AND csv.street_canonical = si.street_canonical
  )
  AND street_core LIKE ' %'
);

-- TIER 1.2: Trailing spaces (10 records)
DELETE FROM streets_index 
WHERE rowid IN (
  SELECT si.rowid
  FROM streets_index si
  WHERE NOT EXISTS (
    SELECT 1 FROM streets_csv_source csv
    WHERE csv.city_county_id = si.city_county_id
      AND csv.street_canonical = si.street_canonical
  )
  AND street_core LIKE '% '
);

-- TIER 1.3: 3+ digit unit numbers in street_core (228 records)
DELETE FROM streets_index 
WHERE rowid IN (
  SELECT si.rowid
  FROM streets_index si
  WHERE NOT EXISTS (
    SELECT 1 FROM streets_csv_source csv
    WHERE csv.city_county_id = si.city_county_id
      AND csv.street_canonical = si.street_canonical
  )
  AND (street_core GLOB '*[0-9][0-9][0-9]*'
       OR street_core GLOB '*[0-9] [0-9][0-9] *'
       OR street_core GLOB '*[0-9] [0-9][0-9]')
  AND street_core NOT GLOB '[0-9]*' -- Exclude streets that START with numbers (like highway numbers)
);

-- Verify cleanup
SELECT 
  'Total records before' as status,
  17395 as count
UNION ALL
SELECT 
  'Records deleted' as status,
  17395 - COUNT(*) as count
FROM streets_index
UNION ALL
SELECT 
  'Total records after' as status,
  COUNT(*) as count
FROM streets_index
UNION ALL
SELECT 
  'Remaining extra records' as status,
  (SELECT COUNT(*) FROM streets_index si
   WHERE NOT EXISTS (
     SELECT 1 FROM streets_csv_source csv
     WHERE csv.city_county_id = si.city_county_id
       AND csv.street_canonical = si.street_canonical
   )) as count;
