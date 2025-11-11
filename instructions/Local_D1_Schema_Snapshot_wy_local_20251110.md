# Local D1 Schema Snapshot (wy_local) — Updated 2025-11-10

> **Purpose**  
> Point-in-time schema snapshot for local D1 after district coverage migration and contact system updates.  
> This document is **WORM** (write once, read many). For future changes, create a new dated file.

---

## Summary (2025-11-10)

### New Since 2025-10-26
- **Migration 008**: Added `district_coverage` table (549 rows) mapping house/senate districts to counties/cities
- **Migration 010**: Added `campaign_touchpoints` and `campaign_touchpoint_segments` for scripted volunteer conversations
- **Contact System**: Added `voter_contacts` and `voter_contact_staging` tables for tracking volunteer interactions
- **Contact Views**: Added `voter_contact` and `voter_contact_st` views for unified contact data access
- **Phone Data**: `voter_phones` table populated with 113,358 records; `best_phone` table exists but empty

### Core Infrastructure
- Normalization/lookup objects: `wy_city_county`, `streets_index`, `voters_addr_norm` + views
- `streets_index` populated from cleaned CSV pipeline with deduplicated canonical rows
- `voters_addr_norm.city_county_id` is **NOT NULL** with valid FK to `wy_city_county(id)`
- Voter phone data in `voter_phones` (113,358 records), `best_phone` table present but empty

---

## Objects Inventory

### Local D1 (`wy_local`)
| name                         | type  | purpose |
|------------------------------|-------|---------|
| _cf_METADATA                 | table | Cloudflare metadata |
| best_phone                   | table | Curated best phone per voter (currently empty) |
| call_activity                | table | Phone banking activity log |
| campaign_touchpoints         | table | **NEW** Pre-scripted conversation flows for volunteers |
| campaign_touchpoint_segments | table | **NEW** Voter targeting rules for touchpoints |
| canvass_activity             | table | Door-to-door canvassing log |
| city_county_import           | table | City/county normalization staging |
| d1_migrations                | table | Migration tracking |
| district_coverage            | table | **NEW** District→county/city mapping (549 rows) |
| message_templates            | table | Reusable message templates |
| pulse_optins                 | table | Text message consent records |
| sqlite_sequence              | table | SQLite auto-increment tracking |
| streets_index                | table | Canonical street normalization |
| voter_contact_staging        | table | **NEW** Contact form submissions staging |
| voter_contacts               | table | **NEW** Processed voter contact records |
| voter_emails                 | table | Email addresses for voters |
| voter_phones                 | table | Phone numbers (113,358 rows) |
| voters                       | table | Core voter registration data |
| voters_addr_norm             | table | Normalized voter addresses |
| wy_city_county               | table | City/county authority table |
| city_county                  | view  | Friendly alias for wy_city_county |
| v_voters_addr_norm           | view  | Voters with resolved city/county |
| voter_contact                | view  | **NEW** Unified contact data view |
| voter_contact_st             | view  | **NEW** Staging contact data view |

---

## Key Tables

### `district_coverage` (NEW — Migration 008)
**Role:** Maps Wyoming House and Senate districts to their constituent counties and cities. Enables fast district-based filtering without scanning the entire voter table.

**Columns:**
- `district_type` TEXT NOT NULL CHECK(district_type IN ('house','senate'))
- `district_code` TEXT NOT NULL (zero-padded, e.g., '01', '56')
- `county` TEXT NOT NULL (uppercase)
- `city` TEXT NOT NULL DEFAULT '' (uppercase)
- PRIMARY KEY (district_type, district_code, county, city)

**Indexes:**
- `idx_district_coverage_type_code` ON (district_type, district_code)
- `idx_district_coverage_county_city` ON (county, city)

**Row Count:** 549 (derived from voters_addr_norm)

**Usage:**
```sql
-- Get all counties in House District 56
SELECT DISTINCT county FROM district_coverage 
WHERE district_type = 'house' AND district_code = '56';

-- Get all house districts in Natrona County
SELECT DISTINCT district_code FROM district_coverage
WHERE district_type = 'house' AND county = 'NATRONA'
ORDER BY CAST(district_code AS INTEGER);
```

### `voter_contacts` (NEW)
**Role:** Tracks all volunteer→voter interactions (calls, canvass, events). This is the **final, verified** contact record table used by admin interface.

**Complete Schema:**
- `id` INTEGER PRIMARY KEY
- `voter_id` TEXT NOT NULL (links to voters table)
- `volunteer_id` TEXT NOT NULL (who made contact)
- `method` TEXT DEFAULT 'door' (contact method)
- `outcome` TEXT NOT NULL (result: contacted, not_home, wrong_number, etc.)
- `ok_callback` INTEGER DEFAULT 0 (voter okay with callback)
- `requested_info` INTEGER DEFAULT 0 (wants more information)
- `dnc` INTEGER DEFAULT 0 (do not contact flag)
- `optin_sms` INTEGER DEFAULT 0 (SMS consent)
- `optin_email` INTEGER DEFAULT 0 (email consent)
- `email` TEXT (email address if provided)
- `wants_volunteer` INTEGER DEFAULT 0 (interested in volunteering)
- `for_term_limits` INTEGER DEFAULT 0 (supports term limits)
- `issue_public_lands` INTEGER DEFAULT 0 (cares about public lands)
- `comments` TEXT (free-form notes)
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `best_day` TEXT (preferred callback day)
- `best_time_window` TEXT (preferred callback time)
- `share_insights_ok` INTEGER DEFAULT 0 (okay sharing feedback)
- `reviewed` INTEGER DEFAULT 0 (admin has reviewed flag)

### `voter_contact_staging` (NEW)
**Role:** Staging area for new voter contacts requiring verification before integration into `voter_contacts`. Used when volunteers submit contact forms for voters not yet in the system or requiring identity verification.

**Workflow:**
1. **Submission** → Volunteer submits contact form → Record created in `voter_contact_staging` with status='pending'
2. **Matching** → System attempts to match based on name/address/county → `potential_matches` populated
3. **Verification** → Admin reviews and either:
   - Links to existing voter → Sets `integrated_voter_id` and moves to `voter_contacts`
   - Creates new voter record → Generates new voter_id and moves to `voter_contacts`
   - Marks as duplicate/rejected → Updates `status` field
4. **Integration** → Once verified, data flows to `voter_contacts` with permanent voter_id

**Key Columns:**
- `staging_id` INTEGER PRIMARY KEY
- `voter_id` TEXT NOT NULL (temporary: 'TEMP-00000000' format)
- `status` TEXT ('pending', 'verified', 'duplicate', 'rejected')
- `submitted_at` DATETIME
- `submitted_by` TEXT NOT NULL (volunteer identifier)
- `vol_email` TEXT NOT NULL
- Search fields: `search_county`, `search_city`, `search_street_name`, `search_house_number`
- Voter info: `fn`, `ln`, `middle_name`, `suffix`
- Address: `addr1`, `house_number`, `street_name`, `city`, `county`, `zip`
- Contact: `phone_e164`, `email`, `contact_method`, `interaction_notes`
- Verification: `potential_matches` (JSON), `integrated_voter_id`, `needs_manual_review`

**Related Views:**
- `voter_contact`: Unified view of `voter_contacts` for admin interface
- `voter_contact_st`: Unified view of `voter_contact_staging` for review queue

### `wy_city_county`
**Role:** Authoritative city/county normalization table used to resolve `city_county_id`.

**Minimal columns:**
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
**Role:** Canonical, deduplicated street rows per city/county.

**Columns:**
- `street_id` INTEGER PRIMARY KEY
- `city_county_id` INTEGER NOT NULL REFERENCES wy_city_county(id)
- `street_prefix` TEXT (N, S, E, W, NE, etc.)
- `street_core` TEXT NOT NULL (name without house numbers)
- `street_type` TEXT (ST, RD, AVE, HWY, etc.)
- `street_suffix` TEXT
- `street_canonical` TEXT NOT NULL (normalized full street name)

**Normalization guarantees:**
- No leading house numbers in `street_core`
- `street_canonical` is normalized, trimmed, single-space join
- Uniqueness: one row per (city_county_id, prefix, core, type, suffix)

### `voters_addr_norm`
**Role:** Normalized voter addresses with resolved city/county.

**Columns:**
- `voter_id` TEXT PRIMARY KEY NOT NULL
- `ln`, `fn` TEXT (last/first name)
- `addr1` TEXT (street address)
- `city`, `state` TEXT
- `zip` TEXT
- `senate`, `house` TEXT (district codes)
- `city_county_id` INTEGER NOT NULL REFERENCES wy_city_county(id)

**Indexes:**
- `idx_voters_addr_norm_city` ON (city)
- `idx_voters_addr_norm_zip` ON (zip)
- `idx_voters_addr_norm_addr1_city` ON (addr1, city)
- `idx_voters_addr_norm_city_addr1` ON (city, addr1)
- `idx_voters_addr_norm_city_county_id` ON (city_county_id)

**View helper:**
```sql
CREATE VIEW v_voters_addr_norm AS
SELECT
  van.*,
  wcc.city_norm   AS city_resolved,
  wcc.county_norm AS county_resolved
FROM voters_addr_norm AS van
LEFT JOIN wy_city_county AS wcc ON wcc.id = van.city_county_id;
```

### `voter_phones`
**Role:** Phone numbers for voters, deduplicated.

**Columns:**
- `voter_id` TEXT NOT NULL
- `phone10` TEXT NOT NULL (10 digits)
- `phone_e164` TEXT NOT NULL (international format)

**Row Count:** 113,358

**Note:** `best_phone` table exists with same schema but is currently empty. The Worker API uses fallback logic: `best_phone` → `v_best_phone` → `voter_phones`.

### `best_phone`
**Role:** Curated "best" phone number per voter (highest confidence, Wyoming area codes preferred).

**Columns:**
- `voter_id` TEXT PRIMARY KEY
- `phone_e164` TEXT
- `confidence_code` INTEGER
- `is_wy_area` INTEGER
- `imported_at` TEXT

**Current State:** Table exists but is **empty** (0 rows). Phone data is currently only in `voter_phones`.

### `campaign_touchpoints` (NEW — Migration 010)
**Role:** Pre-scripted conversation flows for volunteers. Provides consistent messaging across phone banking, canvassing, and events. Each touchpoint is a reusable script with icebreaker, body, and call-to-action that can be targeted to specific voter segments.

**Columns:**
- `touchpoint_id` TEXT PRIMARY KEY (e.g., 'property_tax_relief_intro')
- `label` TEXT NOT NULL (display name for admin/volunteer UI)
- `icebreaker` TEXT NOT NULL (opening script: "Hi, this is...")
- `body` TEXT NOT NULL (main talking points)
- `cta_question` TEXT (call-to-action: "Can we count on your support?")
- `issue_tag` TEXT (topic categorization: 'property_tax', 'education', etc.)
- `channels` TEXT DEFAULT 'phone' (comma-separated: 'phone', 'door', 'event')
- `priority` INTEGER DEFAULT 100 (sort order, lower = higher priority)
- `is_active` INTEGER DEFAULT 1 (enable/disable without deleting)
- `metadata` TEXT (JSON for additional config/notes)
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP

**Seed Data:**
- `property_tax_relief_intro`: Example script for property tax outreach

**Usage:**
```sql
-- Get all active phone touchpoints, highest priority first
SELECT touchpoint_id, label, icebreaker, body, cta_question
FROM campaign_touchpoints
WHERE is_active = 1 AND channels LIKE '%phone%'
ORDER BY priority ASC, label ASC;
```

### `campaign_touchpoint_segments` (NEW — Migration 010)
**Role:** Targeting rules that link touchpoints to specific voter segments. Allows campaign to serve different scripts based on voter attributes (party, district, issue interest, etc.).

**Columns:**
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `touchpoint_id` TEXT NOT NULL REFERENCES campaign_touchpoints(touchpoint_id)
- `segment_key` TEXT NOT NULL (attribute name: 'party', 'house_district', 'senate_district', 'county', etc.)
- `segment_value` TEXT NOT NULL (value to match: 'R', 'D', 'U', '56', 'NATRONA', etc.)

**Indexes:**
- `idx_touchpoint_segments_key` ON (segment_key) - Fast lookups by attribute type
- `idx_touchpoint_segments_touchpoint` ON (touchpoint_id, segment_key) - Fast lookups per touchpoint

**Example Usage:**
```sql
-- Target "property tax relief" script only to Republicans in House District 56
INSERT INTO campaign_touchpoint_segments (touchpoint_id, segment_key, segment_value)
VALUES 
  ('property_tax_relief_intro', 'party', 'R'),
  ('property_tax_relief_intro', 'house_district', '56');

-- Find touchpoints for a specific voter
SELECT DISTINCT ct.*
FROM campaign_touchpoints ct
LEFT JOIN campaign_touchpoint_segments cts ON cts.touchpoint_id = ct.touchpoint_id
WHERE ct.is_active = 1
  AND (
    cts.touchpoint_id IS NULL  -- No segments = show to everyone
    OR (cts.segment_key = 'party' AND cts.segment_value = 'R')
    OR (cts.segment_key = 'house_district' AND cts.segment_value = '56')
  )
ORDER BY ct.priority ASC;
```

---

## Migration History

Applied migrations (from `d1_migrations` table):
- 001: Initial schema
- 002: Street normalization
- 003: Contact system foundation
- 004: Performance indexes (currently broken - attempts to index views)
- 005: Activity expansion
- 006: Voter contacts columns (best_day, best_time_window, share_insights_ok)
- 007: Reviewed flag on voter_contacts
- **008: District coverage table** (applied 2025-11-10)
- **010: Campaign touchpoints and segments** (applied 2025-11-11)

**Pending:** Migration 004 needs to be fixed (removes invalid view indexes) before it can be properly applied.

---

## Verification Commands

### Current schema inventory
```bash
cd /home/anchor/projects/grassrootsmvt/worker
npx wrangler d1 execute wy_local --local --command \
  "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name"
```

### District coverage verification
```bash
# Row count
npx wrangler d1 execute wy_local --local --command \
  "SELECT COUNT(*) as rows FROM district_coverage"

# Sample: House District 56
npx wrangler d1 execute wy_local --local --command \
  "SELECT * FROM district_coverage WHERE district_type='house' AND district_code='56'"

# All house districts in Natrona County
npx wrangler d1 execute wy_local --local --command \
  "SELECT DISTINCT district_code FROM district_coverage WHERE district_type='house' AND county='NATRONA' ORDER BY CAST(district_code AS INTEGER)"
```

### Phone data status
```bash
# voter_phones count
npx wrangler d1 execute wy_local --local --command \
  "SELECT COUNT(*) as count FROM voter_phones"

# best_phone count (should be 0)
npx wrangler d1 execute wy_local --local --command \
  "SELECT COUNT(*) as count FROM best_phone"

# Sample phone lookup
npx wrangler d1 execute wy_local --local --command \
  "SELECT * FROM voter_phones WHERE voter_id = '73693'"
```

### Contact system status
```bash
# Contact tables row counts
npx wrangler d1 execute wy_local --local --command \
  "SELECT 
    (SELECT COUNT(*) FROM voter_contacts) as contacts,
    (SELECT COUNT(*) FROM voter_contact_staging) as staging"
```

### Migration tracking
```bash
npx wrangler d1 execute wy_local --local --command \
  "SELECT * FROM d1_migrations ORDER BY id"
```

---

## API Endpoint Tests

### Test /api/metadata with district filtering
```bash
# House District 56 coverage
curl -sS http://127.0.0.1:8787/api/metadata?house_district=56 | jq

# Expected output:
# {
#   "ok": true,
#   "mode": "house_to_city",
#   "district": "56",
#   "counties": ["NATRONA"],
#   "cities": ["CASPER"]
# }
```

### Test /api/call with phone filtering
```bash
# Get next caller with phone
curl -sS http://127.0.0.1:8787/api/call \
  -H 'Content-Type: application/json' \
  -d '{"filters":{"county":"NATRONA","require_phone":true}}' | jq

# Note: Will return "No eligible voters" if best_phone table is empty
# Phone data exists in voter_phones but API primarily uses best_phone
```

### Test /api/canvass/nearby with districts
```bash
# Search near address with district data
curl -sS http://127.0.0.1:8787/api/canvass/nearby \
  -H 'Content-Type: application/json' \
  -d '{
    "filters":{"county":"NATRONA","city":"CASPER"},
    "house":5300,
    "street":"HANLY ST",
    "range":20,
    "limit":5
  }' | jq '.rows[] | {name, address, house_district, senate_district}'

# Expected: Returns voters with house_district and senate_district fields populated
```

---

## Known Issues & TODOs

### Phone Data
- ✅ `voter_phones` table populated (113,358 rows)
- ❌ `best_phone` table empty (0 rows)
- 🔄 API uses fallback logic but `require_phone` filter may not work correctly until `best_phone` is populated
- **Action:** Populate `best_phone` from `voter_phones` using confidence scoring logic

### Migrations
- ❌ Migration 004 is broken (attempts to create indexes on views)
- **Action:** Fix migration 004 by removing view index statements before applying to production

### Contact System
- ✅ Tables created (`voter_contacts`, `voter_contact_staging`)
- ✅ Views created (`voter_contact`, `voter_contact_st`)
- ✅ Columns added (best_day, best_time_window, share_insights_ok, reviewed)
- 🔄 No data yet in contact tables (development/testing phase)

---

## Provenance & Notes

This 2025-11-10 snapshot captures the schema state after:
1. Migration 008: District coverage table implementation
2. Contact system enhancements (migrations 006-007)
3. Phone data import completion
4. API endpoint updates for district filtering

**Previous snapshot:** `Local_D1_Schema_Snapshot_wy_local_20251026.md`

For any future schema changes, create a new dated snapshot file rather than editing this document.
