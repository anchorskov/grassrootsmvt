-- Migration 025: Add v_best_phone table and city_county view for remote schema compatibility

-- Create v_best_phone table (phone lookup optimization table) 
-- Drop existing view first (migration 001 creates it as a view)
DROP VIEW IF EXISTS v_best_phone;

CREATE TABLE IF NOT EXISTS v_best_phone (
  voter_id TEXT PRIMARY KEY,
  phone_e164 TEXT,
  confidence_code INTEGER,
  is_wy_area INTEGER,
  imported_at TEXT
);

-- Create indexes on v_best_phone table
CREATE INDEX IF NOT EXISTS idx_v_best_phone_phone ON v_best_phone(phone_e164);
CREATE INDEX IF NOT EXISTS idx_phone_voter_id ON v_best_phone(voter_id);

-- View: best_phone - simplified phone lookup (maps to v_best_phone table)
DROP VIEW IF EXISTS best_phone;
CREATE VIEW IF NOT EXISTS best_phone AS
SELECT voter_id, phone_e164, confidence_code, is_wy_area, imported_at
FROM v_best_phone;

-- View: city_county - normalized city/county lookup
DROP VIEW IF EXISTS city_county;
CREATE VIEW IF NOT EXISTS city_county AS
SELECT id, city_norm AS city, county_norm AS county
FROM wy_city_county;

-- View: v_street_keys - street index lookup (simple version)
DROP VIEW IF EXISTS v_street_keys;
CREATE VIEW IF NOT EXISTS v_street_keys AS 
SELECT city_county_id, street_canonical FROM streets_index;
