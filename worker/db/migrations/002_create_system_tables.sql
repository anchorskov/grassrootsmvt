-- Migration: Create D1 metadata and supporting tables
-- Path: worker/db/migrations/002_create_system_tables.sql
-- Purpose: Add migration tracking table
-- Note: _cf_METADATA and sqlite_sequence are system tables managed by D1/SQLite
--       and should not be created in migrations

-- D1 migrations tracking table (used by Cloudflare)
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
