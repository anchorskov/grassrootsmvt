-- Fix: Delete FREDEN BLVD outlier record
-- Raw address: 1105 FREDEN BLVD # 732 (single occurrence with unit number)
-- This is an outlier that should not be in streets_index

DELETE FROM streets_index 
WHERE city_county_id = 137
  AND street_canonical = 'FREDEN BLVD'
  AND raw_address = '1105 FREDEN BLVD # 732';

-- Verify deletion
SELECT COUNT(*) as deleted_count 
FROM streets_index 
WHERE city_county_id = 137 
  AND street_canonical = 'FREDEN BLVD';
