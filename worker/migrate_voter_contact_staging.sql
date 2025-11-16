-- Migration: Upgrade voter_contact_staging from simple JSON schema to structured columns
-- Date: 2025-11-16

-- Step 0: Drop dependent views
DROP VIEW IF EXISTS voter_contact;
DROP VIEW IF EXISTS voter_contact_st;

-- Step 1: Rename old table
ALTER TABLE voter_contact_staging RENAME TO voter_contact_staging_old;

-- Step 2: Create new table with proper schema
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

-- Step 3: Migrate existing data from JSON format
INSERT INTO voter_contact_staging (
  staging_id, voter_id, submitted_at, submitted_by, vol_email,
  search_county, search_city, search_street_name, search_house_number,
  fn, ln, middle_name, suffix,
  addr1, house_number, street_name, unit_number,
  city, county, state, zip,
  phone_e164, email,
  political_party, voting_likelihood,
  contact_method, interaction_notes, issues_interested, volunteer_notes,
  potential_matches, created_at
)
SELECT 
  id as staging_id,
  voter_id,
  ts as submitted_at,
  COALESCE(json_extract(json, '$.submitted_by'), json_extract(json, '$.volunteer'), 'unknown') as submitted_by,
  COALESCE(json_extract(json, '$.vol_email'), json_extract(json, '$.volunteer'), 'unknown') as vol_email,
  json_extract(json, '$.county') as search_county,
  json_extract(json, '$.city') as search_city,
  json_extract(json, '$.streetName') as search_street_name,
  json_extract(json, '$.houseNumber') as search_house_number,
  json_extract(json, '$.firstName') as fn,
  json_extract(json, '$.lastName') as ln,
  json_extract(json, '$.middleName') as middle_name,
  json_extract(json, '$.suffix') as suffix,
  json_extract(json, '$.fullAddress') as addr1,
  json_extract(json, '$.houseNumber') as house_number,
  json_extract(json, '$.streetName') as street_name,
  json_extract(json, '$.unitNumber') as unit_number,
  json_extract(json, '$.city') as city,
  json_extract(json, '$.county') as county,
  'WY' as state,
  json_extract(json, '$.zipCode') as zip,
  json_extract(json, '$.phonePrimary') as phone_e164,
  json_extract(json, '$.email') as email,
  json_extract(json, '$.estimatedParty') as political_party,
  json_extract(json, '$.votingLikelihood') as voting_likelihood,
  json_extract(json, '$.contactMethod') as contact_method,
  json_extract(json, '$.interactionNotes') as interaction_notes,
  json_extract(json, '$.issuesInterested') as issues_interested,
  json_extract(json, '$.volunteerNotes') as volunteer_notes,
  json_extract(json, '$.potentialMatches') as potential_matches,
  ts as created_at
FROM voter_contact_staging_old
WHERE json_extract(json, '$.county') IS NOT NULL
  AND json_extract(json, '$.city') IS NOT NULL
  AND json_extract(json, '$.firstName') IS NOT NULL
  AND json_extract(json, '$.lastName') IS NOT NULL
  AND json_extract(json, '$.fullAddress') IS NOT NULL;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_staging_search ON voter_contact_staging(search_county, search_city, search_street_name, search_house_number);
CREATE INDEX IF NOT EXISTS idx_staging_name ON voter_contact_staging(ln, fn);
CREATE INDEX IF NOT EXISTS idx_staging_status ON voter_contact_staging(status);
CREATE INDEX IF NOT EXISTS idx_staging_submitted ON voter_contact_staging(submitted_by, submitted_at);
CREATE INDEX IF NOT EXISTS idx_staging_location ON voter_contact_staging(county, city);
CREATE INDEX IF NOT EXISTS idx_staging_voter_id ON voter_contact_staging(voter_id);

-- Step 5: Create triggers
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

-- Step 6: Drop old table
DROP TABLE voter_contact_staging_old;

-- Verify migration
SELECT 'Migration complete. Records migrated:' as status, COUNT(*) as count FROM voter_contact_staging;
