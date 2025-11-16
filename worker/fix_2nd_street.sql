-- Fix: " 2 ND ST" should be "2ND"
-- Issue: Space in street_core "2 ND ST" should be "2ND"
-- Address: 402 1/2 N 2 ND ST (Sheridan County)

UPDATE streets_index 
SET 
  street_core = '2ND',
  street_canonical = 'N 2ND ST'
WHERE 
  street_core = ' 2 ND ST' 
  AND street_prefix = 'N'
  AND raw_address = '402 1/2 N 2 ND ST';

-- Verify the update
SELECT 'After Update:' as status, street_prefix, street_core, street_type, street_canonical, raw_address 
FROM streets_index 
WHERE raw_address = '402 1/2 N 2 ND ST';
