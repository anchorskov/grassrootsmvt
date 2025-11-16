# GrassrootsMVT Database Schema Reference
**Date:** October 15, 2025  
**Database:** Cloudflare D1 SQLite  
**Purpose:** Complete data management system documentation

## 🎯 **Overview**

This document serves as the single source of truth for all database tables, views, and data management in the GrassrootsMVT platform. The system uses Cloudflare D1 (SQLite) to manage Wyoming voter data, volunteer activities, and contact interactions.

## 📊 **Data Architecture**

### **Data Flow:**
1. **Import**: Wyoming voter data → `voters_raw`, `voters_norm` tables
2. **Enhancement**: Address/phone normalization → `v_voters_addr_norm` view, `best_phone` table  
3. **Operations**: Volunteer assignments → `call_assignments`, `walk_assignments`
4. **Contact**: New voter contacts → `voter_contact_staging` → verification → integration
5. **Activity**: Volunteer interactions → `voter_contacts`, `call_followups`

### **Data Categories:**
- **🗳️ Voter Data**: Core voter registration and demographics
- **👥 Volunteer System**: User management and assignments  
- **📞 Contact Management**: Interaction tracking and follow-ups
- **🆕 Contact Staging**: New contact verification pipeline

---

## 🗳️ **Voter Data Tables**

### **voters** *(Core voter registration)*
| Column | Type | Description | Source |
|--------|------|-------------|--------|
| voter_id | TEXT PRIMARY KEY | Unique Wyoming voter identifier | State file |
| political_party | TEXT | Party affiliation (R/D/U/etc) | State file |
| county | TEXT | County of registration | State file |
| senate | TEXT | Senate district number | State file |
| house | TEXT | House district number | State file |

**Purpose**: Core voter political data (party, county, districts)  
**Note**: Name and address fields are in `voters_addr_norm` table  
**Relationships**: JOIN with `v_voters_addr_norm` on `voter_id` for complete records  
**Index Status**: ✅ PRIMARY KEY on voter_id

---

### **voters_raw** *(Raw import data)*
| Column | Type | Description | Source |
|--------|------|-------------|---------|
| voter_id | TEXT PRIMARY KEY | Unique voter identifier | State file |
| first_name | TEXT | Raw first name | State file |
| last_name | TEXT | Raw last name | State file |
| address | TEXT | Street or mailing address | State file |
| city | TEXT | Raw city name | State file |
| county | TEXT | County of registration | State file |
| zip | TEXT | ZIP code | State file |
| phone | TEXT | Reported phone number | State file |

**Purpose**: Direct import of Wyoming state voter file before normalization  
**Relationships**: Base for `voters_norm` cleaning and `v_voters_addr_norm` view  
**Status**: Raw data, use normalized versions for production queries

---

### **voters_norm** *(Cleaned voter data)*
| Column | Type | Description | Source |
|--------|------|-------------|---------|
| voter_id | TEXT PRIMARY KEY | Unique voter identifier | Normalized |
| city | TEXT | Normalized city name | Cleaned |
| county | TEXT | Normalized county name | Cleaned |
| house | TEXT | Standardized house district | Validated |
| senate | TEXT | Standardized senate district | Validated |
| address_norm | TEXT | Normalized address | Cleaned |

**Purpose**: Cleaned version ensuring uniform casing and valid district references  
**Relationships**: Used by all production queries, joins with views  
**Index Status**: ✅ Optimized for geographic and district queries

---

### **voters_addr_norm** *(Normalized voter addresses)*
| Column | Type | Description | Source |
|--------|------|-------------|--------|
| voter_id | TEXT PRIMARY KEY | Unique voter identifier | Required |
| ln | TEXT | Last name (normalized) | Cleaned |
| fn | TEXT | First name (normalized) | Cleaned |
| addr1 | TEXT | Full normalized address | Cleaned |
| city | TEXT | City name (normalized) | Cleaned |
| state | TEXT | State abbreviation | Default 'WY' |
| zip | TEXT | ZIP code | Validated |
| senate | TEXT | Senate district | Required |
| house | TEXT | House district | Required |
| city_county_id | INTEGER NOT NULL | FK to wy_city_county.id | Geographic mapping |

**Purpose**: Base table for v_voters_addr_norm view with complete normalized address data  
**Relationships**: Joined with wy_city_county in v_voters_addr_norm view  
**Index Status**: ✅ PRIMARY KEY on voter_id

---

## 👁️ **Database Views**

### **v_voters_addr_norm** *(Complete voter + address view)*
**Purpose**: Provide a single projection of voter name + address + county/district metadata  
**Definition**:
```sql
CREATE VIEW v_voters_addr_norm AS
SELECT
  van.voter_id,
  van.fn,
  van.ln,
  van.addr1,
  van.city,
  van.state,
  van.zip,
  van.house,
  van.senate,
  van.city_county_id,
  wcc.city_norm    AS city_resolved,
  wcc.county_norm  AS county_resolved
FROM voters_addr_norm AS van
LEFT JOIN wy_city_county AS wcc
  ON wcc.id = van.city_county_id;
```
**Performance**: ✅ Backed by PK/FK indexes across `voter_id` and `city_county_id`  
**Primary Use**: All name/address lookups, canvass street autocomplete, contact-form search

**Key Fields**:
- From `voters_addr_norm`: `voter_id`, `fn`, `ln`, `addr1`, `city`, `state`, `zip`, `house`, `senate`, `city_county_id`
- From `wy_city_county`: `city_resolved`, `county_resolved`

---

### **best_phone** *(Validated phone numbers)*
| Column | Type | Description | Source |
|--------|------|-------------|--------|
| voter_id | TEXT PRIMARY KEY | Unique voter identifier | FK to voters |
| phone_e164 | TEXT | Standardized phone format | Normalized |
| confidence_code | INTEGER | Phone confidence score | Calculated |
| is_wy_area | INTEGER | Wyoming area code flag | Validated |
| imported_at | TEXT | Import timestamp | Auto |

**Purpose**: Phone numbers with confidence scoring and area validation  
**Performance**: ✅ PRIMARY KEY on voter_id  
**Primary Use**: Contact verification, call assignments

---

### **v_eligible_call** *(Contact-ready voters)*
**Purpose**: Voters eligible for volunteer contact with complete info  
**Dependencies**: Requires `voters`, `v_voters_addr_norm`, `best_phone`  
**Primary Use**: Call assignment system, volunteer dashboards

---

## 👥 **Volunteer Management Tables**

### **volunteers**
| Column | Type | Description | Source |
|--------|------|-------------|---------|
| id | TEXT PRIMARY KEY | Volunteer email from Cloudflare Access | Auth |
| name | TEXT NOT NULL | Volunteer display name | Manual |

**Purpose**: Volunteer user management and authentication  
**Security**: No voter PII stored, linked via Cloudflare Access

---

### **call_assignments**
| Column | Type | Description | Default |
|--------|------|-------------|---------|
| voter_id | TEXT PRIMARY KEY | Assigned voter | Required |
| volunteer_id | TEXT NOT NULL | Volunteer email | Required |
| locked_at | DATETIME | Assignment timestamp | CURRENT_TIMESTAMP |
| lock_expires_at | DATETIME | Lock expiration | Calculated |

**Purpose**: Prevent multiple volunteers contacting same voter  
**Behavior**: Automatic lock expiration system

---

### **walk_batches**
| Column | Type | Description | Default |
|--------|------|-------------|---------|
| id | INTEGER PRIMARY KEY | Batch identifier | AUTOINCREMENT |
| volunteer_id | TEXT NOT NULL | Volunteer email | Required |
| county | TEXT | Target county | Optional |
| city | TEXT | Target city | Optional |
| district | TEXT | Target district | Optional |
| precinct | TEXT | Target precinct | Optional |
| created_at | DATETIME | Batch creation | CURRENT_TIMESTAMP |

**Purpose**: Geographic assignment grouping for canvassing

---

### **walk_assignments**
| Column | Type | Description | Notes |
|--------|------|-------------|-------|
| batch_id | INTEGER NOT NULL | References walk_batches.id | FK |
| voter_id | TEXT NOT NULL | Target voter | FK |
| position | INTEGER | Order in route | Sequence |

**Primary Key**: `(batch_id, voter_id)`  
**Purpose**: Individual voter assignments within geographic batches

---

## 📞 **Contact Management Tables**

### **voter_contacts** *(Completed interactions)*
| Column | Type | Description | Values |
|--------|------|-------------|--------|
| id | INTEGER PRIMARY KEY | Contact record ID | AUTOINCREMENT |
| voter_id | TEXT NOT NULL | Target voter | FK to voters |
| volunteer_id | TEXT NOT NULL | Volunteer email | FK to volunteers |
| method | TEXT NOT NULL | Contact method | 'phone', 'door' |
| outcome | TEXT NOT NULL | Interaction result | 'connected', 'vm', 'no_answer', 'wrong_number', 'refused', 'follow_up' |
| ok_callback | INTEGER | Callback permission | 0/1 |
| best_day | TEXT | Preferred contact day | Text |
| best_time_window | TEXT | Preferred time window | Text |
| requested_info | INTEGER | Info request flag | 0/1 |
| dnc | INTEGER | Do not contact flag | 0/1 |
| optin_sms | INTEGER | SMS opt-in | 0/1 |
| optin_email | INTEGER | Email opt-in | 0/1 |
| email | TEXT | Voter email address | Optional |
| wants_volunteer | INTEGER | Volunteer interest | 0/1 |
| share_insights_ok | INTEGER | Data sharing permission | 0/1 |
| for_term_limits | INTEGER | Term limits position | 0/1 |
| issue_public_lands | INTEGER | Public lands interest | 0/1 |
| comments | TEXT | Interaction notes | Freeform |
| created_at | DATETIME | Record timestamp | CURRENT_TIMESTAMP |

**Purpose**: Completed volunteer interactions with existing voters  
**Relationships**: Links volunteers to voters with detailed interaction data

---

### **call_followups** *(Scheduled callbacks)*
| Column | Type | Description | Values |
|--------|------|-------------|--------|
| id | INTEGER PRIMARY KEY | Followup record ID | AUTOINCREMENT |
| voter_id | TEXT NOT NULL | Target voter | FK |
| due_date | DATE | Callback due date | Date |
| reason | TEXT | Followup reason | 'requested_info', 'callback_window', 'other' |
| created_by | TEXT NOT NULL | Volunteer email | FK |
| created_at | DATETIME | Record creation | CURRENT_TIMESTAMP |
| done | INTEGER | Completion flag | 0/1 |

**Purpose**: Callback scheduling and tracking system

---

## 🆕 **Contact Staging System**

### **voter_contact_staging** *(New contact pipeline)*
| Column | Type | Description | Purpose |
|--------|------|-------------|---------|
| **Primary Keys** |
| staging_id | INTEGER PRIMARY KEY | Record identifier | AUTOINCREMENT |
| voter_id | TEXT NOT NULL | Temp voter ID | 'TEMP-00000000' format |
| **Metadata** |
| submitted_at | DATETIME | Submission timestamp | CURRENT_TIMESTAMP |
| submitted_by | TEXT NOT NULL | Volunteer identifier | Required |
| vol_email | TEXT NOT NULL | Volunteer email | Required |
| status | TEXT | Processing status | 'pending', 'verified', 'duplicate', 'rejected' |
| **Search Fields** |
| search_county | TEXT NOT NULL | County for matching | Required |
| search_city | TEXT | City for matching | Optional |
| search_street_name | TEXT | Street for matching | Optional |
| search_house_number | TEXT | House number for matching | Optional |
| **Voter Information** |
| fn | TEXT NOT NULL | First name | Matches v_voters_addr_norm.fn |
| ln | TEXT NOT NULL | Last name | Matches v_voters_addr_norm.ln |
| middle_name | TEXT | Middle name | Optional |
| suffix | TEXT | Name suffix | Jr, Sr, III, etc. |
| **Address Information** |
| addr1 | TEXT NOT NULL | Full address | Matches v_voters_addr_norm.addr1 |
| house_number | TEXT | House number | Parsed |
| street_name | TEXT | Street name | Parsed |
| street_type | TEXT | Street type | St, Ave, Dr, etc. |
| unit_number | TEXT | Apartment/unit | Optional |
| city | TEXT NOT NULL | City | Matches v_voters_addr_norm.city |
| county | TEXT NOT NULL | County | Matches voters.county |
| state | TEXT | State | Default 'WY' |
| zip | TEXT | ZIP code | Matches v_voters_addr_norm.zip |
| **Contact Information** |
| phone_e164 | TEXT | Primary phone | Matches best_phone.phone_e164 |
| phone_secondary | TEXT | Secondary phone | Optional |
| email | TEXT | Email address | Optional |
| **Political Information** |
| political_party | TEXT | Estimated party | Matches voters.political_party |
| voting_likelihood | TEXT | Voting likelihood | 'high', 'medium', 'low', 'unknown' |
| **Interaction Details** |
| contact_method | TEXT | How contacted | 'door', 'phone', 'event', 'referral', 'online' |
| interaction_notes | TEXT | Interaction summary | Freeform |
| issues_interested | TEXT | Issue interests | JSON or comma-separated |
| volunteer_notes | TEXT | Volunteer observations | Freeform |
| **Verification Fields** |
| potential_matches | TEXT | Potential voter matches | JSON array of voter_ids |
| verification_notes | TEXT | Review notes | Manual review |
| verified_at | DATETIME | Verification timestamp | Optional |
| verified_by | TEXT | Verifier email | Optional |
| **Integration Tracking** |
| integrated_voter_id | TEXT | Final voter ID | If matched to existing |
| needs_manual_review | BOOLEAN | Review flag | Default FALSE |
| **Audit Trail** |
| created_at | DATETIME | Record creation | CURRENT_TIMESTAMP |
| updated_at | DATETIME | Last modification | Auto-updated |

**Purpose**: Staging area for new voter contacts requiring verification before integration  
**Triggers**: Auto-generates temp voter_id, updates timestamps  
**Indexes**: Optimized for search, name matching, and status filtering

---

## 📋 **Message Templates**

### **message_templates**
| Column | Type | Description | Values |
|--------|------|-------------|--------|
| id | TEXT PRIMARY KEY | Template identifier | Unique |
| channel | TEXT NOT NULL | Delivery method | 'pdf', 'email', 'sms' |
| audience | TEXT | Target audience | 'R', 'D', 'U', 'All' |
| body_html | TEXT NOT NULL | Template content | HTML format |

**Purpose**: Standardized messaging for different channels and audiences

---

## 🔍 **Example Lookup Query**
Use the normalized address view plus the voters table when matching by name:

```sql
SELECT
  v.voter_id,
  a.fn,
  a.ln,
  a.addr1,
  a.city,
  v.county,
  v.house,
  v.senate,
  v.political_party
FROM v_voters_addr_norm a
JOIN voters v ON a.voter_id = v.voter_id
WHERE UPPER(a.fn) = 'JIMMY'
  AND UPPER(a.ln) = 'SKOVGARD'
LIMIT 25;
```

Result (Oct 15 2025 import): Jimmy Skovgard — 5685 HANLY ST, CASPER, NATRONA County, HD 59 / SD 29, Republican.  
Stored at `sql/find_jimmy_skovgard.sql` for quick reuse.

---

## 🔧 **Database Maintenance**

### **Performance Optimization:**
- **Core Tables**: All primary keys and foreign keys indexed
- **Search Tables**: Multi-column indexes on search fields
- **Geographic Queries**: Specialized indexes for county/district lookups
- **Temporal Queries**: Indexes on timestamp fields for reporting

### **Data Integrity:**
- **Triggers**: Auto-updating timestamps, temp ID generation
- **Constraints**: Check constraints on enum fields
- **Relationships**: Proper foreign key relationships maintained

### **Verification Dates:**
- Core voter tables: October 12, 2025
- Contact system: October 15, 2025
- Schema files: October 15, 2025

---

## 📁 **Related Files**

### **Schema Files:**
- `db/schema/volunteer_schema.sql` - Volunteer and contact tables
- `db/schema/voter_contact_staging.sql` - Contact staging system
- `db/schema/eligible_view_stub.sql` - Development stub tables

### **API Integration:**
- `worker/src/api/contact-form.js` - Contact form API endpoints
- `worker/src/index.js` - Main API routes and voter queries

### **Documentation:**
- `docs/contact_system_comprehensive.md` - Contact system details
- `docs/VOTER_DATA_MIGRATION_GUIDE.md` - Data migration procedures
- `docs/grassrootsmvt_ui_goals.md` - Project goals and status

---

**Status**: ✅ **CURRENT AND VERIFIED** - All tables documented as of October 15, 2025  
**Maintenance**: Update this document when schema changes are made  
**Contact**: Update related documentation when this reference changes
