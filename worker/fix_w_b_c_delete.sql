-- Fix: Delete W B C ST (extra 'C' in street_core)
-- Correct version "W B ST" already exists
-- Raw address: 222 W B C ST UNIT 122 ('C' likely from unit number)

DELETE FROM streets_index 
WHERE city_county_id = 135
  AND street_canonical = 'W B C ST'
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = 135
      AND si2.street_canonical = 'W B ST'
  );

-- Verify deletion
SELECT COUNT(*) as deleted_count 
FROM streets_index 
WHERE city_county_id = 135 
  AND street_canonical = 'W B C ST';
