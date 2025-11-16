-- Fix: Remove duplicate "E E CUSTER ST" record
-- Issue: "E CUSTER ST" already exists, so delete the malformed "E E CUSTER ST" version
-- Address: 1300 E E CUSTER ST (Albany County, Laramie)

DELETE FROM streets_index 
WHERE 
  street_core = 'E CUSTER' 
  AND street_prefix = 'E'
  AND street_type = 'ST'
  AND raw_address = '1300 E E CUSTER ST';

-- Verify the deletion
SELECT 'Remaining records:' as status, COUNT(*) as count
FROM streets_index 
WHERE raw_address = '1300 E E CUSTER ST';
