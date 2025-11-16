-- Fix: Delete E 18TH 1024 ST (unit number embedded in street_canonical)
-- Correct version "E 18TH ST" already exists
-- Raw address: 3840 E 18TH ST 1024 (unit 1024 should not be in street name)

DELETE FROM streets_index 
WHERE city_county_id = 135
  AND street_canonical = 'E 18TH 1024 ST'
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = 135
      AND si2.street_canonical = 'E 18TH ST'
  );

-- Verify deletion
SELECT COUNT(*) as deleted_count 
FROM streets_index 
WHERE city_county_id = 135 
  AND street_canonical = 'E 18TH 1024 ST';
