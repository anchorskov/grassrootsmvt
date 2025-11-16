-- Fix: Delete E 15TH ST records with embedded unit numbers
-- Correct version "E 15TH ST" already exists for city_county_id 135
-- Malformed records: E 15TH 103 ST, E 15TH 402 ST, E 15TH 504 ST, E 15TH 521 ST, E 15TH 610 ST

DELETE FROM streets_index 
WHERE city_county_id = 135
  AND street_prefix = 'E'
  AND street_type = 'ST'
  AND street_canonical IN ('E 15TH 103 ST', 'E 15TH 402 ST', 'E 15TH 504 ST', 'E 15TH 521 ST', 'E 15TH 610 ST')
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = 135
      AND si2.street_canonical = 'E 15TH ST'
  );

-- Verify deletion
SELECT COUNT(*) as deleted_count 
FROM streets_index 
WHERE city_county_id = 135 
  AND street_canonical LIKE 'E 15TH % ST'
  AND street_canonical != 'E 15TH ST';
