-- TIER 3 Analysis: Categorize remaining 2,917 records
-- Breaking into separate queries due to D1 UNION ALL limits

-- Category 1: Mixed case (cosmetic fix)
SELECT 
  '1. Mixed Case' as category,
  COUNT(*) as count,
  '100% formatting' as confidence,
  'Safe to uppercase or delete' as action
FROM streets_index si
WHERE NOT EXISTS (
  SELECT 1 FROM streets_csv_source csv 
  WHERE csv.city_county_id = si.city_county_id 
    AND csv.street_canonical = si.street_canonical
)
AND street_canonical != UPPER(street_canonical);

-- Category 2: Embedded unit numbers (E BAKER 1 ST, WYOMING 13 AVE)
SELECT 
  '2. Unit Numbers in Name' as category,
  COUNT(*) as count,
  '95% malformed' as confidence,
  'Delete - unit parsed as street' as action
FROM streets_index si
WHERE NOT EXISTS (
  SELECT 1 FROM streets_csv_source csv 
  WHERE csv.city_county_id = si.city_county_id 
    AND csv.street_canonical = si.street_canonical
)
AND street_canonical = UPPER(street_canonical)
AND (street_canonical LIKE '% [0-9] %' OR street_canonical LIKE '% [0-9]/%');

-- Category 3: Highway/Road routes (STATE HWY 34, ROAD 5)
SELECT 
  '3. Highway/Road Routes' as category,
  COUNT(*) as count,
  '80% legitimate' as confidence,
  'Keep - valid numbered routes' as action
FROM streets_index si
WHERE NOT EXISTS (
  SELECT 1 FROM streets_csv_source csv 
  WHERE csv.city_county_id = si.city_county_id 
    AND csv.street_canonical = si.street_canonical
)
AND street_canonical = UPPER(street_canonical)
AND (street_canonical LIKE 'STATE HWY%' 
     OR street_canonical LIKE 'US HWY%' 
     OR street_canonical LIKE 'HIGHWAY%' 
     OR street_canonical LIKE 'ROAD [0-9]%');

-- Category 4: Letter suffixes (N 10TH A ST, S 11TH C ST)
SELECT 
  '4. Letter Suffix Units' as category,
  COUNT(*) as count,
  '90% unit letters' as confidence,
  'Delete - apartment/unit letters' as action
FROM streets_index si
WHERE NOT EXISTS (
  SELECT 1 FROM streets_csv_source csv 
  WHERE csv.city_county_id = si.city_county_id 
    AND csv.street_canonical = si.street_canonical
)
AND street_canonical = UPPER(street_canonical)
AND (street_core GLOB '*TH [A-Z]' 
     OR street_canonical GLOB '* [A-Z] ST' 
     OR street_canonical GLOB '* [A-Z] AVE')
AND street_canonical NOT LIKE 'STATE HWY%'
AND street_canonical NOT LIKE 'ROAD%';

-- Category 5: Clean appearance (GRAND AVE, EVANS ST, ARROWHEAD LN)
SELECT 
  '5. Clean Looking Records' as category,
  COUNT(*) as count,
  '50% legitimate' as confidence,
  'Manual review needed' as action
FROM streets_index si
WHERE NOT EXISTS (
  SELECT 1 FROM streets_csv_source csv 
  WHERE csv.city_county_id = si.city_county_id 
    AND csv.street_canonical = si.street_canonical
)
AND street_canonical = UPPER(street_canonical)
AND street_canonical NOT LIKE '% [0-9] %'
AND street_canonical NOT LIKE '% [0-9]/%'
AND street_canonical NOT LIKE 'STATE HWY%'
AND street_canonical NOT LIKE 'US HWY%'
AND street_canonical NOT LIKE 'HIGHWAY%'
AND street_canonical NOT LIKE 'ROAD [0-9]%'
AND NOT (street_core GLOB '*TH [A-Z]' 
         OR street_canonical GLOB '* [A-Z] ST' 
         OR street_canonical GLOB '* [A-Z] AVE');
