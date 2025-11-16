-- Progressive search queries for duplicate detection
-- These queries implement the county -> city -> street -> number search flow

-- 1. COUNTY LEVEL: Get all counties for dropdown
SELECT DISTINCT county 
FROM voters 
ORDER BY county;

-- 2. CITY LEVEL: Get cities in selected county
SELECT DISTINCT a.city 
FROM v_voters_addr_norm a 
JOIN voters v ON a.voter_id = v.voter_id 
WHERE v.county = :selected_county 
ORDER BY a.city;

-- 3. STREET LEVEL: Get street names in selected county/city
SELECT DISTINCT 
  TRIM(REPLACE(REPLACE(addr1, house, ''), '  ', ' ')) as street_name,
  COUNT(*) as voter_count
FROM v_voters_addr_norm a 
JOIN voters v ON a.voter_id = v.voter_id 
WHERE v.county = :selected_county 
  AND a.city = :selected_city
  AND addr1 IS NOT NULL
GROUP BY street_name
HAVING street_name != ''
ORDER BY voter_count DESC, street_name;

-- 4. HOUSE NUMBER LEVEL: Check specific address
SELECT 
  v.voter_id,
  a.fn as first_name,
  a.ln as last_name,
  a.addr1,
  a.city,
  v.political_party,
  p.phone_e164
FROM voters v
JOIN v_voters_addr_norm a ON v.voter_id = a.voter_id
LEFT JOIN best_phone p ON v.voter_id = p.voter_id
WHERE v.county = :selected_county
  AND a.city = :selected_city
  AND (
    a.addr1 LIKE :house_number || ' ' || :street_name || '%'
    OR a.addr1 LIKE :house_number || :street_name || '%'
  )
ORDER BY a.addr1;

-- 5. NAME FUZZY SEARCH: Find similar names in area (fallback)
SELECT 
  v.voter_id,
  a.fn as first_name,
  a.ln as last_name,
  a.addr1,
  a.city,
  v.political_party,
  p.phone_e164,
  -- Similarity scoring (basic)
  CASE 
    WHEN UPPER(a.ln) = UPPER(:last_name) AND UPPER(a.fn) = UPPER(:first_name) THEN 100
    WHEN UPPER(a.ln) = UPPER(:last_name) AND UPPER(SUBSTR(a.fn, 1, 1)) = UPPER(SUBSTR(:first_name, 1, 1)) THEN 80
    WHEN UPPER(a.ln) = UPPER(:last_name) THEN 60
    WHEN UPPER(a.fn) = UPPER(:first_name) AND UPPER(a.ln) LIKE UPPER(:last_name) || '%' THEN 70
    ELSE 40
  END as match_score
FROM voters v
JOIN v_voters_addr_norm a ON v.voter_id = a.voter_id
LEFT JOIN best_phone p ON v.voter_id = p.voter_id
WHERE v.county = :selected_county
  AND (
    UPPER(a.ln) LIKE UPPER(:last_name) || '%'
    OR UPPER(a.fn) LIKE UPPER(:first_name) || '%'
    OR UPPER(a.ln) LIKE '%' || UPPER(:last_name) || '%'
  )
ORDER BY match_score DESC, a.ln, a.fn
LIMIT 10;