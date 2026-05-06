-- 013_create_volunteer_staging.sql
-- Capture volunteer add/update submissions in a staging queue for admin review.

CREATE TABLE IF NOT EXISTS volunteer_staging (
  staging_id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_by TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'new',          -- 'new' or 'update'
  target_id TEXT,                              -- volunteer id/email when updating
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  cell_phone TEXT,
  county TEXT,
  city TEXT,
  notes TEXT,
  is_active INTEGER,
  review_status TEXT DEFAULT 'pending',        -- pending | approved | rejected
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_volunteer_staging_status ON volunteer_staging(review_status);
CREATE INDEX IF NOT EXISTS idx_volunteer_staging_target ON volunteer_staging(target_id);

-- Keep updated_at in sync on every update.
CREATE TRIGGER IF NOT EXISTS trg_volunteer_staging_updated_at
AFTER UPDATE ON volunteer_staging
BEGIN
  UPDATE volunteer_staging
  SET updated_at = datetime('now')
  WHERE staging_id = NEW.staging_id;
END;
