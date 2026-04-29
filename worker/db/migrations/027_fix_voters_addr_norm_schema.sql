-- Migration 027: Fix voters_addr_norm duplicate street_index_id column
-- Issue: voters_addr_norm had two definitions of street_index_id
-- Solution: Recreate table with corrected schema (single street_index_id column)

-- Temporarily disable foreign key constraints for migration
PRAGMA foreign_keys = OFF;

-- Create corrected voters_addr_norm table
CREATE TABLE voters_addr_norm_fixed (
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

-- Migrate all data from old table to new table
INSERT INTO voters_addr_norm_fixed
SELECT voter_id, addr1, city, senate, house, city_county_id, 
       street_index_id, addr_raw, fn, ln, zip
FROM voters_addr_norm;

-- Drop old table
DROP TABLE voters_addr_norm;

-- Rename fixed table to original name
ALTER TABLE voters_addr_norm_fixed RENAME TO voters_addr_norm;

-- Recreate indexes
CREATE INDEX idx_voters_addr_norm_city ON voters_addr_norm(city);
CREATE INDEX idx_voters_addr_norm_street_index_id ON voters_addr_norm(street_index_id);
CREATE INDEX idx_voters_addr_norm_city_county_id ON voters_addr_norm(city_county_id);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;
