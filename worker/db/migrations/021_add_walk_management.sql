-- Migration 021: Add walk_batches and walk_assignments for canvass management

CREATE TABLE walk_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_id TEXT NOT NULL,
  county TEXT,
  city TEXT,
  district TEXT,
  precinct TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE walk_assignments (
  batch_id INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  position INTEGER,
  PRIMARY KEY (batch_id, voter_id)
);
