-- Fix: Delete numbered street records with embedded unit suffixes in street_core
-- For city_county_id 1 (Albany/Laramie): N 14TH A/B/D ST and S 14TH 1/2 ST
-- Clean versions "N 14TH ST" and "S 14TH ST" already exist

DELETE FROM streets_index 
WHERE city_county_id = 1
  AND street_type = 'ST'
  AND street_canonical IN ('N 14TH A ST', 'N 14TH B ST', 'N 14TH D ST', 'S 14TH 1/2 ST')
  AND EXISTS (
    SELECT 1 FROM streets_index si2 
    WHERE si2.city_county_id = 1
      AND si2.street_prefix = streets_index.street_prefix
      AND si2.street_core = CASE 
        WHEN streets_index.street_core LIKE '14TH%' THEN '14TH'
        ELSE streets_index.street_core
      END
      AND si2.street_type = 'ST'
  );

-- Verify deletion
SELECT COUNT(*) as deleted_count 
FROM streets_index 
WHERE city_county_id = 1 
  AND street_canonical IN ('N 14TH A ST', 'N 14TH B ST', 'N 14TH D ST', 'S 14TH 1/2 ST');
