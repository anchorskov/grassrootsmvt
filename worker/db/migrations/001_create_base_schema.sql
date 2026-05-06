-- Migration: Create base schema - voters, addresses, and city/county lookup
-- Path: worker/db/migrations/001_create_base_schema.sql
-- Purpose: Establish core voter and address tables
-- Note: voters table created here with minimal schema, will be refined in migration 017

-- Create voters base table (minimal schema to avoid conflicts)
CREATE TABLE IF NOT EXISTS voters (
  voter_id TEXT PRIMARY KEY
);

-- Create city/county lookup table
CREATE TABLE IF NOT EXISTS wy_city_county (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  county TEXT NOT NULL,
  state TEXT DEFAULT 'WY'
);

-- Create streets index for address normalization
CREATE TABLE IF NOT EXISTS streets_index (
  id INTEGER PRIMARY KEY,
  city_county_id INTEGER NOT NULL REFERENCES wy_city_county(id),
  street_prefix TEXT,
  street_core TEXT NOT NULL,
  street_type TEXT,
  street_suffix TEXT,
  street_canonical TEXT NOT NULL,
  raw_address TEXT
);

-- Create tmp_voter_street mapping table
CREATE TABLE IF NOT EXISTS tmp_voter_street (
  voter_id TEXT PRIMARY KEY REFERENCES voters(voter_id),
  streets_index_id INTEGER REFERENCES streets_index(id)
);

-- Create voters_addr_norm table for canonical address data
CREATE TABLE IF NOT EXISTS voters_addr_norm (
  voter_id TEXT PRIMARY KEY,
  addr1 TEXT,
  city TEXT NOT NULL,
  senate TEXT,
  house TEXT,
  city_county_id TEXT NOT NULL REFERENCES wy_city_county(id),
  street_index_id INTEGER REFERENCES streets_index(id),
  addr_raw TEXT,
  fn TEXT,
  ln TEXT,
  zip TEXT
);

-- Create voter_phones table
CREATE TABLE IF NOT EXISTS voter_phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL REFERENCES voters(voter_id),
  phone_number TEXT NOT NULL,
  phone_type TEXT,
  is_primary INTEGER DEFAULT 0
);

-- Create best_phone view for voter phone lookups
CREATE VIEW IF NOT EXISTS v_best_phone AS
SELECT 
  voter_id,
  phone_number,
  phone_type
FROM voter_phones
WHERE is_primary = 1
OR (
  voter_id IN (
    SELECT voter_id FROM voter_phones 
    GROUP BY voter_id 
    HAVING COUNT(*) = 1
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_voters_addr_norm_city ON voters_addr_norm(city);
CREATE INDEX IF NOT EXISTS idx_voter_phones_voter_id ON voter_phones(voter_id);
CREATE INDEX IF NOT EXISTS idx_streets_index_city_county ON streets_index(city_county_id);
