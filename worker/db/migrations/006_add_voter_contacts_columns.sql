-- Migration 006: Add missing columns to voter_contacts table
-- Date: 2025-11-06
-- Purpose: Add best_day, best_time_window, and share_insights_ok columns

ALTER TABLE voter_contacts ADD COLUMN best_day TEXT;
ALTER TABLE voter_contacts ADD COLUMN best_time_window TEXT;
ALTER TABLE voter_contacts ADD COLUMN share_insights_ok INTEGER DEFAULT 0;
