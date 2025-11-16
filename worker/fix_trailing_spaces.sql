-- Fix: Remove all street_core records with trailing spaces where trimmed version exists

DELETE FROM streets_index 
WHERE street_core LIKE '% '
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = streets_index.city_county_id 
    AND si2.street_prefix = streets_index.street_prefix
    AND si2.street_type = streets_index.street_type
    AND si2.street_core = TRIM(streets_index.street_core)
  );

-- Verify
SELECT 'Remaining trailing spaces:' as status, COUNT(*) as count
FROM streets_index 
WHERE street_core LIKE '% ';
