-- Fix: Delete DEER TRAIL% (malformed with stray % character)
-- Correct version exists as street_core='DEER' street_type='TRAIL'

DELETE FROM streets_index 
WHERE city_county_id = 216
  AND street_canonical = 'DEER TRAIL%'
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = 216
      AND si2.street_core = 'DEER'
      AND si2.street_type = 'TRAIL'
  );

-- Verify deletion
SELECT COUNT(*) as deleted_count
FROM streets_index 
WHERE city_county_id = 216
  AND street_canonical = 'DEER TRAIL%';
