-- Staging table for volunteer-submitted voter contacts
-- This table captures new voter information that needs verification before integration

CREATE TABLE IF NOT EXISTS voter_contact_staging (
  -- Primary key and metadata
  staging_id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL DEFAULT ('TEMP-00000000'), -- Our temp voter_id for project flow
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_by TEXT NOT NULL, -- volunteer email/id
  vol_email TEXT NOT NULL, -- volunteer email who submitted the data
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'duplicate', 'rejected')),
  
  -- Search/matching fields (used for duplicate detection)
  search_county TEXT NOT NULL,
  search_city TEXT,
  search_street_name TEXT,
  search_house_number TEXT,
  
  -- Full voter information (matching existing schema field names)
  fn TEXT NOT NULL, -- first_name (matches v_voters_addr_norm.fn)
  ln TEXT NOT NULL, -- last_name (matches v_voters_addr_norm.ln)
  middle_name TEXT,
  suffix TEXT, -- Jr, Sr, III, etc.
  
  -- Address information (matching existing schema field names)
  addr1 TEXT NOT NULL, -- full_address (matches v_voters_addr_norm.addr1)
  house_number TEXT,
  street_name TEXT,
  street_type TEXT, -- St, Ave, Dr, etc.
  unit_number TEXT,
  city TEXT NOT NULL, -- matches v_voters_addr_norm.city
  county TEXT NOT NULL, -- matches voters.county
  state TEXT DEFAULT 'WY', -- matches v_voters_addr_norm.state
  zip TEXT, -- matches v_voters_addr_norm.zip
  
  -- Contact information (matching existing schema field names)
  phone_e164 TEXT, -- primary phone (matches v_best_phone.phone_e164)
  phone_secondary TEXT,
  email TEXT,
  
  -- Political information (matching existing schema field names)
  political_party TEXT, -- estimated party (matches voters.political_party)
  voting_likelihood TEXT CHECK (voting_likelihood IN ('high', 'medium', 'low', 'unknown')),
  
  -- Interaction details
  contact_method TEXT CHECK (contact_method IN ('door', 'phone', 'event', 'referral', 'online')),
  interaction_notes TEXT,
  issues_interested TEXT, -- JSON or comma-separated
  volunteer_notes TEXT,
  
  -- Verification fields
  potential_matches TEXT, -- JSON array of potential voter_ids from existing data
  verification_notes TEXT,
  verified_at DATETIME,
  verified_by TEXT,
  
  -- Integration tracking
  integrated_voter_id TEXT, -- if matched to existing voter
  needs_manual_review BOOLEAN DEFAULT FALSE,
  
  -- Audit trail
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance (using aligned field names)
CREATE INDEX IF NOT EXISTS idx_staging_search ON voter_contact_staging(search_county, search_city, search_street_name, search_house_number);
CREATE INDEX IF NOT EXISTS idx_staging_name ON voter_contact_staging(ln, fn); -- last_name, first_name
CREATE INDEX IF NOT EXISTS idx_staging_status ON voter_contact_staging(status);
CREATE INDEX IF NOT EXISTS idx_staging_submitted ON voter_contact_staging(submitted_by, submitted_at);
CREATE INDEX IF NOT EXISTS idx_staging_location ON voter_contact_staging(county, city);
CREATE INDEX IF NOT EXISTS idx_staging_voter_id ON voter_contact_staging(voter_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_staging_timestamp 
  AFTER UPDATE ON voter_contact_staging
  BEGIN
    UPDATE voter_contact_staging SET updated_at = CURRENT_TIMESTAMP WHERE staging_id = NEW.staging_id;
  END;

-- Trigger to generate voter_id (temp format for staging)
CREATE TRIGGER IF NOT EXISTS generate_voter_id
  AFTER INSERT ON voter_contact_staging
  WHEN NEW.voter_id = 'TEMP-00000000'
  BEGIN
    UPDATE voter_contact_staging 
    SET voter_id = 'TEMP-' || printf('%08d', NEW.staging_id)
    WHERE staging_id = NEW.staging_id;
  END;