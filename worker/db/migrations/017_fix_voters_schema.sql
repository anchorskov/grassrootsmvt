-- Migration 017: Align voters table schema to match remote production
-- Remote has minimal voters table with 5 columns:
-- voter_id, political_party, county, senate, house
-- 
-- LOCAL migration 001 created voters with just voter_id.
-- This migration adds the remaining columns to match remote schema.

-- Add columns to voters table (may already exist from earlier migrations)
ALTER TABLE voters ADD COLUMN political_party TEXT;
ALTER TABLE voters ADD COLUMN county TEXT;
ALTER TABLE voters ADD COLUMN senate TEXT;
ALTER TABLE voters ADD COLUMN house TEXT;

-- Create indexes as per remote schema
CREATE INDEX IF NOT EXISTS idx_voters_county ON voters(county);
CREATE INDEX IF NOT EXISTS idx_voters_party ON voters(political_party);
CREATE INDEX IF NOT EXISTS idx_voters_house ON voters(house);
CREATE INDEX IF NOT EXISTS idx_voters_senate ON voters(senate);
CREATE INDEX IF NOT EXISTS idx_voters_county_house ON voters(county, house);
CREATE INDEX IF NOT EXISTS idx_voters_county_senate ON voters(county, senate);
