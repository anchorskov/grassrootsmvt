-- 012_add_streets_link_to_voters.sql
-- Add streets_index_id FK column to voters_addr_norm for linking to streets_index(id).
-- A simple index is added to speed up future joins and backfill updates.

ALTER TABLE voters_addr_norm
ADD COLUMN streets_index_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_voters_addr_norm_streets_index_id
  ON voters_addr_norm (streets_index_id);
