-- Migration 026: Update wy_city_county schema to match remote
-- Remote uses: id INTEGER PRIMARY KEY, city_norm, county_norm (and no state field)
-- LOCAL uses: id TEXT PRIMARY KEY, city, county, state
-- Gracefully handles both empty and populated tables

-- Add missing columns to wy_city_county
ALTER TABLE wy_city_county ADD COLUMN city_norm TEXT;
ALTER TABLE wy_city_county ADD COLUMN county_norm TEXT;
ALTER TABLE wy_city_county ADD COLUMN city_raw TEXT;
ALTER TABLE wy_city_county ADD COLUMN county_raw TEXT;

-- Populate new normalized columns from existing city/county
UPDATE wy_city_county SET city_norm = city WHERE city_norm IS NULL;
UPDATE wy_city_county SET county_norm = county WHERE county_norm IS NULL;
UPDATE wy_city_county SET city_raw = city WHERE city_raw IS NULL;
UPDATE wy_city_county SET county_raw = county WHERE county_raw IS NULL;

-- Recreate indexes
DROP INDEX IF EXISTS idx_city_county_norm;
CREATE UNIQUE INDEX idx_city_county_norm ON wy_city_county(city_norm, county_norm);
