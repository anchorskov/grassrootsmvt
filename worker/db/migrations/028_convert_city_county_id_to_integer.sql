-- Migration 028: Convert city_county_id from TEXT to INTEGER
-- Issue: city_county_id is TEXT but contains numeric values, while streets_index.city_county_id is INTEGER
-- Solution: Rebuild voters_addr_norm with INTEGER city_county_id and restore compatibility views.

-- Drop dependent views first so table swaps succeed on local or rebuilt databases.
DROP VIEW IF EXISTS city_county;
DROP VIEW IF EXISTS v_voters_addr_norm;

PRAGMA foreign_keys = OFF;

-- Rebuild voters_addr_norm.city_county_id as INTEGER.
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

-- Recreate indexes and dependent views.
CREATE INDEX idx_voters_addr_norm_city ON voters_addr_norm(city);
CREATE INDEX idx_voters_addr_norm_street_index_id ON voters_addr_norm(street_index_id);
CREATE INDEX idx_voters_addr_norm_city_county_id ON voters_addr_norm(city_county_id);
CREATE INDEX IF NOT EXISTS idx_streets_index_city_county ON streets_index(city_county_id);

CREATE VIEW IF NOT EXISTS city_county AS
SELECT id,
       COALESCE(city_norm, city) AS city,
       COALESCE(county_norm, county) AS county
FROM wy_city_county;

CREATE VIEW IF NOT EXISTS v_voters_addr_norm AS
SELECT
  van.*,
  wcc.city_norm AS city_resolved,
  wcc.county_norm AS county_resolved
FROM voters_addr_norm AS van
LEFT JOIN wy_city_county AS wcc
  ON wcc.id = van.city_county_id;

PRAGMA foreign_keys = ON;
