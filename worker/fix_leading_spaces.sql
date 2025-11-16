-- Fix: Remove all street_core records with leading spaces where trimmed version exists
-- These are duplicates caused by address parsing issues (typically from addresses with "1/2")

DELETE FROM streets_index 
WHERE street_core LIKE ' %'
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = streets_index.city_county_id 
    AND si2.street_prefix = streets_index.street_prefix
    AND si2.street_type = streets_index.street_type
    AND si2.street_core = TRIM(streets_index.street_core)
  );

-- Verify - count remaining leading spaces
SELECT 'Remaining leading spaces:' as status, COUNT(*) as count
FROM streets_index 
WHERE street_core LIKE ' %';
