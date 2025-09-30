-- Core volunteer tool tables (no voter PII here)

CREATE TABLE IF NOT EXISTS volunteers (
  id   TEXT PRIMARY KEY,     -- email from Cloudflare Access
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS voter_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  volunteer_id TEXT NOT NULL,
  method TEXT NOT NULL,           -- 'phone' | 'door'
  outcome TEXT NOT NULL,          -- 'connected','vm','no_answer','wrong_number','refused','follow_up'
  ok_callback INTEGER,
  best_day TEXT,
  best_time_window TEXT,
  requested_info INTEGER,
  dnc INTEGER,
  optin_sms INTEGER,
  optin_email INTEGER,
  email TEXT,
  wants_volunteer INTEGER,
  share_insights_ok INTEGER,
  for_term_limits INTEGER,
  issue_public_lands INTEGER,
  comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_assignments (
  voter_id TEXT PRIMARY KEY,
  volunteer_id TEXT NOT NULL,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  lock_expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS call_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  due_date DATE,
  reason TEXT,                    -- 'requested_info','callback_window','other'
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  done INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS walk_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_id TEXT NOT NULL,
  county TEXT, city TEXT, district TEXT, precinct TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS walk_assignments (
  batch_id INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  position INTEGER,
  PRIMARY KEY (batch_id, voter_id)
);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,          -- 'pdf','email','sms'
  audience TEXT,                  -- 'R','D','U','All'
  body_html TEXT NOT NULL
);

-- NOTE: v_eligible_call view depends on voters_raw/voters_norm/v_best_phone.
-- Create that view after you've imported your voter data into D1.
