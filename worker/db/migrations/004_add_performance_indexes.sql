-- Migration: Add performance indexes for GrassrootsMVT optimization
-- Date: 2025-10-12
-- Purpose: Improve query performance for voter filtering and metadata lookups

-- Indexes for voters table (primary lookup table)
CREATE INDEX IF NOT EXISTS idx_voters_house ON voters(house);
CREATE INDEX IF NOT EXISTS idx_voters_senate ON voters(senate);
CREATE INDEX IF NOT EXISTS idx_voters_county ON voters(county);

-- Indexes for normalized address view (used for canvassing)
CREATE INDEX IF NOT EXISTS idx_addr_voter_id ON v_voters_addr_norm(voter_id);
CREATE INDEX IF NOT EXISTS idx_addr_city ON v_voters_addr_norm(city);

-- Index for phone number lookup (used for phone banking)
CREATE INDEX IF NOT EXISTS idx_phone_voter_id ON v_best_phone(voter_id);

-- Additional composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_voters_county_house ON voters(county, house);
CREATE INDEX IF NOT EXISTS idx_voters_county_senate ON voters(county, senate);