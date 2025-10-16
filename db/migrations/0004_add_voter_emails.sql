-- Migration number: 0004 2025-10-15T18:45:00.000Z
-- Add voter emails table for locally collected email addresses

CREATE TABLE IF NOT EXISTS voter_emails (
    voter_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    opt_in_status TEXT DEFAULT 'unknown' CHECK (opt_in_status IN ('opted_in', 'opted_out', 'unknown')),
    source TEXT NOT NULL, -- 'contact_form', 'canvass', 'volunteer_entry', 'import'
    collected_by TEXT, -- volunteer email who collected this
    collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_voter_emails_email ON voter_emails(email);

-- Index for opt-in status queries
CREATE INDEX IF NOT EXISTS idx_voter_emails_opt_in ON voter_emails(opt_in_status);

-- Index for source tracking
CREATE INDEX IF NOT EXISTS idx_voter_emails_source ON voter_emails(source);

-- Trigger to update last_updated timestamp
CREATE TRIGGER IF NOT EXISTS update_voter_emails_timestamp 
    AFTER UPDATE ON voter_emails
    BEGIN
        UPDATE voter_emails SET last_updated = CURRENT_TIMESTAMP WHERE voter_id = NEW.voter_id;
    END;

-- Create view that includes email data with voter information
DROP VIEW IF EXISTS v_voters_with_contact;
CREATE VIEW v_voters_with_contact AS
SELECT 
    v.voter_id,
    v.political_party,
    v.county,
    v.house,
    v.senate,
    va.fn,
    va.ln,
    va.addr1,
    va.city,
    va.state,
    va.zip,
    bp.phone_e164,
    bp.confidence_code as phone_confidence,
    ve.email,
    ve.email_verified,
    ve.opt_in_status as email_opt_in_status,
    ve.source as email_source,
    ve.collected_at as email_collected_at
FROM voters v
LEFT JOIN voters_addr_norm va ON v.voter_id = va.voter_id
LEFT JOIN best_phone bp ON v.voter_id = bp.voter_id
LEFT JOIN voter_emails ve ON v.voter_id = ve.voter_id;