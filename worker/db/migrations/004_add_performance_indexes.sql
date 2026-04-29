-- Migration: Add performance indexes for GrassrootsMVT optimization
-- Date: 2025-10-12
-- Purpose: Improve query performance for voter filtering and metadata lookups
-- Note: voter-related indexes are now created in migration 017

-- Indexes for normalized address table (used for canvassing)
CREATE INDEX IF NOT EXISTS idx_addr_voter_id ON voters_addr_norm(voter_id);
CREATE INDEX IF NOT EXISTS idx_addr_city ON voters_addr_norm(city);

-- Indexes for call_activity table
CREATE INDEX IF NOT EXISTS idx_call_activity_voter_id ON call_activity(voter_id);
CREATE INDEX IF NOT EXISTS idx_call_activity_volunteer ON call_activity(volunteer_email);

