-- Migration 029: Field support desk sessions and tasks

CREATE TABLE IF NOT EXISTS field_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_email TEXT NOT NULL,
  volunteer_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sharing_enabled INTEGER NOT NULL DEFAULT 0,
  latest_lat REAL,
  latest_lng REAL,
  latest_accuracy_m REAL,
  latest_location_at TEXT,
  consent_text_version TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  stopped_sharing_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_field_sessions_active
  ON field_sessions(status, sharing_enabled, latest_location_at);

CREATE INDEX IF NOT EXISTS idx_field_sessions_volunteer
  ON field_sessions(volunteer_email, status);

CREATE TABLE IF NOT EXISTS field_session_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  notes TEXT,
  scheduled_for TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES field_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_field_session_tasks_session
  ON field_session_tasks(session_id, status);
