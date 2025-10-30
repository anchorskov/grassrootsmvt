-- 0006_align_contact_tables.sql
-- Create compatibility views if legacy singular names are referenced by older code
BEGIN;
CREATE TABLE IF NOT EXISTS voter_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT DEFAULT '',
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS voter_contact_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  json TEXT NOT NULL,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Compatibility views (no-op if tables already pluralized)
DROP VIEW IF EXISTS voter_contact;
CREATE VIEW voter_contact AS SELECT id, voter_id, status, notes, ts FROM voter_contacts;
DROP VIEW IF EXISTS voter_contact_st;
CREATE VIEW voter_contact_st AS SELECT id, voter_id, json, ts FROM voter_contact_staging;
COMMIT;
