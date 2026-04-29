-- Migration 024: Expand voter_contacts to full remote schema
-- Adds columns that don't already exist from migration 006
-- Migration 006 already added: id, voter_id, best_day, best_time_window, share_insights_ok, created_at, updated_at

-- New columns for remote parity
ALTER TABLE voter_contacts ADD COLUMN volunteer_id TEXT;
ALTER TABLE voter_contacts ADD COLUMN method TEXT;
ALTER TABLE voter_contacts ADD COLUMN outcome TEXT;
ALTER TABLE voter_contacts ADD COLUMN ok_callback INTEGER;
ALTER TABLE voter_contacts ADD COLUMN requested_info INTEGER;
ALTER TABLE voter_contacts ADD COLUMN dnc INTEGER;
ALTER TABLE voter_contacts ADD COLUMN optin_sms INTEGER;
ALTER TABLE voter_contacts ADD COLUMN optin_email INTEGER;
ALTER TABLE voter_contacts ADD COLUMN email TEXT;
ALTER TABLE voter_contacts ADD COLUMN wants_volunteer INTEGER;
ALTER TABLE voter_contacts ADD COLUMN for_term_limits INTEGER;
ALTER TABLE voter_contacts ADD COLUMN issue_public_lands INTEGER;
ALTER TABLE voter_contacts ADD COLUMN comments TEXT;

-- Recreate indexes
DROP INDEX IF EXISTS idx_voter_contacts_voter_id;
DROP INDEX IF EXISTS idx_voter_contacts_created_at;
DROP INDEX IF EXISTS idx_voter_contacts_reviewed;
DROP INDEX IF EXISTS idx_voter_contacts_volunteer_id;

CREATE INDEX idx_voter_contacts_voter_id ON voter_contacts(voter_id);
CREATE INDEX idx_voter_contacts_volunteer_id ON voter_contacts(volunteer_id);
CREATE INDEX idx_voter_contacts_created_at ON voter_contacts(created_at);
CREATE INDEX idx_voter_contacts_reviewed ON voter_contacts(reviewed);
