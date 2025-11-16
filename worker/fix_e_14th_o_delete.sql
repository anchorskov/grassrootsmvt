-- Fix: Delete E 14TH O ST (extra 'O' from unit suffix in street_core)
-- Correct version "E 14TH ST" already exists
-- Raw address: 3850 E 14TH ST O (unit 'O' should not be in street name)

DELETE FROM streets_index 
WHERE city_county_id = 135
  AND street_canonical = 'E 14TH O ST'
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = 135
      AND si2.street_canonical = 'E 14TH ST'
  );

-- Verify deletion
SELECT COUNT(*) as deleted_count 
FROM streets_index 
WHERE city_county_id = 135 
  AND street_canonical = 'E 14TH O ST';
