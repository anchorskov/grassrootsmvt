-- Migration 007: Add reviewed flag to voter_contacts
-- Date: 2025-11-06
-- Purpose: Track which contact records have been reviewed by admins

ALTER TABLE voter_contacts ADD COLUMN reviewed INTEGER DEFAULT 0;
CREATE INDEX idx_voter_contacts_reviewed ON voter_contacts(reviewed);
