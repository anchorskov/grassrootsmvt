-- Fix: Remove duplicate "E E PAVILLION RD" record
-- Issue: "E PAVILLION RD" already exists, delete the malformed version
-- Address: 332 E E PAVILLION RD (Sheridan County, city_county_id 73)

DELETE FROM streets_index 
WHERE 
  street_core = 'E PAVILLION' 
  AND street_prefix = 'E'
  AND street_type = 'RD'
  AND raw_address = '332 E E PAVILLION RD';

-- Verify
SELECT 'Remaining:' as status, COUNT(*) as count
FROM streets_index 
WHERE raw_address = '332 E E PAVILLION RD';
