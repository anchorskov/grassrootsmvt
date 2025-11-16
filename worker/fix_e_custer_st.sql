-- Fix: "E E CUSTER ST" should be "E CUSTER ST"
-- Issue: "E" duplicated in both street_prefix and street_core
-- Address: 1300 E E CUSTER ST (Albany County, Laramie)

UPDATE streets_index 
SET 
  street_core = 'CUSTER',
  street_canonical = 'E CUSTER ST'
WHERE 
  street_core = 'E CUSTER' 
  AND street_prefix = 'E'
  AND street_type = 'ST'
  AND raw_address = '1300 E E CUSTER ST';

-- Verify the update
SELECT 'After Update:' as status, street_prefix, street_core, street_type, street_canonical, raw_address 
FROM streets_index 
WHERE raw_address = '1300 E E CUSTER ST';
