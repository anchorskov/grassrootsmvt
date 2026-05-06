# D1 Database Schema Snapshot — May 5, 2026

## Executive Summary

This document is the incremental schema snapshot covering **migrations 027–031**, applied since the WORM snapshot of January 17, 2026. Read this document alongside `snapshot_D1_tables_01-17-26.md` for the full picture.

**Database:** Cloudflare D1 (SQLite)  
**Instances:** `wy_local` (local development) and `wy` (production remote)  
**Migrations covered:** 027–031 (both instances verified applied May 5, 2026)  
**Remote DB size after migration 031:** 128.16 MB  
**Total migrations applied (cumulative):** 31

---

## Changes Since January 17, 2026 Snapshot

### Migration 027 — `027_fix_voters_addr_norm_schema.sql`
**Table affected:** `voters_addr_norm`  
Corrects column definitions to match production remote schema. Adds or adjusts `addr_raw`, `fn`, `ln`, `zip`, `street_index_id` columns to ensure local and remote are aligned. No data changes.

---

### Migration 028 — `028_convert_city_county_id_to_integer.sql`
**Table affected:** `wy_city_county`, `voters_addr_norm`, `streets_index`  
Converts `city_county_id` from TEXT to INTEGER for consistent FK join performance. Handles both empty and populated table states gracefully. Repopulates normalized city/county data.

---

### Migration 029 — `029_create_field_support.sql`
**New tables:** `field_sessions`, `field_session_tasks`

#### field_sessions
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Session ID |
| volunteer_email | TEXT | NOT NULL | Field volunteer identifier |
| volunteer_name | TEXT | NULLABLE | Display name |
| status | TEXT | NOT NULL DEFAULT 'active' | 'active' or 'ended' |
| sharing_enabled | INTEGER | NOT NULL DEFAULT 0 | 1 = GPS sharing on |
| latest_lat | REAL | NULLABLE | Most recent GPS latitude |
| latest_lng | REAL | NULLABLE | Most recent GPS longitude |
| latest_accuracy_m | REAL | NULLABLE | GPS accuracy in metres |
| latest_location_at | TEXT | NULLABLE | Timestamp of last GPS ping |
| consent_text_version | TEXT | NULLABLE | Version of consent accepted |
| started_at | TEXT | NOT NULL DEFAULT datetime('now') | Session start |
| stopped_sharing_at | TEXT | NULLABLE | When sharing was paused |
| ended_at | TEXT | NULLABLE | Session end |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Record creation |
| updated_at | TEXT | NULLABLE | Last modification |

**Indexes:**
- `idx_field_sessions_active` on `(status, sharing_enabled, latest_location_at)`
- `idx_field_sessions_volunteer` on `(volunteer_email, status)`

#### field_session_tasks
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Task ID |
| session_id | INTEGER | NOT NULL FK → field_sessions(id) | Parent session |
| task_type | TEXT | NOT NULL | 'call_ahead' or 'next_stop' |
| status | TEXT | NOT NULL DEFAULT 'open' | 'open', 'confirmed', 'done', 'cancelled' |
| title | TEXT | NOT NULL | Voter name + address |
| notes | TEXT | NULLABLE | Call notes; auto-includes phone for call_ahead |
| scheduled_for | TEXT | NULLABLE | Optional scheduling hint |
| created_by | TEXT | NULLABLE | Admin email |
| created_at | TEXT | NOT NULL DEFAULT datetime('now') | Creation timestamp |
| updated_at | TEXT | NULLABLE | Last modification |
| completed_at | TEXT | NULLABLE | Completion timestamp |

**Indexes:**
- `idx_field_session_tasks_session` on `(session_id, status)`

**Purpose:** Enables real-time coordination between field canvassing volunteers (who share GPS) and call-center support volunteers (who see their location and can assign call-ahead / next-stop tasks).

---

### Migration 030 — `030_add_street_hint_to_field_sessions.sql`
**Table affected:** `field_sessions`

Added two columns populated automatically via Nominatim reverse-geocode when a volunteer shares their location:

| Column | Type | Purpose |
|--------|------|---------|
| street_hint | TEXT | Road/street name at volunteer's current position |
| city_hint | TEXT | City name at volunteer's current position |

**How it works:** `POST /field-sessions/:id/location` receives GPS coords, the field volunteer's browser calls Nominatim (`nominatim.openstreetmap.org/reverse`), extracts `road` and `city`, and sends them alongside the coordinates. The worker stores them in these columns for use by the support desk.

**Used by:** `GET /admin/field-sessions/:id/nearby-voters` resolves `street_hint` → `streets_index.street_canonical` → `street_index_id` for a precise indexed voter lookup.

---

### Migration 031 — `031_add_voter_coordinates.sql`
**Table affected:** `voters_addr_norm`

Added three columns for opportunistic voter geocoding:

| Column | Type | Purpose |
|--------|------|---------|
| lat | REAL | Voter address latitude |
| lng | REAL | Voter address longitude |
| geocoded_at | TEXT | ISO timestamp of last coordinate write |

**New index:**
- `idx_voters_addr_norm_lat_lng` on `(lat, lng)` — supports bounding-box proximity queries

**How coordinates are populated:**  
When `POST /canvass` logs a door contact and the request includes `location_lat`/`location_lng`, the worker opportunistically writes those coordinates back to `voters_addr_norm` for the contacted voter. Coordinates are refreshed if older than 30 days. The write is fire-and-forget — a failure does not affect the canvass log response.

**Coverage expectation:** Starts at 0%; grows as canvass volunteers log contacts with GPS enabled. Phone coverage for comparison: 41% (113,358 / 274,656 voters). Coordinate coverage will grow more slowly but covers a different dimension (physical location vs. contactability).

**Used by:** `GET /admin/field-sessions/:id/nearby-voters` — when no street hint exists but the session has GPS coordinates, the route falls back to a bounding-box query:
- ±0.003° latitude ≈ ±333m
- ±0.004° longitude ≈ ±333m at Wyoming latitude (~43°)
- Results ordered by Euclidean distance from session coordinates (phones-first within distance tiers)

**Query path priority in `/admin/field-sessions/:id/nearby-voters`:**
1. `street_hint` + `streets_index` exact canonical match → `street_index_id` filter (fastest, most precise)
2. `street_hint` + LIKE name match + city filter (fallback if no canonical ID found)
3. GPS bounding-box on `voters_addr_norm.lat/lng` (when no street hint; only works after coordinates have been populated)

---

## Updated Table: voters_addr_norm (Full Column List as of May 5, 2026)

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Unique voter identifier |
| addr1 | TEXT | NULLABLE | Normalized street address |
| city | TEXT | NOT NULL | City name |
| senate | TEXT | NULLABLE | State senate district |
| house | TEXT | NULLABLE | State house district |
| city_county_id | INTEGER | NULLABLE FK → wy_city_county(id) | City/county reference |
| street_index_id | INTEGER | NULLABLE FK → streets_index(id) | Canonical street reference |
| addr_raw | TEXT | NULLABLE | Full address with house number |
| fn | TEXT | NULLABLE | First name |
| ln | TEXT | NULLABLE | Last name |
| zip | TEXT | NULLABLE | ZIP code |
| lat | REAL | NULLABLE | GPS latitude (from canvass contact) |
| lng | REAL | NULLABLE | GPS longitude (from canvass contact) |
| geocoded_at | TEXT | NULLABLE | Timestamp of last coordinate update |

**Indexes (cumulative):**
- `PRIMARY KEY (voter_id)`
- `idx_voters_addr_norm_city` on `(city)`
- `idx_voters_addr_norm_city_county_id` on `(city_county_id)`
- `idx_voters_addr_norm_street_index_id` on `(street_index_id)`
- `idx_voters_addr_norm_lat_lng` on `(lat, lng)` ← **new in migration 031**

---

## New API Routes (Added with Coordination Feature)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/field-sessions` | volunteer | Start or resume field session |
| GET | `/field-sessions/me` | volunteer | Get session + open tasks |
| POST | `/field-sessions/:id/location` | volunteer | Share GPS + reverse-geocode hints |
| POST | `/field-sessions/:id/stop-sharing` | volunteer | Clear shared location |
| POST | `/field-sessions/:id/end` | volunteer | End session |
| GET | `/admin/field-sessions` | admin | All active sessions with tasks |
| GET | `/admin/field-sessions/:id/nearby-voters` | admin | Voters near session location (phones-first) |
| POST | `/admin/field-sessions/:id/tasks` | admin | Assign call-ahead or next-stop task |
| PATCH | `/admin/field-session-tasks/:id` | admin | Update task status |

---

## UI Pages (Added with Coordination Feature)

| Path | Purpose |
|------|---------|
| `/field-session/` | Field volunteer: start session, share GPS, view assigned tasks |
| `/admin/field-support.html` | Support desk: monitor active sessions, load nearby voters, assign tasks |

---

## Cumulative Migration List (001–031)

| # | File | Summary |
|---|------|---------|
| 001 | `001_create_base_schema.sql` | voters, wy_city_county, streets_index, voters_addr_norm, voter_phones, v_best_phone |
| 002 | `002_create_system_tables.sql` | d1_migrations tracking |
| 003 | `003_add_call_activity.sql` | call_activity table |
| 004 | `004_add_performance_indexes.sql` | Core performance indexes |
| 005 | `005_add_activity_expansion.sql` | canvass_activity (with location_lat/lng) |
| 006 | `006_add_voter_contacts_columns.sql` | voter_contacts columns |
| 007 | `007_add_reviewed_flag.sql` | reviewed flag on voter_contacts |
| 008 | `008_create_district_coverage.sql` | district_coverage (549 rows) |
| 010 | `010_add_campaign_touchpoints.sql` | campaign_touchpoints, campaign_touchpoint_segments |
| 011 | `011_add_volunteer_fields.sql` | volunteers table expansion |
| 012 | `012_add_streets_link_to_voters.sql` | street_index_id on voters_addr_norm |
| 013 | `013_create_volunteer_staging.sql` | volunteer_staging intake table |
| 014 | `014_add_state_to_volunteers.sql` | state column on volunteers |
| 015 | `015_add_city_to_volunteers.sql` | city column on volunteers |
| 016 | `016_create_legislature.sql` | legislature table (93 WY legislators) |
| 017 | `017_fix_voters_schema.sql` | Align voters to remote schema |
| 018 | `018_add_call_assignments.sql` | call_assignments locking table |
| 019 | `019_add_call_followups.sql` | call_followups scheduling table |
| 020 | `020_align_call_activity.sql` | outcome/ts column aliases |
| 021 | `021_add_walk_management.sql` | walk_batches, walk_assignments |
| 022 | `022_add_normalization_tables.sql` | voters_raw, voters_norm |
| 023 | `023_add_voter_contact_staging.sql` | voter_contact_staging pipeline |
| 024 | `024_expand_voter_contacts.sql` | Expand voter_contacts columns |
| 025 | `025_add_views_and_indexes.sql` | Views and indexes |
| 026 | `026_update_city_county_schema.sql` | City/county normalization |
| 027 | `027_fix_voters_addr_norm_schema.sql` | Align voters_addr_norm columns to remote |
| 028 | `028_convert_city_county_id_to_integer.sql` | city_county_id type fix |
| 029 | `029_create_field_support.sql` | field_sessions, field_session_tasks |
| 030 | `030_add_street_hint_to_field_sessions.sql` | street_hint, city_hint on field_sessions |
| 031 | `031_add_voter_coordinates.sql` | lat, lng, geocoded_at on voters_addr_norm |

---

## Data Synchronization Status (May 5, 2026)

| Table | Local | Remote | Status |
|-------|-------|--------|--------|
| voters | 274,656 | 274,656 | ✅ Identical |
| voters_addr_norm | 274,656 | 274,656 | ✅ Identical (lat/lng NULL, populating via canvass) |
| streets_index | 17,308 | 17,308 | ✅ Identical |
| voter_phones | 113,358 | 113,358 | ✅ Identical (~41% coverage) |
| field_sessions | active sessions | active sessions | ✅ Tables exist, live data diverges by design |
| field_session_tasks | active tasks | active tasks | ✅ Tables exist, live data diverges by design |
| legislature | 93 | 93 | ✅ Identical |
| wy_city_county | 199 | 199 | ✅ Identical |

---

## Related Documents

- `instructions/snapshot_D1_tables_01-17-26.md` — **WORM** point-in-time snapshot for migrations 001–026
- `docs/database_schema_reference.md` — Living reference document (updated May 5, 2026)
- `worker/db/migrations/` — All migration SQL files (authoritative)

---

**Snapshot Date:** May 5, 2026  
**Applied by:** Jim Skovgard  
**Verification:** Both `wy_local` (local) and `wy` (remote) confirmed via wrangler CLI  
**Next Review:** Upon next schema migration or monthly
