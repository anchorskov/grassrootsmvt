-- Migration 006: Create and extend voter_contacts table
-- Date: 2025-11-06
-- Purpose: Voter contact preferences and interaction history

-- Create voter_contacts table if it doesn't exist
CREATE TABLE IF NOT EXISTS voter_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL UNIQUE REFERENCES voters(voter_id),
  best_day TEXT,
  best_time_window TEXT,
  share_insights_ok INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_voter_contacts_voter_id ON voter_contacts(voter_id);
