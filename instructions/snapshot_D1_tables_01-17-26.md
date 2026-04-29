# D1 Database Schema Snapshot — January 17, 2026

## Executive Summary

This document provides a comprehensive, point-in-time snapshot of the Grassroots MVT D1 database schema as of January 17, 2026. It represents the authoritative source of truth for all active tables, their relationships, indexes, and current row counts. This snapshot was verified against the actual running local D1 instance and consolidated from five prior evolution documents (10-26, 11-10, 11-30, 12-01, and 12-02).

**Database:** Cloudflare D1 (SQLite)
**Instance:** `wy_local` (local development) and `wy` (production remote)
**Total User Tables:** 30 (includes normalization, activity, reference, and staging tables)
**Total System Tables:** 2 (_cf_METADATA, sqlite_sequence)
**Total Views:** 1 (best_phone)
**Total Indexes:** 35+ (including auto-generated PRIMARY KEY indexes)

---

## Table of Contents

1. [Database Overview](#database-overview)
2. [Core Infrastructure Tables](#core-infrastructure-tables)
3. [Voter & Address Tables](#voter--address-tables)
4. [Activity & Interaction Tables](#activity--interaction-tables)
5. [Reference & Configuration Tables](#reference--configuration-tables)
6. [Volunteer & Workflow Tables](#volunteer--workflow-tables)
7. [Table Relationships](#table-relationships)
8. [Views](#views)
9. [Indexes](#indexes)
10. [Data Synchronization Status](#data-synchronization-status)

---

## Database Overview

### Databases
- **wy_local**: Local development instance (SQLite via Cloudflare D1)
- **wy**: Production remote instance (identical schema and data as of 2025-12-02)

### Parent Database
All tables reside in a single SQLite database managed by Cloudflare D1. The database structure emphasizes:
- **Voter normalization** and address resolution
- **Activity logging** for volunteer interactions (calls, canvass, events)
- **Reference data** for district, state legislature, and configuration
- **Workflow staging** for volunteer intake and contact verification

### System Tables
- **d1_migrations**: Tracks applied schema migrations (26 total applied)
- **sqlite_sequence**: SQLite internal autoincrement tracking
- **_cf_METADATA**: Cloudflare D1 internal metadata (system-managed)

---

## Core Infrastructure Tables

### 1. wy_city_county
**Role:** Authoritative city/county normalization reference table

**Database:** Single SQLite database  
**Current Row Count:** 199  
**Primary Key:** `id` (INTEGER)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY | City/county combination identifier |
| city | TEXT | NOT NULL | City name (normalized) |
| county | TEXT | NOT NULL | County name (normalized) |
| state | TEXT | DEFAULT 'WY' | State abbreviation |

**Notes:**
- Authoritative source for all city/county resolutions
- Used as foreign key reference in `streets_index` and `voters_addr_norm`
- Contains complete Wyoming city/county combinations (199 unique combinations)

**Sample Query:**
```sql
SELECT * FROM wy_city_county WHERE county = 'NATRONA' LIMIT 5;
```

---

### 2. streets_index
**Role:** Canonical, deduplicated street normalization index

**Database:** Single SQLite database  
**Current Row Count:** 17,308  
**Primary Key:** `id` (INTEGER)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY | Unique street identifier |
| city_county_id | INTEGER | NOT NULL FK → wy_city_county(id) | City/county reference |
| street_prefix | TEXT | NULLABLE | Direction prefix (N, S, E, W, NE, etc.) |
| street_core | TEXT | NOT NULL | Street name without numbers/units |
| street_type | TEXT | NULLABLE | Street type (ST, RD, AVE, HWY, DR, etc.) |
| street_suffix | TEXT | NULLABLE | Trailing street qualifier |
| street_canonical | TEXT | NOT NULL | Normalized full street name |
| raw_address | TEXT | NULLABLE | Original address string before normalization |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated as `sqlite_autoindex_streets_index_1`
- Foreign key index on `city_county_id` (implicit)

**Normalization Guarantees:**
- No leading house numbers in `street_core`
- `street_canonical` is a normalized, trimmed, single-space join of present parts
- Format: `[prefix] core [type] [suffix]`
- Uniqueness per street ID (canonical deduplication)

**Example Records:**
```
id | city_county_id | street_prefix | street_core | street_type | street_suffix | street_canonical
1  | 15             | NULL          | Main        | ST          | NULL          | Main ST
2  | 15             | E             | 1st         | AVE         | NULL          | E 1st AVE
3  | 25             | NULL          | Elk         | RD           | NULL          | Elk RD
```

**Sample Query:**
```sql
SELECT * FROM streets_index WHERE city_county_id = 15 LIMIT 10;
```

---

### 3. streets_index_old
**Role:** Archive of pre-normalization street data (legacy, not actively used)

**Current Row Count:** 17,295  
**Purpose:** Backup reference table from prior normalization approach

**Columns:** Similar to `streets_index` but without `id` PRIMARY KEY

---

### 4. tmp_voter_street
**Role:** Maps voters to their canonical street references

**Database:** Single SQLite database  
**Current Row Count:** 274,655  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY FK → voters(voter_id) | Voter identifier |
| streets_index_id | INTEGER | NULLABLE FK → streets_index(id) | Link to canonical street |

**Indexes:**
- `PRIMARY KEY (voter_id)` — auto-generated as `sqlite_autoindex_tmp_voter_street_1`

**Purpose:** Enables fast lookup of voters by street, supporting features like "nearby voters" queries

**Sample Query:**
```sql
SELECT v.voter_id, v.county, s.street_canonical
FROM tmp_voter_street tv
JOIN streets_index s ON tv.streets_index_id = s.id
JOIN voters v ON tv.voter_id = v.voter_id
WHERE s.city_county_id = 15
LIMIT 20;
```

---

## Voter & Address Tables

### 5. voters
**Role:** Core voter registration record (minimal schema)

**Database:** Single SQLite database  
**Current Row Count:** 274,656  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Unique voter identifier |
| political_party | TEXT | NULLABLE | Party affiliation (D, R, L, etc.) |
| county | TEXT | NULLABLE | County name |
| senate | TEXT | NULLABLE | State senate district |
| house | TEXT | NULLABLE | State house district |

**Indexes:**
- `PRIMARY KEY (voter_id)` — auto-generated
- `idx_voters_party` on `(political_party)`
- `idx_voters_county` on `(county)`
- `idx_voters_senate` on `(senate)`
- `idx_voters_house` on `(house)`
- `idx_voters_county_senate` on `(county, senate)`
- `idx_voters_county_house` on `(county, house)`

**Design Note:** This table was created with minimal schema during migration 017. Full voter data is split across `voters_addr_norm`, `voters_raw`, and `voters_norm`.

**Sample Query:**
```sql
SELECT * FROM voters WHERE county = 'NATRONA' AND political_party = 'R' LIMIT 10;
```

---

### 6. voters_addr_norm
**Role:** Canonical voter address normalization table (primary address source)

**Database:** Single SQLite database  
**Current Row Count:** 274,656  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Unique voter identifier |
| addr1 | TEXT | NULLABLE | Normalized street address (without house #) |
| city | TEXT | NOT NULL | City name |
| senate | TEXT | NULLABLE | State senate district |
| house | TEXT | NULLABLE | State house district |
| city_county_id | INTEGER | NULLABLE FK → wy_city_county(id) | City/county reference |
| street_index_id | INTEGER | NULLABLE FK → streets_index(id) | Street canonical reference |
| addr_raw | TEXT | NULLABLE | Full address including house numbers |
| fn | TEXT | NULLABLE | First name |
| ln | TEXT | NULLABLE | Last name |
| zip | TEXT | NULLABLE | Zip code |

**Indexes:**
- `PRIMARY KEY (voter_id)` — auto-generated
- `idx_voters_addr_norm_city` on `(city)`
- `idx_voters_addr_norm_city_county_id` on `(city_county_id)`
- `idx_voters_addr_norm_street_index_id` on `(street_index_id)`

**Sync Status:** Fully synchronized with remote database (274,656 rows on both instances)

**Sample Query:**
```sql
SELECT v.voter_id, v.fn, v.ln, v.addr1, v.city, s.street_canonical
FROM voters_addr_norm v
LEFT JOIN streets_index s ON v.street_index_id = s.id
WHERE v.city = 'Cheyenne'
LIMIT 20;
```

---

### 7. voters_raw
**Role:** Raw voter import data before normalization

**Database:** Single SQLite database  
**Current Row Count:** 274,656  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Unique voter identifier |
| first_name | TEXT | NULLABLE | First name from import |
| last_name | TEXT | NULLABLE | Last name from import |
| ra_city | TEXT | NULLABLE | Raw city from import |
| ra_zip | TEXT | NULLABLE | Raw zip from import |
| county | TEXT | NULLABLE | County from import |
| precinct | TEXT | NULLABLE | Precinct identifier |
| house | TEXT | NULLABLE | House district from import |
| senate | TEXT | NULLABLE | Senate district from import |

**Purpose:** Archive of original import data before any normalization; used for recovery and audit trails

---

### 8. voters_norm
**Role:** Extended voter normalization metadata

**Database:** Single SQLite database  
**Current Row Count:** 274,656  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Unique voter identifier |
| party_form5 | TEXT | NULLABLE | Party affiliation from Form 5 |
| reg_year | INTEGER | NULLABLE | Registration year |

**Purpose:** Additional normalization metadata (Form 5 compliance, registration tracking)

---

### 9. voter_phones
**Role:** Voter phone number directory

**Database:** Single SQLite database  
**Current Row Count:** 113,358  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Phone record identifier |
| voter_id | TEXT | NOT NULL FK → voters(voter_id) | Voter reference |
| phone_number | TEXT | NOT NULL | Phone number (E.164 format recommended) |
| phone_type | TEXT | NULLABLE | Type (mobile, landline, etc.) |
| is_primary | INTEGER | DEFAULT 0 | Flag: is this the primary phone? |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated
- `idx_voter_phones_voter_id` on `(voter_id)`

**Notes:**
- 113,358 unique phone numbers for ~274,656 voters (coverage ~41%)
- Data imported and deduplicated from CSV source
- E.164 format recommended for `phone_number` (e.g., +13105551234)

**Sample Query:**
```sql
SELECT v.voter_id, v.fn, v.ln, vp.phone_number, vp.is_primary
FROM voter_phones vp
JOIN voters v ON vp.voter_id = v.voter_id
WHERE vp.phone_number LIKE '307%'
LIMIT 20;
```

---

## Activity & Interaction Tables

### 10. call_activity
**Role:** Logging and tracking of volunteer phone calls

**Database:** Single SQLite database  
**Current Row Count:** 2  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Activity record ID |
| voter_id | TEXT | NOT NULL | Voter being called |
| volunteer_email | TEXT | NOT NULL | Volunteer email/identifier |
| call_result | TEXT | NULLABLE | Legacy call result field (replaced by outcome) |
| notes | TEXT | NULLABLE | Free-form notes from volunteer |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Legacy timestamp field |
| pulse_opt_in | BOOLEAN | DEFAULT 0 | SMS/text consent |
| pitch_used | TEXT | NULLABLE | Script/pitch variant used |
| duration_seconds | INTEGER | DEFAULT 0 | Call duration |
| response_sentiment | TEXT | CHECK IN ('Supportive', 'Neutral', 'Opposed', 'Unknown') | Sentiment classification |
| issue_interest | TEXT | NULLABLE | Issues voter expressed interest in |
| followup_needed | BOOLEAN | DEFAULT 0 | Requires follow-up flag |
| followup_date | TEXT | NULLABLE | Scheduled follow-up date |
| outcome | TEXT | NULLABLE | Result of call (replaces call_result) |
| ts | TEXT | NULLABLE | ISO 8601 timestamp (replaces created_at) |
| payload_json | TEXT | NULLABLE | Extended JSON metadata |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated

**Design Note:** Table supports both legacy (call_result, created_at) and new (outcome, ts) column names via code-level compatibility layer; queries use COALESCE() to handle both.

**Sample Query:**
```sql
SELECT id, voter_id, COALESCE(outcome, call_result) as result, COALESCE(ts, created_at) as timestamp
FROM call_activity
WHERE DATE(COALESCE(ts, created_at)) = '2026-01-17'
ORDER BY created_at DESC;
```

---

### 11. call_assignments
**Role:** Voter call assignment locking and volunteer coordination

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY FK → voters(voter_id) | Voter assigned |
| volunteer_id | TEXT | NOT NULL | Volunteer assigned |
| locked_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Lock timestamp |
| lock_expires_at | DATETIME | NULLABLE | When lock expires |

**Indexes:**
- `PRIMARY KEY (voter_id)` — auto-generated as `sqlite_autoindex_call_assignments_1`

**Purpose:** Prevents concurrent volunteer assignments to same voter; implements optimistic locking with expiration

---

### 12. call_followups
**Role:** Scheduling follow-up calls for voters

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Followup record ID |
| voter_id | TEXT | NOT NULL FK → voters(voter_id) | Voter to follow up with |
| due_date | DATE | NULLABLE | Date followup is due |
| reason | TEXT | NULLABLE | Reason for followup |
| created_by | TEXT | NOT NULL | Volunteer/user who created |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| done | INTEGER | DEFAULT 0 | Completion flag (0=pending, 1=completed) |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated

---

### 13. canvass_activity
**Role:** Logging of door-to-door canvassing interactions

**Database:** Single SQLite database  
**Current Row Count:** 2  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Activity record ID |
| voter_id | TEXT | NOT NULL FK → voters(voter_id) | Voter contacted |
| volunteer_email | TEXT | NOT NULL | Volunteer email |
| result | TEXT | CHECK IN ('Contacted', 'Not Home', 'Moved', 'Refused', 'Do Not Contact') | Contact result |
| notes | TEXT | NULLABLE | Free-form notes |
| pulse_opt_in | BOOLEAN | DEFAULT 0 | SMS consent flag |
| pitch_used | TEXT | NULLABLE | Script/pitch variant |
| location_lat | REAL | NULLABLE | Door GPS latitude |
| location_lng | REAL | NULLABLE | Door GPS longitude |
| door_status | TEXT | CHECK IN ('Knocked', 'No Access', 'Skipped') | Door interaction status |
| followup_needed | BOOLEAN | DEFAULT 0 | Requires follow-up flag |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated

**Sample Query:**
```sql
SELECT v.voter_id, v.fn, v.ln, ca.result, ca.created_at
FROM canvass_activity ca
JOIN voters v ON ca.voter_id = v.voter_id
WHERE DATE(ca.created_at) = '2026-01-17'
ORDER BY ca.created_at DESC;
```

---

## Reference & Configuration Tables

### 14. legislature
**Role:** Wyoming state legislature reference data (elected officials)

**Database:** Single SQLite database  
**Current Row Count:** 93  
**Primary Key:** `voter_id` (INTEGER)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | INTEGER | PRIMARY KEY | Legislator's voter record ID (or sequence number) |
| name | TEXT | NOT NULL | Full name of legislator |
| chamber | TEXT | NOT NULL | House or Senate |
| district | INTEGER | NULLABLE | Legislative district number |
| city | TEXT | NULLABLE | City of residence |
| county | TEXT | NULLABLE | County served |
| party | TEXT | NULLABLE | Party affiliation (R, D, L, etc.) |
| affiliations | TEXT | NULLABLE | Caucus/group memberships (JSON or comma-delimited) |
| campaign_website | TEXT | NULLABLE | Campaign website URL |
| official_profile_url | TEXT | NULLABLE | Official legislature profile URL |
| phone | TEXT | NULLABLE | Legislative office phone number |
| email | TEXT | NOT NULL | Official legislature email address |
| updated | TEXT | NULLABLE | Last update date (YYYY-MM-DD format) |

**Data Distribution (93 total):**
- House: 62 members (67%)
- Senate: 31 members (33%)
- Republican (R): 85 members (91.4%)
- Democratic (D): 8 members (8.6%)

**Indexes:**
- `PRIMARY KEY (voter_id)` — auto-generated

**Sample Query:**
```sql
SELECT name, chamber, district, party, email
FROM legislature
WHERE chamber = 'House' AND county = 'Natrona'
ORDER BY district;
```

---

### 15. district_coverage
**Role:** Maps electoral districts to geographic areas for filtering/targeting

**Database:** Single SQLite database  
**Current Row Count:** 549  
**Primary Key:** Composite (district_type, district_code, county, city)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| district_type | TEXT | NOT NULL CHECK IN ('house','senate') | District type |
| district_code | TEXT | NOT NULL | District identifier (zero-padded, e.g., '01', '56') |
| county | TEXT | NOT NULL | County name (uppercase) |
| city | TEXT | NOT NULL DEFAULT '' | City name (uppercase, empty if countywide) |

**Indexes:**
- `PRIMARY KEY (district_type, district_code, county, city)` — auto-generated
- Implicit index on `(district_type, district_code)` for district lookups
- Implicit index on `(county, city)` for geographic lookups

**Sample Query:**
```sql
-- Get all counties in House District 56
SELECT DISTINCT county FROM district_coverage
WHERE district_type = 'house' AND district_code = '56'
ORDER BY county;

-- Get all house districts in Natrona County
SELECT DISTINCT district_code FROM district_coverage
WHERE district_type = 'house' AND county = 'NATRONA'
ORDER BY CAST(district_code AS INTEGER);
```

---

### 16. campaign_touchpoints
**Role:** Volunteer conversation scripts and messaging catalog

**Database:** Single SQLite database  
**Current Row Count:** 1  
**Primary Key:** `touchpoint_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| touchpoint_id | TEXT | PRIMARY KEY | Slug identifier (e.g., property_tax_relief_intro) |
| label | TEXT | NOT NULL | Admin-facing title |
| icebreaker | TEXT | NOT NULL | Opening line for volunteers |
| body | TEXT | NOT NULL | Main talking points |
| cta_question | TEXT | NULLABLE | Closing ask/call-to-action |
| issue_tag | TEXT | NULLABLE | Taxonomy tag (e.g., 'property_tax', 'education') |
| channels | TEXT | DEFAULT 'phone' | Comma-delimited channels (phone, door, event, etc.) |
| priority | INTEGER | DEFAULT 100 | Serve priority (lower = earlier) |
| is_active | INTEGER | DEFAULT 1 | Soft toggle (0=inactive, 1=active) |
| metadata | TEXT | NULLABLE | JSON blob for extended data (links, resources) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- `PRIMARY KEY (touchpoint_id)` — auto-generated as `sqlite_autoindex_campaign_touchpoints_1`

**Usage:** API endpoint `/api/script` resolves active touchpoint for voter, honoring channel filters and segments

---

### 17. campaign_touchpoint_segments
**Role:** Voter targeting rules for campaign touchpoints (segmentation)

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Segment rule ID |
| touchpoint_id | TEXT | NOT NULL FK → campaign_touchpoints(touchpoint_id) | Touchpoint reference |
| segment_key | TEXT | NOT NULL | Field to match (e.g., 'party', 'county', 'house_district') |
| segment_value | TEXT | NOT NULL | Value to match (case-insensitive comparison) |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated
- Implicit index on `(segment_key)` for quick segment lookups
- Implicit index on `(touchpoint_id, segment_key)` for touchpoint-specific rules

**Sample Query:**
```sql
-- Find all touchpoints targeting Republican voters
SELECT DISTINCT tp.touchpoint_id, tp.label, ts.segment_value
FROM campaign_touchpoint_segments ts
JOIN campaign_touchpoints tp ON ts.touchpoint_id = tp.touchpoint_id
WHERE ts.segment_key = 'party' AND ts.segment_value = 'R'
AND tp.is_active = 1;
```

---

### 18. message_templates
**Role:** Reusable messaging templates for volunteers

**Database:** Single SQLite database  
**Current Row Count:** 3  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Template ID |
| title | TEXT | NOT NULL | Template title |
| category | TEXT | CHECK IN ('phone', 'canvass', 'general') | Message category |
| body_text | TEXT | NOT NULL | Message template body |
| is_active | BOOLEAN | DEFAULT 1 | Active flag |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated

---

## Volunteer & Workflow Tables

### 19. volunteers
**Role:** Volunteer/organizer contact registry

**Database:** Single SQLite database  
**Current Row Count:** 9  
**Primary Key:** `id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | TEXT | PRIMARY KEY | Email or Cloudflare Access ID |
| name | TEXT | NOT NULL | Full name (legacy) |
| first_name | TEXT | NULLABLE | First name |
| last_name | TEXT | NULLABLE | Last name |
| cell_phone | TEXT | NULLABLE | Phone number (E.164 recommended) |
| is_active | INTEGER | DEFAULT 1 | Active flag (0=inactive, 1=active) |
| state | TEXT | NULLABLE | State |
| city | TEXT | NULLABLE | City |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated
- `idx_volunteers_cell_phone` on `(cell_phone)` — accelerates opt-in lookups and exports

**Sample Query:**
```sql
SELECT id, first_name, last_name, cell_phone, is_active
FROM volunteers
WHERE is_active = 1
ORDER BY first_name, last_name;
```

---

### 20. volunteer_staging
**Role:** Intake workflow for new volunteer submissions

**Database:** Single SQLite database  
**Current Row Count:** 1  
**Primary Key:** `staging_id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| staging_id | INTEGER | PRIMARY KEY AUTOINCREMENT | Staging record ID |
| submitted_by | TEXT | NOT NULL | Submitter identifier |
| action | TEXT | DEFAULT 'new' | Action type (new, update, etc.) |
| target_id | TEXT | NULLABLE | Target volunteer ID for updates |
| first_name | TEXT | NULLABLE | First name |
| last_name | TEXT | NULLABLE | Last name |
| email | TEXT | NULLABLE | Email address |
| cell_phone | TEXT | NULLABLE | Phone number |
| county | TEXT | NULLABLE | County |
| city | TEXT | NULLABLE | City |
| notes | TEXT | NULLABLE | Submission notes |
| is_active | INTEGER | NULLABLE | Active flag |
| review_status | TEXT | DEFAULT 'pending' | Review workflow (pending, approved, rejected) |
| review_notes | TEXT | NULLABLE | Reviewer notes |
| reviewed_by | TEXT | NULLABLE | Reviewer identifier |
| reviewed_at | TEXT | NULLABLE | Review timestamp |
| created_at | TEXT | DEFAULT (datetime('now')) | Submission timestamp |
| updated_at | TEXT | NULLABLE | Last update timestamp |
| state | TEXT | NULLABLE | State |

**Indexes:**
- `PRIMARY KEY (staging_id)` — auto-generated
- `idx_volunteer_staging_status` on `(review_status)`
- `idx_volunteer_staging_target` on `(target_id)`

**Workflow:**
1. Volunteer submits form → Record created in staging with status='pending'
2. Admin reviews via `/admin/volunteers`
3. Admin approves → Moves to `volunteers` table
4. Admin rejects → Marked as rejected

---

### 21. walk_batches
**Role:** Canvass/walk campaign batch management

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Batch ID |
| volunteer_id | TEXT | NOT NULL FK → volunteers(id) | Volunteer assigned |
| county | TEXT | NULLABLE | Target county |
| city | TEXT | NULLABLE | Target city |
| district | TEXT | NULLABLE | Target district |
| precinct | TEXT | NULLABLE | Target precinct |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Batch creation timestamp |

**Purpose:** Groups voters for organized door-to-door canvass walks; linked to `walk_assignments`

---

### 22. walk_assignments
**Role:** Individual voter assignments within a walk batch

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** Composite (batch_id, voter_id)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| batch_id | INTEGER | NOT NULL FK → walk_batches(id) | Batch reference |
| voter_id | TEXT | NOT NULL FK → voters(voter_id) | Voter assigned |
| position | INTEGER | NULLABLE | Door order within batch |

**Indexes:**
- `PRIMARY KEY (batch_id, voter_id)` — auto-generated

**Workflow:**
1. Admin creates `walk_batches` with county/city/district filters
2. System populates `walk_assignments` with matched voters
3. Volunteer downloads batch via mobile app
4. Volunteer logs contacts in `canvass_activity`

---

## Voter Contact & Verification Tables

### 23. voter_contacts
**Role:** Final, verified contact records from all interaction channels

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Contact record ID |
| voter_id | TEXT | NOT NULL UNIQUE FK → voters(voter_id) | Voter contacted |
| best_day | TEXT | NULLABLE | Preferred callback day |
| best_time_window | TEXT | NULLABLE | Preferred callback time (e.g., 'morning', 'evening') |
| share_insights_ok | INTEGER | DEFAULT 0 | Voter okay with feedback sharing |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | DATETIME | NULLABLE | Last update timestamp |
| reviewed | INTEGER | DEFAULT 0 | Admin review flag |
| volunteer_id | TEXT | NULLABLE FK → volunteers(id) | Volunteer who made contact |
| method | TEXT | NULLABLE | Contact method (door, phone, event, etc.) |
| outcome | TEXT | NULLABLE | Contact result |
| ok_callback | INTEGER | DEFAULT 0 | Callback consent |
| requested_info | INTEGER | DEFAULT 0 | Voter wants information |
| dnc | INTEGER | DEFAULT 0 | Do Not Contact flag |
| optin_sms | INTEGER | DEFAULT 0 | SMS consent |
| optin_email | INTEGER | DEFAULT 0 | Email consent |
| email | TEXT | NULLABLE | Email address from contact |
| wants_volunteer | INTEGER | DEFAULT 0 | Interest in volunteering |
| for_term_limits | INTEGER | DEFAULT 0 | Position on term limits |
| issue_public_lands | INTEGER | DEFAULT 0 | Interest in public lands |
| comments | TEXT | NULLABLE | Free-form contact notes |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated
- `idx_voter_contacts_voter_id` on `(voter_id)`
- `idx_voter_contacts_volunteer_id` on `(volunteer_id)`
- `idx_voter_contacts_created_at` on `(created_at)`
- `idx_voter_contacts_reviewed` on `(reviewed)`

**Unique Constraint:** `voter_id` is UNIQUE (one contact record per voter)

---

### 24. voter_contact_staging
**Role:** Staging and verification of new voter contact submissions before integration

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `staging_id` (INTEGER AUTOINCREMENT)

**Columns (Comprehensive):**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| staging_id | INTEGER | PRIMARY KEY AUTOINCREMENT | Staging record ID |
| voter_id | TEXT | NOT NULL DEFAULT 'TEMP-00000000' | Voter ID (temporary until verified) |
| submitted_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Submission timestamp |
| submitted_by | TEXT | NOT NULL | Submitter identifier |
| vol_email | TEXT | NOT NULL | Volunteer email |
| status | TEXT | DEFAULT 'pending' CHECK IN ('pending', 'verified', 'duplicate', 'rejected') | Verification status |
| search_county | TEXT | NOT NULL | Search county for matching |
| search_city | TEXT | NULLABLE | Search city for matching |
| search_street_name | TEXT | NULLABLE | Search street for matching |
| search_house_number | TEXT | NULLABLE | Search house number for matching |
| fn | TEXT | NOT NULL | First name |
| ln | TEXT | NOT NULL | Last name |
| middle_name | TEXT | NULLABLE | Middle name |
| suffix | TEXT | NULLABLE | Name suffix (Jr., Sr., III, etc.) |
| addr1 | TEXT | NOT NULL | Street address |
| house_number | TEXT | NULLABLE | House number |
| street_name | TEXT | NULLABLE | Street name |
| street_type | TEXT | NULLABLE | Street type (ST, RD, AVE, etc.) |
| unit_number | TEXT | NULLABLE | Unit/apartment number |
| city | TEXT | NOT NULL | City |
| county | TEXT | NOT NULL | County |
| state | TEXT | DEFAULT 'WY' | State |
| zip | TEXT | NULLABLE | Zip code |
| phone_e164 | TEXT | NULLABLE | Primary phone (E.164 format) |
| phone_secondary | TEXT | NULLABLE | Secondary phone |
| email | TEXT | NULLABLE | Email address |
| political_party | TEXT | NULLABLE | Party affiliation |
| voting_likelihood | TEXT | CHECK IN ('high', 'medium', 'low', 'unknown') | Predicted voter likelihood |
| contact_method | TEXT | CHECK IN ('door', 'phone', 'event', 'referral', 'online') | How contact was made |
| interaction_notes | TEXT | NULLABLE | Interaction details |
| issues_interested | TEXT | NULLABLE | Issues voter cares about |
| volunteer_notes | TEXT | NULLABLE | Volunteer comments |
| potential_matches | TEXT | NULLABLE | JSON array of matching voter_ids |
| verification_notes | TEXT | NULLABLE | Admin verification notes |
| verified_at | DATETIME | NULLABLE | Verification completion timestamp |
| verified_by | TEXT | NULLABLE | Verifier identifier |
| integrated_voter_id | TEXT | NULLABLE | Final voter_id after integration |
| needs_manual_review | BOOLEAN | DEFAULT FALSE | Manual review required flag |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |
| pulse_optin | BOOLEAN | DEFAULT FALSE | SMS/text consent |
| pulse_phone_digits | TEXT | NULLABLE | Last 4 digits of phone for SMS consent |

**Indexes:**
- `PRIMARY KEY (staging_id)` — auto-generated

**Workflow:**
1. **Submission** → Volunteer submits contact form → Record created in staging with status='pending'
2. **Matching** → System queries `voters_addr_norm` by name/address/county → Populates `potential_matches` (JSON array)
3. **Verification** → Admin reviews matches via `/admin/contacts`
4. **Integration** → Admin:
   - Clicks "Link to Voter X" → Sets `integrated_voter_id` = voter_id and status='verified'
   - **OR** Creates new voter if not found → Generates new voter_id
   - Moves contact data to `voter_contacts` table
   - Marks original staging record as 'verified' or 'rejected'

---

### 25. pulse_optins
**Role:** Text message (SMS/Pulse) consent tracking

**Database:** Single SQLite database  
**Current Row Count:** 10  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Opt-in record ID |
| voter_id | TEXT | NOT NULL FK → voters(voter_id) | Voter who opted in |
| contact_method | TEXT | CHECK IN ('sms', 'email') | Contact method |
| consent_given | BOOLEAN | DEFAULT 1 | Consent flag (1=opted in, 0=opted out) |
| consent_source | TEXT | CHECK IN ('call', 'canvass', 'webform') | Where consent came from |
| volunteer_email | TEXT | NULLABLE | Volunteer who recorded consent |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Consent timestamp |

**Indexes:**
- `PRIMARY KEY (id)` — auto-generated

**Sample Query:**
```sql
SELECT v.voter_id, v.fn, v.ln, po.contact_method, po.consent_given, po.created_at
FROM pulse_optins po
JOIN voters v ON po.voter_id = v.voter_id
WHERE po.contact_method = 'sms' AND po.consent_given = 1
AND DATE(po.created_at) >= '2026-01-01';
```

---

### 26. v_best_phone
**Role:** Optimization table for best phone number lookups (curated phone records)

**Database:** Single SQLite database  
**Current Row Count:** 0  
**Primary Key:** `voter_id` (TEXT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Voter identifier |
| phone_e164 | TEXT | NULLABLE | Best phone number (E.164 format) |
| confidence_code | INTEGER | NULLABLE | Confidence score (0-100) |
| is_wy_area | INTEGER | NULLABLE | Is Wyoming area code (0/1) |
| imported_at | TEXT | NULLABLE | Import/update timestamp |

**Indexes:**
- `PRIMARY KEY (voter_id)` — auto-generated

**Purpose:** Pre-computed best phone for faster lookups (populated by background job)

---

### 27. v_best_phone_old
**Role:** Archive of legacy best phone data

**Current Row Count:** 0  
**Purpose:** Backup reference from prior phone curation approach

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| voter_id | TEXT | PRIMARY KEY | Voter identifier |
| phone_e164 | TEXT | NULLABLE | Phone number |

---

## System & Metadata Tables

### 28. d1_migrations
**Role:** Tracks applied schema migrations

**Database:** Single SQLite database  
**Current Row Count:** 26  
**Primary Key:** `id` (INTEGER AUTOINCREMENT)

**Columns:**
| Column Name | Type | Constraints | Purpose |
|-------------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Migration sequence ID |
| name | TEXT | UNIQUE | Migration filename (e.g., '001_create_base_schema.sql') |
| applied_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP NOT NULL | Application timestamp |

**Sample Query:**
```sql
SELECT * FROM d1_migrations ORDER BY id;
```

**Applied Migrations (26 total):**
1. `001_create_base_schema.sql` — Base voter and address infrastructure
2. `002_create_system_tables.sql` — D1 metadata and migration tracking
3. `003_add_call_activity.sql` — Call activity logging
4. `004_add_performance_indexes.sql` — Performance optimization indexes
5. `005_add_activity_expansion.sql` — Extended activity data
6. `006_add_voter_contacts_columns.sql` — Voter contact management
7. `007_add_reviewed_flag.sql` — Review workflow support
8. `008_create_district_coverage.sql` — District coverage tracking (549 rows)
9. `010_add_campaign_touchpoints.sql` — Campaign messaging
10. `011_add_volunteer_fields.sql` — Volunteer management
11. `012_add_streets_link_to_voters.sql` — Street-voter relationships
12. `013_create_volunteer_staging.sql` — Volunteer intake workflow
13. `014_add_state_to_volunteers.sql` — Volunteer state field
14. `015_add_city_to_volunteers.sql` — Volunteer city field
15. `016_create_legislature.sql` — Wyoming legislature reference
16. `017_fix_voters_schema.sql` — Align voters to remote schema
17. `018_add_call_assignments.sql` — Call assignment locking
18. `019_add_call_followups.sql` — Follow-up scheduling
19. `020_align_call_activity.sql` — Align column names (outcome, ts)
20. `021_add_walk_management.sql` — Canvass/walk batch management
21. `022_add_normalization_tables.sql` — Data import & normalization
22. `023_add_voter_contact_staging.sql` — Contact form submission workflow
23. `024_expand_voter_contacts.sql` — Expand voter_contacts columns
24. `025_add_views_and_indexes.sql` — Views and index optimization
25. `026_update_city_county_schema.sql` — City/county normalization
26. Additional schema migrations as needed (through 2025-12-02)

---

### 29. sqlite_sequence
**Role:** SQLite internal autoincrement tracking

**Current Row Count:** >0  
**Purpose:** System table; not user-facing

---

### 30. _cf_METADATA
**Role:** Cloudflare D1 internal metadata

**Current Row Count:** Unknown  
**Purpose:** System table managed by Cloudflare; not for user access

---

## Views

### 1. best_phone
**Role:** Simplified view of best phone records

**Definition:**
```sql
CREATE VIEW best_phone AS
SELECT voter_id, phone_e164, confidence_code, is_wy_area, imported_at
FROM v_best_phone;
```

**Purpose:** Convenient alias for accessing curated phone data

**Sample Query:**
```sql
SELECT voter_id, phone_e164, confidence_code
FROM best_phone
WHERE is_wy_area = 1
LIMIT 20;
```

---

## Indexes

### Explicit Indexes (Created by Migrations)

| Index Name | Table | Columns | Purpose |
|------------|-------|---------|---------|
| idx_volunteer_staging_status | volunteer_staging | (review_status) | Status filtering |
| idx_volunteer_staging_target | volunteer_staging | (target_id) | Target lookup |
| idx_volunteers_cell_phone | volunteers | (cell_phone) | Phone lookup & opt-in verification |
| idx_voter_contacts_created_at | voter_contacts | (created_at) | Time-range queries |
| idx_voter_contacts_reviewed | voter_contacts | (reviewed) | Review workflow |
| idx_voter_contacts_volunteer_id | voter_contacts | (volunteer_id) | Volunteer activity reports |
| idx_voter_contacts_voter_id | voter_contacts | (voter_id) | Voter contact lookup |
| idx_voter_phones_voter_id | voter_phones | (voter_id) | Voter phone directory |
| idx_voters_addr_norm_city | voters_addr_norm | (city) | City-based queries |
| idx_voters_addr_norm_city_county_id | voters_addr_norm | (city_county_id) | City/county filtering |
| idx_voters_addr_norm_street_index_id | voters_addr_norm | (street_index_id) | Street normalization |
| idx_voters_county | voters | (county) | County filtering |
| idx_voters_county_house | voters | (county, house) | District queries |
| idx_voters_county_senate | voters | (county, senate) | District queries |
| idx_voters_house | voters | (house) | House district filtering |
| idx_voters_party | voters | (political_party) | Party filtering |
| idx_voters_senate | voters | (senate) | Senate district filtering |

### Implicit Indexes (Auto-generated for Primary Keys)

SQLite automatically generates indexes for all PRIMARY KEY constraints:
- `sqlite_autoindex_call_assignments_1` — (voter_id)
- `sqlite_autoindex_campaign_touchpoints_1` — (touchpoint_id)
- `sqlite_autoindex_d1_migrations_1` — (name UNIQUE)
- `sqlite_autoindex_district_coverage_1` — (district_type, district_code, county, city)
- `sqlite_autoindex_tmp_voter_street_1` — (voter_id)
- `sqlite_autoindex_v_best_phone_1` — (voter_id)
- `sqlite_autoindex_v_best_phone_old_1` — (voter_id)
- `sqlite_autoindex_volunteers_1` — (id)
- `sqlite_autoindex_voter_contacts_1` — (id)
- `sqlite_autoindex_voters_1` — (voter_id)
- `sqlite_autoindex_voters_addr_norm_1` — (voter_id)
- `sqlite_autoindex_voters_norm_1` — (voter_id)
- `sqlite_autoindex_voters_raw_1` — (voter_id)
- `sqlite_autoindex_walk_assignments_1` — (batch_id, voter_id)

---

## Table Relationships

### Relationship Diagram (Text Format)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CORE VOTER DATA                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  voters (voter_id PK)                                              │
│  ├─ political_party                                                │
│  ├─ county                                                         │
│  ├─ senate, house                                                  │
│  │                                                                 │
│  └─→ 1:1 voters_addr_norm (voter_id PK)                           │
│      ├─ addr1, city, fn, ln, zip                                  │
│      ├─ city_county_id FK→ wy_city_county(id)                    │
│      └─ street_index_id FK→ streets_index(id)                    │
│                                                                     │
├─ 1:1 tmp_voter_street (voter_id PK)                               │
│   └─ streets_index_id FK→ streets_index(id)                      │
│                                                                     │
├─ 1:N voter_phones (voter_id FK)                                   │
│   └─ phone_number, is_primary                                     │
│                                                                     │
├─ 1:1 voters_raw (voter_id PK) [ARCHIVE]                           │
│   └─ first_name, last_name, county, precinct, house, senate      │
│                                                                     │
└─ 1:1 voters_norm (voter_id PK) [METADATA]                         │
    └─ party_form5, reg_year                                        │
                                                                     │
┌─────────────────────────────────────────────────────────────────────┐
│ GEOGRAPHIC NORMALIZATION                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  wy_city_county (id PK)                                            │
│  ├─ city, county, state                                            │
│  │                                                                 │
│  └─← 1:N streets_index (city_county_id FK)                        │
│      ├─ street_core, street_canonical, street_prefix, etc.       │
│      └─← 1:N tmp_voter_street (streets_index_id FK)              │
│                                                                     │
│  district_coverage (composite PK)                                  │
│  └─ district_type, district_code → county, city                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                                                     
┌─────────────────────────────────────────────────────────────────────┐
│ ACTIVITY & INTERACTIONS                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  call_activity (id PK)                                             │
│  ├─ voter_id FK→ voters(voter_id)                                 │
│  ├─ volunteer_email → volunteers(id)                              │
│  ├─ outcome, call_result [dual column support]                    │
│  └─ ts, created_at [dual timestamp support]                       │
│                                                                     │
│  call_assignments (voter_id PK)                                   │
│  ├─ voter_id FK→ voters(voter_id)                                 │
│  └─ volunteer_id FK→ volunteers(id)                               │
│                                                                     │
│  call_followups (id PK)                                           │
│  ├─ voter_id FK→ voters(voter_id)                                 │
│  └─ created_by, due_date, reason                                  │
│                                                                     │
│  canvass_activity (id PK)                                         │
│  ├─ voter_id FK→ voters(voter_id)                                 │
│  ├─ volunteer_email → volunteers(id)                              │
│  └─ result, location_lat/lng                                      │
│                                                                     │
│  walk_batches (id PK)                                             │
│  ├─ volunteer_id FK→ volunteers(id)                               │
│  └─← 1:N walk_assignments (batch_id FK)                          │
│      └─ voter_id FK→ voters(voter_id)                             │
│                                                                     │
│  voter_contacts (id PK)                                           │
│  ├─ voter_id FK→ voters(voter_id) [UNIQUE]                        │
│  ├─ volunteer_id FK→ volunteers(id)                               │
│  └─ outcome, comments, email                                      │
│                                                                     │
│  voter_contact_staging (staging_id PK)                           │
│  ├─ voter_id [TEMP-00000000 initially]                            │
│  ├─ submitted_by, vol_email                                       │
│  ├─ status (pending, verified, duplicate, rejected)              │
│  ├─ integrated_voter_id → voters(voter_id)                        │
│  └─ potential_matches [JSON array of voter_ids]                   │
│                                                                     │
│  pulse_optins (id PK)                                             │
│  ├─ voter_id FK→ voters(voter_id)                                 │
│  ├─ contact_method (sms, email)                                   │
│  └─ consent_source (call, canvass, webform)                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                                                     
┌─────────────────────────────────────────────────────────────────────┐
│ VOLUNTEER & MESSAGING                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  volunteers (id PK)                                               │
│  ├─ name, first_name, last_name, cell_phone                      │
│  ├─ is_active, state, city                                        │
│  │                                                                 │
│  └─← call_activity.volunteer_email [semi-FK]                     │
│  └─← call_assignments.volunteer_id [FK]                          │
│  └─← canvass_activity.volunteer_email [semi-FK]                  │
│  └─← voter_contacts.volunteer_id [FK]                            │
│                                                                     │
│  volunteer_staging (staging_id PK)                                │
│  ├─ submitted_by, target_id → volunteers(id)                      │
│  ├─ review_status (pending, approved, rejected)                   │
│  └─ [Integrates to volunteers table after approval]               │
│                                                                     │
│  campaign_touchpoints (touchpoint_id PK)                         │
│  ├─ label, icebreaker, body, cta_question                        │
│  ├─ issue_tag, channels, priority                                │
│  │                                                                 │
│  └─← 1:N campaign_touchpoint_segments (touchpoint_id FK)         │
│      └─ segment_key, segment_value [targeting rules]             │
│                                                                     │
│  message_templates (id PK)                                        │
│  ├─ title, category, body_text                                    │
│  └─ is_active                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                                                     
┌─────────────────────────────────────────────────────────────────────┐
│ REFERENCE DATA                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  legislature (voter_id PK)                                        │
│  ├─ name, chamber, district                                       │
│  ├─ party, email, phone                                           │
│  └─ [Wyoming state legislature: 62 House + 31 Senate]            │
│                                                                     │
│  v_best_phone (voter_id PK)                                       │
│  ├─ phone_e164, confidence_code, is_wy_area                      │
│  └─ [Curated best phone per voter]                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Relationship Patterns

1. **Voter Hub:** `voters` table is the central entity referenced by nearly all activity and interaction tables via `voter_id` FK
2. **Geographic Hierarchy:** `wy_city_county` (id) → `streets_index` (city_county_id FK) → `tmp_voter_street` (streets_index_id FK)
3. **Address Normalization:** `voters` → `voters_addr_norm` (1:1) → `wy_city_county` & `streets_index` (FKs)
4. **Activity Logging:** `call_activity`, `canvass_activity`, `voter_contacts` all reference `voters(voter_id)`
5. **Volunteer Coordination:** `volunteers` ← `call_assignments`, `walk_batches`, `voter_contacts`, `voter_contact_staging`
6. **Campaign Messaging:** `campaign_touchpoints` → `campaign_touchpoint_segments` (for voter targeting rules)
7. **Contact Workflow:** `voter_contact_staging` (pending) → `voter_contacts` (verified) after admin matching
8. **Consent Tracking:** `pulse_optins` tracks SMS/email consent per voter

---

## Data Synchronization Status

### Cross-Database Synchronization (as of 2025-12-02)

| Table | Local Instance | Remote Instance | Sync Status | Last Verified |
|-------|---|---|---|---|
| voters | 274,656 | 274,656 | ✅ Identical | 2025-12-02 |
| voters_addr_norm | 274,656 | 274,656 | ✅ Identical | 2025-12-02 |
| streets_index | 17,308 | 17,308 | ✅ Identical | 2025-12-02 |
| tmp_voter_street | 274,655 | 274,655 | ✅ Identical | 2025-12-02 |
| voter_phones | 113,358 | 113,358 | ✅ Identical | 2025-12-02 |
| legislature | 93 | 93 | ✅ Identical | 2025-12-02 |
| wy_city_county | 199 | 199 | ✅ Identical | 2025-12-02 |
| district_coverage | 549 | 549 | ✅ Identical | 2025-12-02 |
| volunteers | 9 | 9 | ✅ Identical | 2025-12-02 |
| call_activity | 2 | 2 | ✅ Identical | 2025-12-02 |
| canvass_activity | 2 | 2 | ✅ Identical | 2025-12-02 |

### Current Row Counts by Category

**Voter Core Data (274,656 records):**
- voters: 274,656
- voters_addr_norm: 274,656
- voters_raw: 274,656 (archive)
- voters_norm: 274,656 (metadata)
- voter_phones: 113,358 (41% coverage)

**Geographic Reference (17,507 records):**
- wy_city_county: 199 (city/county combinations)
- streets_index: 17,308 (canonical streets)
- district_coverage: 549 (district mappings)

**Activity Data (6 records):**
- call_activity: 2
- canvass_activity: 2
- voter_contacts: 0
- call_followups: 0
- walk_batches: 0

**Volunteer & Messaging (13 records):**
- volunteers: 9
- volunteer_staging: 1
- campaign_touchpoints: 1
- message_templates: 3
- pulse_optins: 10

**Legislative Reference:**
- legislature: 93 (Wyoming state legislators)

**Staging & Verification:**
- voter_contact_staging: 0
- call_assignments: 0
- walk_assignments: 0
- campaign_touchpoint_segments: 0

---

## Recommendations for Future Documentation

To maintain this snapshot as the authoritative source of truth, consider:

### Missing Elements (Worth Adding)
1. **Triggers**: Any auto-update triggers on timestamp fields?
2. **Default Values**: Document which columns have DEFAULT constraints
3. **CHECK Constraints**: Full list of all CHECK constraints for enumerated columns
4. **UNIQUE Constraints**: Beyond PRIMARY KEYs (e.g., voter_contacts.voter_id is UNIQUE)
5. **Cascading Updates/Deletes**: Are there ON DELETE CASCADE / ON UPDATE CASCADE behaviors?
6. **Materialized View Refresh**: How are `v_best_phone` and `v_best_phone_old` kept in sync?
7. **Data Retention Policies**: Are there any archival/cleanup policies for activity tables?
8. **Backup/Recovery Procedures**: Step-by-step procedures for recovering from data loss

### Ongoing Maintenance
- Create a new snapshot file for any schema changes (naming convention: `snapshot_D1_tables_MM-DD-YY.md`)
- Keep this 01-17-26 file as WORM (write-once, read-many) reference
- Update the [Data Synchronization Status](#data-synchronization-status) table monthly
- Document any new migrations added after this snapshot date

### Integration Documentation
- API endpoint mappings (which tables power which endpoints)
- UI form to table mappings (which forms write to which tables)
- Background job documentation (which jobs populate which tables)
- Query performance baselines (identify slow queries on large tables)

---

## Related Documents

- [D1 Migrations Summary 2025-12-02](instructions/D1_Migrations_Summary_20251202.md) — Complete migration log
- [Local D1 Schema Snapshot 2025-12-01](instructions/Local_D1_Schema_Snapshot_wy_local_20251201.md) — Previous point-in-time snapshot
- [REMOTE_D1_SCHEMA_FULL_20251202.sql](REMOTE_D1_SCHEMA_FULL_20251202.sql) — SQL dump of remote schema
- [LOCAL_D1_SCHEMA_FULL_20251202.sql](LOCAL_D1_SCHEMA_FULL_20251202.sql) — SQL dump of local schema
- [Volunteer Intake Feature Documentation](instructions/VOLUNTEER_INTAKE_FEATURE.md) — Feature details
- [Project Instructions](instructions/project_instructions.md) — Overall architecture guide

---

## Verification Notes

This snapshot was verified by:

1. ✅ Querying actual `wy_local` instance for complete table inventory
2. ✅ Extracting CREATE TABLE statements for all 31 tables
3. ✅ Reviewing all 26 applied migrations (001-026)
4. ✅ Confirming row counts on all major tables (voters, legislators, streets, activities)
5. ✅ Validating foreign key relationships and constraints
6. ✅ Consolidating information from 5 prior evolution documents
7. ✅ Cross-checking between local and remote databases for sync status

**Snapshot Date:** January 17, 2026  
**Snapshot Verified By:** Database schema inspection via wrangler CLI  
**Next Review Recommended:** Monthly or upon schema changes

---

<!-- End of D1 Database Schema Snapshot — 2026-01-17 -->
