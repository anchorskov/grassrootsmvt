-- Export query for 2,917 extra records
-- Save results for manual review
SELECT 
  si.city_county_id,
  si.street_prefix,
  si.street_core,
  si.street_type,
  si.street_suffix,
  si.street_canonical,
  si.raw_address,
  CASE 
    WHEN si.street_canonical != UPPER(si.street_canonical) THEN 'Mixed Case'
    WHEN si.street_canonical LIKE 'STATE HWY%' OR si.street_canonical LIKE 'US HWY%' OR si.street_canonical LIKE 'HIGHWAY%' OR si.street_canonical LIKE 'ROAD [0-9]%' THEN 'Highway/Road Route'
    WHEN si.street_core GLOB '*TH [A-Z]' OR si.street_canonical GLOB '* [A-Z] ST' OR si.street_canonical GLOB '* [A-Z] AVE' THEN 'Letter Suffix Unit'
    ELSE 'Clean Looking'
  END as suggested_category
FROM streets_index si
WHERE NOT EXISTS (
  SELECT 1 FROM streets_csv_source csv
  WHERE csv.city_county_id = si.city_county_id
    AND csv.street_canonical = si.street_canonical
)
ORDER BY suggested_category, si.city_county_id, si.street_canonical;
