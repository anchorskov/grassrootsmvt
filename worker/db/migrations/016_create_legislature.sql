-- Migration: Create legislature table for Wyoming state legislature members
-- Path: worker/db/migrations/016_create_legislature.sql
-- Created: 2025-12-02
-- Purpose: Store Wyoming state legislature members with contact and chamber information

CREATE TABLE IF NOT EXISTS legislature (
  voter_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  chamber TEXT NOT NULL,
  district INTEGER,
  city TEXT,
  county TEXT,
  party TEXT,
  affiliations TEXT,
  campaign_website TEXT,
  official_profile_url TEXT,
  phone TEXT,
  email TEXT NOT NULL,
  updated TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_legislature_chamber ON legislature(chamber);
CREATE INDEX IF NOT EXISTS idx_legislature_party ON legislature(party);
CREATE INDEX IF NOT EXISTS idx_legislature_district ON legislature(district);
CREATE INDEX IF NOT EXISTS idx_legislature_email ON legislature(email);
CREATE INDEX IF NOT EXISTS idx_legislature_county ON legislature(county);

-- Sample data comment (93 records total: 62 House, 31 Senate)
-- Loaded from wy_legislature_12-1-25.csv.csv
-- Data completeness:
--   Names: 100% (93/93)
--   Emails: 100% (93/93)  
--   Phone: 99% (92/93 - 1 missing from source)
--   Affiliations: 67% (62/93)
--   Campaign Website: 3% (3/93)
-- Party distribution: 85 R, 8 D
