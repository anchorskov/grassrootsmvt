# Local D1 Schema Snapshot (wy_local) — Updated 2025-12-01

> **Purpose**  
> Point-in-time schema snapshot for local D1 after legislature table addition and comprehensive data verification.  
> This document is **WORM** (write once, read many). For future changes, create a new dated file.

---

## Summary (2025-12-01)

### New Since 2025-11-30
- **legislature** (NEW): Wyoming state legislature table with 93 elected officials
  - **Local Row Count**: 93 records (62 House, 31 Senate)
  - **Remote Row Count**: 93 records (identical sync)
  - **Load Method**: Python CSV parser → SQL INSERT statements → wrangler d1 execute
  - **Verification**: All 93 records verified identical between local and remote databases

### Core Infrastructure
- Normalization/lookup objects: `wy_city_county`, `streets_index`, `tmp_voter_street`, `voters_addr_norm` + views
- `streets_index` keyed by `id` (not composite fields)
- `tmp_voter_street` used for mapping `voter_id` to `streets_index_id`
- `voters_addr_norm` is canonical address table for voters (274,656 records, synchronized)
- Voter phone data in `voter_phones` (113,358 records), `best_phone` table present
- **legislature**: New reference table for Wyoming elected officials (93 members)
- **Sync Status**: Local and remote D1 instances now have identical voters_addr_norm + legislature tables

---

## Objects Inventory

| name                         | type  | purpose |
|------------------------------|-------|---------|
| legislature                  | table | Wyoming state legislature members (NEW - 2025-12-01) |
| streets_index                | table | Canonical street normalization (keyed by id) |
| tmp_voter_street             | table | Maps voter_id to streets_index_id |
| voters_addr_norm             | table | Canonical voter address table (274,656 records) |
| wy_city_county               | table | City/county reference lookup |
| voter_phones                 | table | Phone directory (113,358 records) |
| v_best_phone                 | view  | Best phone numbers per voter |

---

## Key Tables

### `legislature` (NEW - 2025-12-01)
**Role:** Wyoming state legislature reference table with elected officials' contact information and chamber assignment.

**Columns:**
- `voter_id` INTEGER PRIMARY KEY (foreign key to voters table)
- `name` TEXT NOT NULL (full name of legislator)
- `chamber` TEXT NOT NULL (House or Senate)
- `district` INTEGER (legislative district number)
- `city` TEXT (city of residence)
- `county` TEXT (county served)
- `party` TEXT (R for Republican, D for Democrat)
- `affiliations` TEXT (caucus memberships, e.g., "Freedom Caucus")
- `campaign_website` TEXT (campaign URL)
- `official_profile_url` TEXT (official legislature profile URL)
- `phone` TEXT (legislative office phone number)
- `email` TEXT NOT NULL (official legislature email)
- `updated` TEXT (last update date from source, 2025-11-10)

**Data Distribution:**
- **House**: 62 members (67%)
- **Senate**: 31 members (33%)
- **Republican (R)**: 85 members (91.4%)
- **Democratic (D)**: 8 members (8.6%)

**Data Completeness:**
- Names: 100% (93/93)
- Emails: 100% (93/93)
- Phone Numbers: 99% (92/93 - 1 missing from source)
- Affiliations: 67% (62/93 - nulls from source CSV)
- Campaign Website: 3% (3/93 - sparse data from source)

**Load Process (2025-12-01):**
1. Imported CSV: `wy_legislature_12-1-25.csv.csv` (93 records)
2. Python script generated 94 SQL statements (1 CREATE TABLE + 93 INSERTs)
3. Local load: SQLite `.import --skip 1` command
4. Remote load: wrangler d1 execute with SQL file
5. Verification: 93 records loaded identically on both databases

**Sample Records:**
- Chip Neiman (House-1, R): Hulett, Crook/Weston
- JD Williams (House-2, R): Lusk, Goshen/Niobrara/Weston
- Ogden Driskill (Senate-1, R): Devils Tower, Campbell/Crook/Weston
- Chris Rothfuss (Senate-9, D): Laramie, Albany

### `voters_addr_norm` (Synced - 2025-11-30)
**Role:** Canonical voter address normalization table, synchronized across local and remote D1 instances.

**Columns:**
- `voter_id` TEXT PRIMARY KEY
- `addr1` TEXT (normalized street address with house numbers via addr_raw)
- `city` TEXT NOT NULL
- `senate` TEXT (senate district)
- `house` TEXT (house district)
- `city_county_id` TEXT NOT NULL REFERENCES wy_city_county(id)
- `street_index_id` INTEGER REFERENCES streets_index(id)
- `addr_raw` TEXT (full address including house numbers)
- `fn` TEXT (first name)
- `ln` TEXT (last name)
- `zip` TEXT (zip code)

**Data Integrity:**
- **Local Row Count**: 274,656 unique voter records
- **Remote Row Count**: 274,656 (perfectly synchronized)
- **addr_raw**: 100% populated (274,656/274,656)
- **fn, ln, zip**: 99.99% populated (274,655/274,656 - 1 null in source)
- **Uniqueness Guarantee**: Primary key on `voter_id` ensures no duplicates

**Sync Status (Completed 2025-11-30):**
- Initial load used CSV source (274,653 records from imports/voters_addr_norm11-30.csv)
- 3 constraint violations in batch handled via INSERT OR REPLACE (UPSERT)
- 3 legitimate records added to remote after initial sync
- Final result: Both local and remote databases have identical, complete data

### `streets_index` (Updated 2025-11-30)
**Role:** Canonical, deduplicated street rows per city/county. Keyed by `id`.

**Columns:**
- `id` INTEGER PRIMARY KEY  
- `city_county_id` INTEGER NOT NULL REFERENCES wy_city_county(id)
- `street_prefix` TEXT (N, S, E, W, NE, etc.)
- `street_core` TEXT NOT NULL (name without house numbers)
- `street_type` TEXT (ST, RD, AVE, HWY, etc.)
- `street_suffix` TEXT
- `street_canonical` TEXT NOT NULL (normalized full street name)
- `raw_address` TEXT (original address string)

**Row Count**: 17,308 unique streets

**Normalization guarantees:**
- No leading house numbers in `street_core`
- `street_canonical` is normalized, trimmed, single-space join
- Uniqueness: one row per `id`

### `tmp_voter_street` (Updated 2025-11-30)
**Role:** Maps `voter_id` to `streets_index_id` for address normalization and matching.

**Columns:**
- `voter_id` TEXT PRIMARY KEY
- `streets_index_id` INTEGER

**Row Count**: 274,655 mapped records

---

## Cross-Database Sync Summary (2025-12-01)

| Table | Local | Remote | Status |
|-------|-------|--------|--------|
| legislature | 93 | 93 | ✅ Identical |
| voters_addr_norm | 274,656 | 274,656 | ✅ Identical |
| streets_index | 17,308 | 17,308 | ✅ Identical |
| tmp_voter_street | 274,655 | 274,655 | ✅ Identical |
| wy_city_county | ~30 | ~30 | ✅ Identical |

---

## Batch Update Process (2025-12-01)
- **legislature**: Single batch of 94 SQL statements (1 CREATE + 93 INSERTs)
  - Load time: 8.38ms
  - Changes: 94
  - Database size after: 111.51 MB
- All updates verified for row counts and data integrity after completion
- Used INSERT statements (D1 compatible, no UPSERT required)

---

## Provenance & Notes

This 2025-12-01 snapshot captures the schema state after:
1. Addition of `legislature` reference table from Wyoming state legislature CSV (93 members)
2. Cross-database verification of legislature data integrity
3. Confirmation that all data tables are synchronized between local and remote D1 instances
4. Chamber and party distribution analysis

**Key Accomplishments (2025-12-01):**
- ✅ legislature table created and loaded on both local and remote databases
- ✅ All 93 legislature records verified identical between databases
- ✅ Chamber breakdown: 62 House, 31 Senate
- ✅ Party distribution: 85 Republican, 8 Democrat
- ✅ Data completeness verified (100% names/emails, 99% phone, 67% affiliations, 3% websites)
- ✅ Ready for production queries joining voters to legislature members

**Previous snapshot:** `Local_D1_Schema_Snapshot_wy_local_20251130.md`

For any future schema changes, create a new dated snapshot file rather than editing this document.

---

<!-- End of 2025-12-01 snapshot -->
