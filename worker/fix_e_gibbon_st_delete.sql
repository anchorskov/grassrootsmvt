-- Fix: Remove duplicate "E E GIBBON ST" record
-- Issue: "E GIBBON ST" already exists, so delete the malformed "E E GIBBON ST" version
-- Address: 809 E E GIBBON ST (Albany County, Laramie)

DELETE FROM streets_index 
WHERE 
  street_core = 'E GIBBON' 
  AND street_prefix = 'E'
  AND street_type = 'ST'
  AND raw_address = '809 E E GIBBON ST';

-- Verify the deletion
SELECT 'Remaining records:' as status, COUNT(*) as count
FROM streets_index 
WHERE raw_address = '809 E E GIBBON ST';
