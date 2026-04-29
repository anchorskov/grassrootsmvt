-- Migration 028: Convert city_county_id from TEXT to INTEGER
-- Issue: city_county_id is TEXT but contains numeric values, while streets_index.city_county_id is INTEGER
-- Solution: Convert both wy_city_county.id and voters_addr_norm.city_county_id to INTEGER

-- Step 1: Convert wy_city_county
CREATE TABLE wy_city_county_fixed (
  id INTEGER PRIMARY KEY,
  city TEXT NOT NULL,
  county TEXT NOT NULL,
  state TEXT DEFAULT 'WY'
);

INSERT INTO wy_city_county_fixed
SELECT CAST(id AS INTEGER), city, county, state
FROM wy_city_county;

DROP TABLE wy_city_county;
ALTER TABLE wy_city_county_fixed RENAME TO wy_city_county;

-- Step 2: Convert voters_addr_norm.city_county_id
CREATE TABLE voters_addr_norm_fixed (
  voter_id TEXT PRIMARY KEY,
  addr1 TEXT,
  city TEXT NOT NULL,
  senate TEXT,
  house TEXT,
  city_county_id INTEGER NOT NULL REFERENCES wy_city_county(id),
  street_index_id INTEGER REFERENCES streets_index(id),
  addr_raw TEXT,
  fn TEXT,
  ln TEXT,
  zip TEXT
);

INSERT INTO voters_addr_norm_fixed
SELECT voter_id, addr1, city, senate, house, CAST(city_county_id AS INTEGER), 
       street_index_id, addr_raw, fn, ln, zip
FROM voters_addr_norm;

DROP TABLE voters_addr_norm;
ALTER TABLE voters_addr_norm_fixed RENAME TO voters_addr_norm;

-- Step 3: Recreate indexes
CREATE INDEX idx_voters_addr_norm_city ON voters_addr_norm(city);
CREATE INDEX idx_voters_addr_norm_street_index_id ON voters_addr_norm(street_index_id);
CREATE INDEX idx_voters_addr_norm_city_county_id ON voters_addr_norm(city_county_id);
CREATE INDEX idx_streets_index_city_county ON streets_index(city_county_id);
