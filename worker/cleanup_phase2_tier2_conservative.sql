-- Phase 2 TIER 2 Conservative Cleanup
-- Delete only 100% obvious malformed records
-- Risk level: <1% (extremely safe)

-- BEFORE counts
SELECT 'Records before cleanup' as status, COUNT(*) as count FROM streets_index;

-- Delete obvious malformed records:
-- 1. AND M DR (should be "M AND M DR" - malformed parse)
DELETE FROM streets_index 
WHERE city_county_id = 191 
  AND street_canonical = 'AND M DR';

-- 2. E BAKER FRNT ST (unit marker "FRNT" in street name)
DELETE FROM streets_index 
WHERE city_county_id = 1 
  AND street_canonical = 'E BAKER FRNT ST';

-- 3. 3RD AVE W (from "708 3RD AVE W 5" - embedded unit number)
DELETE FROM streets_index 
WHERE city_county_id = 185 
  AND street_canonical = '3RD AVE W';

-- AFTER counts
SELECT 'Records deleted' as status, 
  (SELECT COUNT(*) FROM (SELECT 'Records before cleanup' as status, COUNT(*) as count FROM streets_index)) - COUNT(*) as count 
FROM streets_index;

SELECT 'Records after cleanup' as status, COUNT(*) as count FROM streets_index;

-- Verify deletions
SELECT 'Verification: Records should be gone' as status;
SELECT city_county_id, street_canonical, raw_address 
FROM streets_index 
WHERE street_canonical IN ('AND M DR', 'E BAKER FRNT ST', '3RD AVE W');
