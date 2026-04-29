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

-- Note: Population of district_coverage from voters/voters_addr_norm
-- is deferred until both tables are created and populated in later migrations
