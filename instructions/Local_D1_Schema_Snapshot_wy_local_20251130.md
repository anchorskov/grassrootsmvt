# Local D1 Schema Snapshot (wy_local) — Updated 2025-11-30

> **Purpose**  
> Point-in-time schema snapshot for local D1 after major address normalization and batch refreshes.  
> This document is **WORM** (write once, read many). For future changes, create a new dated file.

---

## Summary (2025-11-30)

### New Since 2025-11-10
- **streets_index**: Unique key is now `id` (`streets_index_id`), not composite. Table refreshed from deduplicated CSV, loaded in batches to avoid D1 errors (17,308 rows).
- **tmp_voter_street**: `streets_index_id` field batch-updated for all matching `voter_id` from normalized address CSV (274,655 updates).
- **voters_addr_norm** (NEW): Primary address normalization table created and fully synced between local and remote D1.
  - **Local Row Count**: 274,656 (includes 3 legitimate out-of-CSV records)
  - **Remote Row Count**: 274,656 (now perfectly synchronized with local)
  - **Sync Method**: Used INSERT OR REPLACE (UPSERT) to handle duplicate voter_ids and constraint violations
  - **Key Records Added**: voter_ids `160167`, `200300875`, `25833` manually inserted to remote after validation
- **Batch Processing**: All large table updates performed in batches (500-line chunks for voters_addr_norm, 1,000 for streets_index) to avoid D1 internal errors.

### Core Infrastructure
- Normalization/lookup objects: `wy_city_county`, `streets_index`, `tmp_voter_street`, `voters_addr_norm` + views
- `streets_index` now keyed by `id` (not composite fields)
- `tmp_voter_street` used for mapping `voter_id` to `streets_index_id`
- `voters_addr_norm` is canonical address table for voters (voter_id, addr1, city, senate, house, city_county_id, street_index_id)
- Voter phone data in `voter_phones` (113,358 records), `best_phone` table present but empty
- **Sync Status**: Local and remote D1 instances now have identical voters_addr_norm tables (274,656 rows each)

---

## Objects Inventory

| name                         | type  | purpose |
|------------------------------|-------|---------|
| ...existing code...
| streets_index                | table | Canonical street normalization (now keyed by id) |
| tmp_voter_street             | table | Maps voter_id to streets_index_id (batch updated) |
| ...existing code...

---

## Key Tables

### `streets_index` (Updated 2025-11-30)
**Role:** Canonical, deduplicated street rows per city/county. Now keyed by `id` (was composite).

**Columns:**
- `id` INTEGER PRIMARY KEY  
- `city_county_id` INTEGER NOT NULL REFERENCES wy_city_county(id)
- `street_prefix` TEXT (N, S, E, W, NE, etc.)
- `street_core` TEXT NOT NULL (name without house numbers)
- `street_type` TEXT (ST, RD, AVE, HWY, etc.)
- `street_suffix` TEXT
- `street_canonical` TEXT NOT NULL (normalized full street name)
- `raw_address` TEXT (original address string)

**Normalization guarantees:**
- No leading house numbers in `street_core`
- `street_canonical` is normalized, trimmed, single-space join
- Uniqueness: one row per `id` (streets_index_id)

**Recent Change:**
- Table fully refreshed from deduplicated CSV, loaded in batches (17,308 rows)
- Unique constraint is now on `id` only

### `tmp_voter_street` (Updated 2025-11-30)
**Role:** Maps `voter_id` to `streets_index_id` for address normalization and matching.

**Columns:**
- `voter_id` TEXT PRIMARY KEY
- `streets_index_id` INTEGER

**Recent Change:**
- `streets_index_id` field batch-updated for all matching `voter_id` from normalized address CSV (274,655 updates)

### `voters_addr_norm` (NEW - 2025-11-30, Synced)
**Role:** Canonical voter address normalization table, synchronized across local and remote D1 instances.

**Columns:**
- `voter_id` TEXT PRIMARY KEY
- `addr1` TEXT (normalized street address)
- `city` TEXT NOT NULL
- `senate` TEXT (senate district)
- `house` TEXT (house district)
- `city_county_id` TEXT NOT NULL REFERENCES wy_city_county(id)
- `street_index_id` INTEGER REFERENCES streets_index(id)

**Data Integrity:**
- **Local Row Count**: 274,656 unique voter records
- **Remote Row Count**: 274,656 (perfectly synchronized)
- **Uniqueness Guarantee**: Primary key on `voter_id` ensures no duplicates

**Sync Status (Completed 2025-11-30):**
- Initial load used CSV source (274,653 records from imports/voters_addr_norm11-30.csv)
- 3 constraint violations in batch `part_bs` handled via INSERT OR REPLACE (UPSERT)
- 3 legitimate records (`voter_id`: 160167, 200300875, 25833) added to remote after initial sync
- Final result: Both local and remote databases have identical, complete data

**Sync Process Details:**
- Generated SQL INSERTs from CSV using `generate_voters_addr_norm_inserts_minimal.cjs`
- Split into 550 batches (500-line chunks each) for reliable D1 loading
- Used `INSERT OR REPLACE INTO` to handle duplicate voter_ids within batches
- Batch load automation with `yes | wrangler d1 execute` for confirmation bypass
- Verification: Final count matches on both instances (274,656 rows)

---

## Batch Update Process (2025-11-30)
- **streets_index & tmp_voter_street**: Batches of 1,000 rows to avoid D1 internal errors
- **voters_addr_norm**: Batches of 500 rows (550 total batches) to handle large sync
- All updates verified for row counts and data integrity after completion
- Used UPSERT pattern (INSERT OR REPLACE) to gracefully handle constraint violations

---

## Provenance & Notes

This 2025-11-30 snapshot captures the schema state after:
1. Major address normalization and deduplication
2. Full refresh of `streets_index` and `tmp_voter_street` from CSVs
3. **NEW:** Complete sync of `voters_addr_norm` table between local and remote D1 instances
   - Resolved PK constraint violations using UPSERT pattern
   - Added 3 legitimate records not in CSV source
   - Verified identical row counts and data integrity (274,656 rows on both instances)
4. Batch processing to avoid D1 errors (varying batch sizes: 500-1,000 rows)

**Key Accomplishments (2025-11-30):**
- ✅ Local and remote `voters_addr_norm` tables are fully synchronized
- ✅ 274,656 voter records loaded and verified on both instances
- ✅ UPSERT pattern successfully handled duplicate voter_ids and constraint violations
- ✅ 3 out-of-CSV legitimate records identified and added to remote after validation

**Previous snapshot:** `Local_D1_Schema_Snapshot_wy_local_20251110.md`

For any future schema changes, create a new dated snapshot file rather than editing this document.

---

<!-- ...existing code for other tables, migrations, and verification commands remains unchanged... -->
