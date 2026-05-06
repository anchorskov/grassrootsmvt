-- Migration 020: Align call_activity table with remote schema
-- Adds missing columns while gracefully handling existing columns

-- Add outcome column (copy from call_result if needed)
ALTER TABLE call_activity ADD COLUMN outcome TEXT;
UPDATE call_activity SET outcome = call_result WHERE outcome IS NULL AND call_result IS NOT NULL;

-- Add ts column (copy from created_at)
ALTER TABLE call_activity ADD COLUMN ts TEXT;
UPDATE call_activity SET ts = COALESCE(created_at, datetime('now')) WHERE ts IS NULL;

-- Add payload_json column
ALTER TABLE call_activity ADD COLUMN payload_json TEXT;

-- Recreate indexes with outcome column (drop and recreate to avoid duplicates)
DROP INDEX IF EXISTS idx_call_activity_result;
DROP INDEX IF EXISTS idx_call_activity_vid;
DROP INDEX IF EXISTS idx_call_activity_voter_id;
DROP INDEX IF EXISTS idx_call_activity_volunteer;
DROP INDEX IF EXISTS idx_call_activity_volunteer_email;

CREATE INDEX idx_call_activity_vid ON call_activity(voter_id);
CREATE INDEX idx_call_activity_voter_id ON call_activity(voter_id);
CREATE INDEX idx_call_activity_volunteer_email ON call_activity(volunteer_email);
CREATE INDEX idx_call_activity_result ON call_activity(outcome);
