-- Migration 018: Add call_assignments table for volunteer call locking

CREATE TABLE call_assignments (
  voter_id TEXT PRIMARY KEY,
  volunteer_id TEXT NOT NULL,
  locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  lock_expires_at DATETIME
);
