-- db/migrations/001_create_call_activity.sql
-- call activity log (prod D1)
CREATE TABLE IF NOT EXISTS call_activity (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  voter_id        TEXT,
  outcome         TEXT,
  payload_json    TEXT,
  volunteer_email TEXT
);
CREATE INDEX IF NOT EXISTS idx_call_activity_ts ON call_activity(ts);
CREATE INDEX IF NOT EXISTS idx_call_activity_voter ON call_activity(voter_id);
