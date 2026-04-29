-- Migration 022: Add voter data normalization and archival tables

-- Table for raw voter import data
CREATE TABLE voters_raw (
  voter_id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  ra_city TEXT,
  ra_zip TEXT,
  county TEXT,
  precinct TEXT,
  house TEXT,
  senate TEXT
);

-- Table for normalized voter records
CREATE TABLE voters_norm (
  voter_id TEXT PRIMARY KEY,
  party_form5 TEXT,
  reg_year INTEGER
);

-- Archive table for legacy phone lookups
CREATE TABLE IF NOT EXISTS "v_best_phone_old" (
  voter_id TEXT PRIMARY KEY,
  phone_e164 TEXT
);

-- Streets index archive (if needed for legacy code)
CREATE TABLE IF NOT EXISTS "streets_index_old" (
  city_county_id INTEGER NOT NULL,
  street_prefix TEXT,
  street_core TEXT NOT NULL,
  street_type TEXT,
  street_suffix TEXT,
  street_canonical TEXT NOT NULL,
  raw_address TEXT
);
