-- Migration 019: Add call_followups table for scheduled follow-up tracking

CREATE TABLE call_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id TEXT NOT NULL,
  due_date DATE,
  reason TEXT,                    -- 'requested_info','callback_window','other'
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  done INTEGER DEFAULT 0
);
