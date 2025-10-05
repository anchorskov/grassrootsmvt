-- Reconcile D1 schema with repo expectations
-- Create missing worker tables (non-destructive IF NOT EXISTS)

-- voter-facing tables the worker expects
CREATE TABLE IF NOT EXISTS voters (
  voter_id TEXT PRIMARY KEY,
  political_party TEXT,
  county TEXT,
  senate TEXT,
  house TEXT
);

-- If the materialized normalized address table isn't present, expose
-- the existing v_voters_addr_norm view under the expected name.
-- This creates a view alias (no data copy).
CREATE VIEW IF NOT EXISTS voters_addr_norm AS
SELECT voter_id, ln, fn, addr1, city, state, zip, senate, house
FROM v_voters_addr_norm;

-- Best-phone: map the canonical v_best_phone projection to the name
-- the repo/migrations use (best_phone). Use a view to avoid data copy.
CREATE VIEW IF NOT EXISTS best_phone AS
SELECT voter_id, phone_e164, confidence_code, is_wy_area, imported_at
FROM v_best_phone;

-- Call activity/logging table
CREATE TABLE IF NOT EXISTS call_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  voter_id TEXT,
  outcome TEXT,
  volunteer_email TEXT,
  payload_json TEXT
);

-- Lock assignments used by callNext
CREATE TABLE IF NOT EXISTS call_assignments (
  voter_id TEXT PRIMARY KEY,
  volunteer_id TEXT NOT NULL,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  lock_expires_at DATETIME
);

-- Call follow-ups table
CREATE TABLE IF NOT EXISTS call_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  due_date DATE,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  done INTEGER DEFAULT 0
);

-- Voter contacts: worker inserts into this; map to contact_logs if present,
-- otherwise create a minimal table. We try to create the table only if it
-- does not already exist, so if you already have contact_logs/voter_contacts
-- we won't destroy them.
CREATE TABLE IF NOT EXISTS voter_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  volunteer_id TEXT NOT NULL,
  method TEXT NOT NULL,
  outcome TEXT NOT NULL,
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

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_call_activity_vid ON call_activity(voter_id);
CREATE INDEX IF NOT EXISTS idx_voters_county ON voters(county);
CREATE INDEX IF NOT EXISTS idx_voters_party ON voters(political_party);
-- Note: we avoid creating indexes on views (some D1/SQLite builds reject that).
-- If you need indexes for performance, create them on the underlying tables instead.

-- End of reconciliation migration
