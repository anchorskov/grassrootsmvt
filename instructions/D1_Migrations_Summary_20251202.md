# D1 Migrations Summary — Updated 2025-12-02

> **Purpose**  
> Point-in-time summary of all D1 migrations and their purposes.  
> This document maps migration files to schema objects created.

---

## Migrations Overview

| Seq | File | Purpose | Tables Created |
|-----|------|---------|-----------------|
| 001 | `001_create_base_schema.sql` | Base voter and address infrastructure | voters (minimal), wy_city_county, streets_index, tmp_voter_street, voters_addr_norm, voter_phones |
| 002 | `002_create_system_tables.sql` | D1 metadata and tracking | d1_migrations |
| 003 | `003_add_call_activity.sql` | Call activity logging | call_activity |
| 004 | `004_add_performance_indexes.sql` | Performance optimization | (indexes only) |
| 005 | `005_add_activity_expansion.sql` | Extended activity data | (schema modifications) |
| 006 | `006_add_voter_contacts_columns.sql` | Voter contact management | voter_contacts |
| 007 | `007_add_reviewed_flag.sql` | Review workflow support | (column additions) |
| 008 | `008_create_district_coverage.sql` | District coverage tracking | district_coverage |
| 010 | `010_add_campaign_touchpoints.sql` | Campaign management | campaign_touchpoints, campaign_touchpoint_segments |
| 011 | `011_add_volunteer_fields.sql` | Volunteer management | volunteers |
| 012 | `012_add_streets_link_to_voters.sql` | Street-voter relationships | (column additions) |
| 013 | `013_create_volunteer_staging.sql` | Volunteer intake workflow | volunteer_staging |
| 014 | `014_add_state_to_volunteers.sql` | Volunteer state field | (column addition) |
| 015 | `015_add_city_to_volunteers.sql` | Volunteer city field | (column addition) |
| 016 | `016_create_legislature.sql` | Wyoming legislature reference | legislature |
| **017** | **`017_fix_voters_schema.sql`** | **Align voters to remote schema (5 cols)** | **(schema alignment)** |
| **018** | **`018_add_call_assignments.sql`** | **Call assignment locking** | **call_assignments** |
| **019** | **`019_add_call_followups.sql`** | **Follow-up scheduling** | **call_followups** |
| **020** | **`020_align_call_activity.sql`** | **Rename call_result→outcome, created_at→ts** | **(schema alignment)** |
| **021** | **`021_add_walk_management.sql`** | **Canvass/walk batch management** | **walk_batches, walk_assignments** |
| **022** | **`022_add_normalization_tables.sql`** | **Data import & normalization** | **voters_raw, voters_norm, v_best_phone_old, streets_index_old** |
| **023** | **`023_add_voter_contact_staging.sql`** | **Comprehensive voter contact submission workflow** | **voter_contact_staging** |
| **024** | **`024_expand_voter_contacts.sql`** | **Expand voter_contacts to 20+ columns** | **(schema expansion)** |
| **025** | **`025_add_views_and_indexes.sql`** | **Add v_best_phone table and views** | **v_best_phone (table), best_phone, city_county, v_street_keys (views)** |
| **026** | **`026_update_city_county_schema.sql`** | **Rename city/county to city_norm/county_norm** | **(schema alignment)** |

---

## Core Tables by Migration

### **001 - Base Schema**
Core voter and geographic infrastructure:
- **voters**: Primary voter records
- **wy_city_county**: City/county lookup reference
- **streets_index**: Canonical street names per city/county
- **tmp_voter_street**: Maps voters to streets
- **voters_addr_norm**: Normalized voter addresses (274,656 records)
- **voter_phones**: Phone directory (113,358 records)
- **v_best_phone**: View for best phone lookup

### **002 - System Tables**
Internal D1 and SQLite metadata:
- **d1_migrations**: Tracks applied migrations
- **_cf_METADATA**: Cloudflare D1 internal metadata
- **sqlite_sequence**: SQLite autoincrement tracking

### **003 - Call Activity**
Volunteer call tracking:
- **call_activity**: Logs voter calls with results and notes

### **008 - District Coverage**
Electoral coverage tracking:
- **district_coverage**: Maps districts to coverage status

### **010 - Campaign Touchpoints**
Campaign management:
- **campaign_touchpoints**: Individual touchpoint records
- **campaign_touchpoint_segments**: Segment assignments

### **011 - Volunteer Fields**
Volunteer database:
- **volunteers**: Volunteer records (id, name, first_name, last_name, cell_phone, is_active)

### **013 - Volunteer Staging**
Volunteer intake workflow:
- **volunteer_staging**: Staging table for new volunteer submissions (19 fields)

### **016 - Legislature** (NEW - 2025-12-02)
Wyoming state legislature reference:
- **legislature**: 93 elected officials with contact info (62 House, 31 Senate)

---

## Data Synchronization Status (2025-12-02)

| Table | Row Count | Local | Remote | Status |
|-------|-----------|-------|--------|--------|
| voters_addr_norm | 274,656 | ✅ | ✅ | Synchronized |
| legislature | 93 | ✅ | ✅ | Synchronized |
| streets_index | 17,308 | ✅ | ✅ | Synchronized |
| tmp_voter_street | 274,655 | ✅ | ✅ | Synchronized |
| voter_phones | 113,358 | ✅ | ✅ | Synchronized |
| volunteers | 11 | ✅ | ✅ | Synchronized |

---

## Migration Application Order

Migrations should be applied in numerical order for proper schema dependencies:

```bash
# Apply all migrations (wrangler handles order):
wrangler d1 migrations apply wy_local --local

# Or manually in sequence:
wrangler d1 execute wy_local --local < db/migrations/001_create_base_schema.sql
wrangler d1 execute wy_local --local < db/migrations/002_create_system_tables.sql
wrangler d1 execute wy_local --local < db/migrations/003_add_call_activity.sql
# ... continue through 016
```

---

## Notes

### Schema Alignment — December 2, 2025

**NEW MIGRATIONS (017-026)** were added to align local D1 schema with remote production:

- **Migrations 017-026** bring local schema to full parity with `REMOTE_D1_SCHEMA_FULL_20251202.sql`
- **All 26 migrations** now apply successfully to local database
- **Schema migration strategy**: Defensive ALTER TABLE approach to avoid breaking existing dependencies
- **Compatibility maintained**: Code already supports both old (call_result, created_at) and new (outcome, ts) column names via dynamic column detection (see `worker/src/index.js` lines 1094-1099, 2336, 2577)

**Key Changes in 017-026:**
- Migration 017: Adds political_party, county, senate, house columns to minimal voters table
- Migration 020: Adds outcome, ts, payload_json columns to call_activity (maintains call_result/created_at via coalesce)
- Migration 023: Creates comprehensive voter_contact_staging table with 40+ columns for form submissions
- Migration 024: Expands voter_contacts from 7 to 20+ columns for comprehensive contact tracking
- Migration 025: Creates v_best_phone optimization table and views (city_county, best_phone, v_street_keys)
- Migration 026: Adds city_norm/county_norm columns to wy_city_county for remote alignment

### Earlier Notes

- **Migration 016 (legislature)** was added 2025-12-02 to capture Wyoming state legislature data
- **Migrations 001-002** were added 2025-12-02 to document base schema that previously had no migration files
- Local D1 has been experiencing configuration issues with wrangler 4.51.0 (Miniflare database ID mismatch)
- Production database (remote `wy`) contains all live data and is authoritative for recovery
- All critical tables are now synchronized between local and remote environments

---

## Related Documents

- **Schema Snapshot**: `Local_D1_Schema_Snapshot_wy_local_20251201.md`
- **Volunteer Intake Feature**: `VOLUNTEER_INTAKE_FEATURE.md`
- **Project Instructions**: `project_instructions.md`

---

<!-- End of migrations summary 2025-12-02 -->
