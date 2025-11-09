-- 008_create_district_coverage.sql
-- Derived lookup table that maps each house/senate district to the counties/cities
-- observed in voters_addr_norm. Populated entirely from the SoS voter feed so we
-- can answer district coverage queries without scanning the voter table each time.

CREATE TABLE IF NOT EXISTS district_coverage (
  district_type TEXT NOT NULL CHECK(district_type IN ('house','senate')),
  district_code TEXT NOT NULL,
  county TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (district_type, district_code, county, city)
);

CREATE INDEX IF NOT EXISTS idx_district_coverage_type_code
  ON district_coverage (district_type, district_code);

CREATE INDEX IF NOT EXISTS idx_district_coverage_county_city
  ON district_coverage (county, city);

-- Helper to normalize district codes with zero padding where possible.
WITH house_codes AS (
  SELECT
    'house' AS district_type,
    CASE
      WHEN TRIM(va.house) GLOB '[0-9]*' AND TRIM(va.house) <> ''
        THEN printf('%02d', CAST(TRIM(va.house) AS INTEGER))
      ELSE UPPER(TRIM(va.house))
    END AS district_code,
    UPPER(TRIM(v.county)) AS county,
    UPPER(TRIM(COALESCE(va.city, ''))) AS city
  FROM voters_addr_norm va
  JOIN voters v ON v.voter_id = va.voter_id
  WHERE va.house IS NOT NULL AND TRIM(va.house) <> ''
  GROUP BY district_code, county, city
),
senate_codes AS (
  SELECT
    'senate' AS district_type,
    CASE
      WHEN TRIM(va.senate) GLOB '[0-9]*' AND TRIM(va.senate) <> ''
        THEN printf('%02d', CAST(TRIM(va.senate) AS INTEGER))
      ELSE UPPER(TRIM(va.senate))
    END AS district_code,
    UPPER(TRIM(v.county)) AS county,
    UPPER(TRIM(COALESCE(va.city, ''))) AS city
  FROM voters_addr_norm va
  JOIN voters v ON v.voter_id = va.voter_id
  WHERE va.senate IS NOT NULL AND TRIM(va.senate) <> ''
  GROUP BY district_code, county, city
)
INSERT OR IGNORE INTO district_coverage (district_type, district_code, county, city)
SELECT district_type, district_code, county, city FROM house_codes
UNION ALL
SELECT district_type, district_code, county, city FROM senate_codes;
