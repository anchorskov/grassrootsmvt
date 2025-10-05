-- Minimal D1 schema to satisfy the worker's expectations for the `wy` binding.
-- Safe to run on D1; alters only if objects do not exist.

PRAGMA foreign_keys = OFF;

-- voters: canonical voter table used for joins and party lookup
CREATE TABLE IF NOT EXISTS voters (
  voter_id TEXT PRIMARY KEY,
  political_party TEXT,
  -- other columns may exist in your full dataset
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_voters_political_party ON voters(political_party);

-- v_voters_addr_norm: address-normalized view/table used by canvassNearby
-- If you already have a materialized table `voters_addr_norm` this can be a VIEW
CREATE TABLE IF NOT EXISTS voters_addr_norm (
  voter_id TEXT PRIMARY KEY,
  fn TEXT,
  ln TEXT,
  addr1 TEXT,
  city TEXT,
  zip TEXT,
  house INTEGER,
  senate TEXT
);
CREATE INDEX IF NOT EXISTS idx_voters_addr_norm_city ON voters_addr_norm(city);
CREATE INDEX IF NOT EXISTS idx_voters_addr_norm_zip ON voters_addr_norm(zip);
CREATE INDEX IF NOT EXISTS idx_voters_addr_norm_house ON voters_addr_norm(house);

-- v_best_phone: best/normalized phone numbers
CREATE TABLE IF NOT EXISTS v_best_phone (
  voter_id TEXT PRIMARY KEY,
  phone_e164 TEXT,
  confidence_code INTEGER
);
CREATE INDEX IF NOT EXISTS idx_v_best_phone_phone ON v_best_phone(phone_e164);

-- voters_raw: raw voter info used by callNext result projection
CREATE TABLE IF NOT EXISTS voters_raw (
  voter_id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  ra_city TEXT,
  ra_zip TEXT
);

-- voters_norm: normalized voter info (party_form5 used by callNext)
CREATE TABLE IF NOT EXISTS voters_norm (
  voter_id TEXT PRIMARY KEY,
  party_form5 TEXT
);
CREATE INDEX IF NOT EXISTS idx_voters_norm_party_form5 ON voters_norm(party_form5);

-- call_assignments: locks for callNext
CREATE TABLE IF NOT EXISTS call_assignments (
  voter_id TEXT PRIMARY KEY,
  volunteer_id TEXT,
  locked_at TEXT DEFAULT (DATETIME('now')), -- used for ordering
  lock_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_call_assignments_volunteer ON call_assignments(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_call_assignments_expires ON call_assignments(lock_expires_at);

-- voter_contacts: call logging
CREATE TABLE IF NOT EXISTS voter_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT,
  volunteer_id TEXT,
  method TEXT,
  outcome TEXT,
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
  created_at TEXT DEFAULT (DATETIME('now'))
);
CREATE INDEX IF NOT EXISTS idx_voter_contacts_voter ON voter_contacts(voter_id);

-- call_followups: follow-up tasks
CREATE TABLE IF NOT EXISTS call_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT,
  due_date TEXT,
  reason TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (DATETIME('now'))
);
CREATE INDEX IF NOT EXISTS idx_call_followups_voter ON call_followups(voter_id);

-- v_eligible_call: view stub that picks eligible voters for calling
-- Replace the body with your production logic; this stub gives a simple example
CREATE VIEW IF NOT EXISTS v_eligible_call AS
SELECT voter_id FROM voters
WHERE voter_id NOT IN (SELECT voter_id FROM call_assignments WHERE lock_expires_at > CURRENT_TIMESTAMP)
LIMIT 1000;

-- Provide compatible view names that the worker references (keep legacy names)
CREATE VIEW IF NOT EXISTS v_voters_addr_norm AS SELECT * FROM voters_addr_norm;
-- v_best_phone: expose the materialized table directly. Avoid creating a
-- view with the same name that would be self-referential and create
-- circular view definitions. If you need a view alias, create a
-- differently-named view (for example v_v_best_phone) that selects
-- FROM the table `v_best_phone`.
-- Note: the worker code references `v_best_phone` directly so we
-- keep `v_best_phone` as a table in the minimal schema above.

PRAGMA foreign_keys = ON;

-- End of minimal schema
