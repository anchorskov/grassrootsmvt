-- D1 schema for refactored API routes
CREATE TABLE IF NOT EXISTS voter_contact (
  voter_id INTEGER,
  contact_method TEXT,
  outcome TEXT,
  comments TEXT,
  volunteer_email TEXT,
  ts TEXT
);

CREATE TABLE IF NOT EXISTS voter_contact_staging (
  submitted_by TEXT,
  vol_email TEXT,
  search_county TEXT,
  search_city TEXT,
  search_street_name TEXT,
  search_house_number TEXT,
  fn TEXT,
  ln TEXT,
  addr1 TEXT,
  unit_number TEXT,
  zip TEXT,
  phone_e164 TEXT,
  email TEXT,
  political_party TEXT,
  voting_likelihood TEXT,
  contact_method TEXT,
  interaction_notes TEXT,
  issues_interested TEXT,
  volunteer_notes TEXT,
  potential_matches TEXT,
  needs_manual_review INTEGER,
  ts TEXT
);

CREATE TABLE IF NOT EXISTS pulse_optins (
  voter_id INTEGER,
  contact_method TEXT,
  consent_given INTEGER,
  consent_source TEXT,
  volunteer_email TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS canvass_activity (
  voter_id INTEGER,
  volunteer_email TEXT,
  result TEXT,
  notes TEXT,
  pulse_opt_in INTEGER,
  pitch_used TEXT,
  location_lat REAL,
  location_lng REAL,
  door_status TEXT,
  followup_needed INTEGER
);

CREATE TABLE IF NOT EXISTS streets_index (
  id INTEGER PRIMARY KEY,
  county TEXT,
  city TEXT,
  street_name TEXT,
  house_number TEXT,
  zip TEXT
);

CREATE TABLE IF NOT EXISTS call_activity (
  ts TEXT,
  voter_id INTEGER,
  volunteer_email TEXT,
  outcome TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY,
  title TEXT,
  category TEXT,
  body_text TEXT,
  is_active INTEGER
);
