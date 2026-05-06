-- Migration 032: Team scoping foundation for field support
-- Adds team metadata and task ownership scaffolding.

ALTER TABLE field_sessions ADD COLUMN team_id TEXT;
ALTER TABLE field_sessions ADD COLUMN support_queue TEXT;

ALTER TABLE field_session_tasks ADD COLUMN team_id TEXT;
ALTER TABLE field_session_tasks ADD COLUMN assigned_support_email TEXT;
ALTER TABLE field_session_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE field_session_tasks ADD COLUMN due_at TEXT;
ALTER TABLE field_session_tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_field_sessions_team_active
  ON field_sessions(team_id, status, latest_location_at);

CREATE INDEX IF NOT EXISTS idx_field_tasks_team_status
  ON field_session_tasks(team_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_field_tasks_assignee_status
  ON field_session_tasks(assigned_support_email, status, updated_at);
