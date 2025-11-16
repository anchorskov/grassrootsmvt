-- Migration: Replace voter_contact_staging with proper structured schema
-- Date: 2025-11-16
-- Note: This drops existing test data (8 records)

-- Drop dependent views
DROP VIEW IF EXISTS voter_contact;
DROP VIEW IF EXISTS voter_contact_st;

-- Drop old table
DROP TABLE IF EXISTS voter_contact_staging;

-- Create new table with proper schema
CREATE TABLE voter_contact_staging (
  -- Primary key and metadata
  staging_id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL DEFAULT ('TEMP-00000000'),
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_by TEXT NOT NULL,
  vol_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'duplicate', 'rejected')),
  
  -- Search/matching fields
  search_county TEXT NOT NULL,
  search_city TEXT,
  search_street_name TEXT,
  search_house_number TEXT,
  
  -- Voter information
  fn TEXT NOT NULL,
  ln TEXT NOT NULL,
  middle_name TEXT,
  suffix TEXT,
  
  -- Address information
  addr1 TEXT NOT NULL,
  house_number TEXT,
  street_name TEXT,
  street_type TEXT,
  unit_number TEXT,
  city TEXT NOT NULL,
  county TEXT NOT NULL,
  state TEXT DEFAULT 'WY',
  zip TEXT,
  
  -- Contact information
  phone_e164 TEXT,
  phone_secondary TEXT,
  email TEXT,
  
  -- Political information
  political_party TEXT,
  voting_likelihood TEXT CHECK (voting_likelihood IN ('high', 'medium', 'low', 'unknown')),
  
  -- Interaction details
  contact_method TEXT CHECK (contact_method IN ('door', 'phone', 'event', 'referral', 'online')),
  interaction_notes TEXT,
  issues_interested TEXT,
  volunteer_notes TEXT,
  
  -- Verification fields
  potential_matches TEXT,
  verification_notes TEXT,
  verified_at DATETIME,
  verified_by TEXT,
  
  -- Integration tracking
  integrated_voter_id TEXT,
  needs_manual_review BOOLEAN DEFAULT FALSE,
  
  -- Audit trail
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_staging_search ON voter_contact_staging(search_county, search_city, search_street_name, search_house_number);
CREATE INDEX IF NOT EXISTS idx_staging_name ON voter_contact_staging(ln, fn);
CREATE INDEX IF NOT EXISTS idx_staging_status ON voter_contact_staging(status);
CREATE INDEX IF NOT EXISTS idx_staging_submitted ON voter_contact_staging(submitted_by, submitted_at);
CREATE INDEX IF NOT EXISTS idx_staging_location ON voter_contact_staging(county, city);
CREATE INDEX IF NOT EXISTS idx_staging_voter_id ON voter_contact_staging(voter_id);

-- Create triggers
CREATE TRIGGER IF NOT EXISTS update_staging_timestamp 
  AFTER UPDATE ON voter_contact_staging
  BEGIN
    UPDATE voter_contact_staging SET updated_at = CURRENT_TIMESTAMP WHERE staging_id = NEW.staging_id;
  END;

CREATE TRIGGER IF NOT EXISTS generate_voter_id
  AFTER INSERT ON voter_contact_staging
  WHEN NEW.voter_id = 'TEMP-00000000'
  BEGIN
    UPDATE voter_contact_staging 
    SET voter_id = 'TEMP-' || printf('%08d', NEW.staging_id)
    WHERE staging_id = NEW.staging_id;
  END;

-- Verify
SELECT 'Migration complete. New table created.' as status;
