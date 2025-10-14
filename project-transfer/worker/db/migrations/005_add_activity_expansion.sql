-- Migration 005: Volunteer Engagement Schema Expansion
-- Date: 2025-10-12
-- Purpose: Extend volunteer interaction tracking with richer engagement data

-- 🧩 Extend call_activity for engagement and follow-up tracking
ALTER TABLE call_activity ADD COLUMN pulse_opt_in BOOLEAN DEFAULT 0;
ALTER TABLE call_activity ADD COLUMN pitch_used TEXT;
ALTER TABLE call_activity ADD COLUMN duration_seconds INTEGER DEFAULT 0;
ALTER TABLE call_activity ADD COLUMN response_sentiment TEXT CHECK (
  response_sentiment IN ('Supportive', 'Neutral', 'Opposed', 'Unknown')
);
ALTER TABLE call_activity ADD COLUMN issue_interest TEXT;
ALTER TABLE call_activity ADD COLUMN followup_needed BOOLEAN DEFAULT 0;
ALTER TABLE call_activity ADD COLUMN followup_date TEXT;

CREATE INDEX IF NOT EXISTS idx_call_activity_voter_id ON call_activity(voter_id);
CREATE INDEX IF NOT EXISTS idx_call_activity_volunteer_email ON call_activity(volunteer_email);
CREATE INDEX IF NOT EXISTS idx_call_activity_result ON call_activity(outcome);

-- 🆕 Create canvass_activity table
CREATE TABLE IF NOT EXISTS canvass_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  volunteer_email TEXT NOT NULL,
  result TEXT CHECK (result IN (
    'Contacted', 'Not Home', 'Moved', 'Refused', 'Do Not Contact'
  )),
  notes TEXT,
  pulse_opt_in BOOLEAN DEFAULT 0,
  pitch_used TEXT,
  location_lat REAL,
  location_lng REAL,
  door_status TEXT CHECK (door_status IN ('Knocked', 'No Access', 'Skipped')),
  followup_needed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
);

CREATE INDEX IF NOT EXISTS idx_canvass_voter_id ON canvass_activity(voter_id);
CREATE INDEX IF NOT EXISTS idx_canvass_volunteer_email ON canvass_activity(volunteer_email);
CREATE INDEX IF NOT EXISTS idx_canvass_result ON canvass_activity(result);

-- 🔄 Drop existing message_templates if it exists (for clean recreation)
DROP TABLE IF EXISTS message_templates;

-- 🆕 Create message_templates with expanded structure
CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT CHECK (category IN ('phone', 'canvass', 'general')),
  body_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_active ON message_templates(is_active);

-- Seed message templates
INSERT INTO message_templates (title, category, body_text) VALUES
('Jobs and Economy', 'phone', 'We''re working to grow good jobs right here in Wyoming...'),
('Voter Engagement', 'canvass', 'It''s so important every voter participates...'),
('Pulse Opt-In', 'general', 'Would you like to get text reminders about community events?');

-- 🆕 Create pulse_optins table
CREATE TABLE IF NOT EXISTS pulse_optins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  contact_method TEXT CHECK (contact_method IN ('sms', 'email')),
  consent_given BOOLEAN DEFAULT 1,
  consent_source TEXT CHECK (consent_source IN ('call', 'canvass', 'webform')),
  volunteer_email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (voter_id) REFERENCES voters(voter_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_voter_id ON pulse_optins(voter_id);
CREATE INDEX IF NOT EXISTS idx_pulse_contact_method ON pulse_optins(contact_method);