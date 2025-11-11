-- 011_add_volunteer_fields.sql
-- Expand volunteers table to capture first_name, last_name, cell_phone, and is_active.
-- 
-- MIGRATION STRATEGY FOR SQLITE (no DROP TABLE allowed in D1):
-- 1. Create table with full schema if it doesn't exist
-- 2. For existing tables, add columns via ALTER TABLE
--    (will error if columns already exist, but that's expected on re-run)

-- Create volunteers table with complete schema if it doesn't exist
CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Add new columns (these will error if columns already exist - that's expected behavior)
-- SQLite/D1 doesn't support "IF NOT EXISTS" on ALTER TABLE ADD COLUMN
-- These statements are safe to run - they'll succeed once, fail on subsequent runs
-- The migration should only be run once per environment

ALTER TABLE volunteers ADD COLUMN first_name TEXT;
ALTER TABLE volunteers ADD COLUMN last_name TEXT;
ALTER TABLE volunteers ADD COLUMN cell_phone TEXT;
ALTER TABLE volunteers ADD COLUMN is_active INTEGER DEFAULT 1;

-- Create index on cell_phone for fast volunteer lookups
CREATE INDEX IF NOT EXISTS idx_volunteers_cell_phone ON volunteers(cell_phone);

-- Backfill first_name and last_name from existing name column
-- Only updates rows where first_name is NULL and name contains a space
-- Safe to run multiple times - won't overwrite existing first/last names
UPDATE volunteers 
SET 
  first_name = TRIM(SUBSTR(name, 1, INSTR(name, ' ') - 1)),
  last_name = TRIM(SUBSTR(name, INSTR(name, ' ') + 1))
WHERE first_name IS NULL 
  AND name LIKE '% %';
