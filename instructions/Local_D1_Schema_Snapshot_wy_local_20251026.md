# Local D1 Schema Snapshot (wy_local) — Updated 2025-10-26

> **Purpose**  
> Point-in-time schema snapshot for local and remote D1 after street normalization/import.  
> This document is **WORM** (write once, read many). For future changes, create a new dated file.

---

## Summary (2025-10-26)

- Core normalization/lookup objects exist **and align** across local and remote:  
  `wy_city_county`, `streets_index`, `voters_addr_norm`, plus views `city_county`, `v_voters_addr_norm`.
- `streets_index` is populated from the cleaned CSV pipeline with deduplicated canonical rows.
- `voters_addr_norm.city_county_id` is **NOT NULL** and has a valid FK to `wy_city_county(id)`.
- Minimal voter phone data (`voter_phones`) imported and deduplicated in both local and remote D1.
- Row counts match: 113,358 records in both local and remote after final import and deduplication.
- Parity verified: no missing files, no duplicates, no schema drift.
- Local contains additional app tables not required in production; remote contains Cloudflare’s system table.

---

## Objects Inventory

### Local D1 (`wy_local`)
| name               | type  |
|--------------------|-------|
| _cf_METADATA       | table |
| best_phone         | table |
| call_activity      | table |
| canvass_activity   | table |
| city_county_import | table |
| d1_migrations      | table |
| message_templates  | table |
| pulse_optins       | table |
| sqlite_sequence    | table |
| streets_index      | table |
| voter_emails       | table |
| voters             | table |
| voters_addr_norm   | table |
| voter_phones       | table |
| wy_city_county     | table |
| city_county        | view  |
| v_voters_addr_norm | view  |

### Remote D1 (`wy`, production)
| name               | type  |
|--------------------|-------|
| _cf_KV             | table |
| call_activity      | table |
| d1_migrations      | table |
| sqlite_sequence    | table |
| streets_index      | table |
| voters_addr_norm   | table |
| voter_phones       | table |
| wy_city_county     | table |
| city_county        | view  |
| v_voters_addr_norm | view  |

> **Note:** Local includes additional app/support tables (`best_phone`, `canvass_activity`, `message_templates`, `pulse_optins`, `voter_emails`, `voters`, `city_county_import`). Remote includes Cloudflare `_cf_KV`.

---

## Key Tables

### `wy_city_county`
**Role:** Authoritative city/county normalization table used to resolve `city_county_id`.

**Minimal columns (effective):**
- `id` INTEGER PRIMARY KEY  
- `city_norm` TEXT NOT NULL  
- `county_norm` TEXT NOT NULL

**View helper:**
```sql
CREATE VIEW city_county AS
SELECT id, city_norm AS city, county_norm AS county
FROM wy_city_county;
```

### `streets_index`
Role: Canonical, deduplicated street rows per city/county.

Columns (effective):
- street_id INTEGER PRIMARY KEY
- city_county_id INTEGER NOT NULL REFERENCES wy_city_county(id)
- street_prefix TEXT -- e.g., N, S, E, W, NE, …
- street_core TEXT NOT NULL -- name without house numbers/units
- street_type TEXT -- e.g., ST, RD, AVE, HWY, …
- street_suffix TEXT -- trailing qualifier when present
- street_canonical TEXT NOT NULL -- [prefix] core [type] [suffix] (single spaces)

Normalization guarantees:
- No leading house numbers in street_core.
- street_canonical is a normalized, trimmed single-space join of present parts.
- Uniqueness: one row per (city_county_id, street_prefix, street_core, street_type, street_suffix).

### `voters_addr_norm`
Role: Normalized voter addresses with resolved city/county.

Columns (effective):
- voter_id TEXT PRIMARY KEY NOT NULL
- ln, fn TEXT
- addr1 TEXT
- city, state TEXT
- zip TEXT
- senate, house TEXT
- city_county_id INTEGER NOT NULL REFERENCES wy_city_county(id)

Indexes (recommended & present):
- idx_voters_addr_norm_city ON (city)
- idx_voters_addr_norm_zip ON (zip)
- idx_voters_addr_norm_addr1_city ON (addr1, city)
- idx_voters_addr_norm_city_addr1 ON (city, addr1)
- idx_voters_addr_norm_city_county_id ON (city_county_id)

**View helper:**
```sql
CREATE VIEW v_voters_addr_norm AS
SELECT
  van.*,
  wcc.city_norm   AS city_resolved,
  wcc.county_norm AS county_resolved
FROM voters_addr_norm AS van
LEFT JOIN wy_city_county AS wcc
  ON wcc.id = van.city_county_id;
```

### `voter_phones`
**Role:** Stores minimal phone data for each voter, deduplicated and parity-checked across environments.

**Columns (effective):**
- `voter_id` TEXT NOT NULL
- `phone10` TEXT NOT NULL
- `phone_e164` TEXT NOT NULL

**Table Relationships:**
- Each `voter_phones.voter_id` should match a `voters.voter_id` (foreign key recommended).
- Unique records per `(voter_id, phone10, phone_e164)` are enforced for deduplication.
- Both local and remote should use the same constraints for consistency.

**Import & Deduplication:**
- Data imported in 57 SQL batch files (2000 records per file, last file smaller).
- Deduplication performed on `(voter_id, phone10, phone_e164)`; only unique rows retained.
- Final row count: 113,358 in both local and remote.

**Verification:**
- Parity confirmed by matching row counts and schema.

---

## Verification Commands (Wrangler)
Run from repo root. Replace worker/wrangler.toml if your config path differs.

Inventory (objects list)
Local
```bash
npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
  --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name;"
```
Remote (production)
```bash
npx wrangler d1 execute wy --remote --env production --config worker/wrangler.toml \
  --command "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name;"
```

voters_addr_norm table shape + FK
Local
```bash
npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
  --command "PRAGMA table_info(voters_addr_norm); PRAGMA foreign_key_list(voters_addr_norm); PRAGMA foreign_key_check;"
```
Remote
```bash
npx wrangler d1 execute wy --remote --env production --config worker/wrangler.toml \
  --command "PRAGMA table_info(voters_addr_norm); PRAGMA foreign_key_list(voters_addr_norm); PRAGMA foreign_key_check;"
```

streets_index sanity
Local
```bash
npx wrangler d1 execute wy_local --local --config worker/wrangler.toml \
  --command "PRAGMA table_info(streets_index); SELECT COUNT(*) AS streets_rows FROM streets_index;"
```
Remote
```bash
npx wrangler d1 execute wy --remote --env production --config worker/wrangler.toml \
  --command "PRAGMA table_info(streets_index); SELECT COUNT(*) AS streets_rows FROM streets_index;"
```

City coverage check (every city has at least
SELECT c.city, c.county
FROM cities c
LEFT JOIN (
  SELECT DISTINCT city_county_id FROM streets_index
) s ON s.city_county_id = c.id
WHERE s.city_county_id IS NULL
ORDER BY c.county, c.city;"
```
Remote
```bash
npx wrangler d1 execute wy --remote --env production --config worker/wrangler.toml --command "
WITH cities AS (
  SELECT id, city_norm AS city, county_norm AS county FROM wy_city_county
)
SELECT c.city, c.county
FROM cities c
LEFT JOIN (
  SELECT DISTINCT city_county_id FROM streets_index
) s ON s.city_county_id = c.id
WHERE s.city_county_id IS NULL
ORDER BY c.county, c.city;"
```

voter_phones row count (import & parity)
Local
```bash
npx wrangler d1 execute wy_local --local --config worker/wrangler.toml --command "SELECT COUNT(*) AS local_count FROM voter_phones;"
```
Remote
```bash
npx wrangler d1 execute wy --remote --env production --config worker/wrangler.toml --command "SELECT COUNT(*) AS remote_count FROM voter_phones;"
```

---

## Provenance & Notes
This 2025-10-26 snapshot preserves the structure and intent of the prior 2025-10-24 file while incorporating the latest state after street normalization/import and voter phone data migration.

For any future migrations impacting streets_index, voters_addr_norm, or voter_phones, update the next dated snapshot rather than editing this file.





