-- Migration: Add call_activity table
-- Path: worker/db/migrations/003_add_call_activity.sql

CREATE TABLE IF NOT EXISTS call_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  volunteer_email TEXT NOT NULL,
  call_result TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optional index for faster lookups
CREATE INDEX IF NOT EXISTS idx_call_activity_voter_id ON call_activity(voter_id);
CREATE INDEX IF NOT EXISTS idx_call_activity_volunteer_email ON call_activity(volunteer_email);
