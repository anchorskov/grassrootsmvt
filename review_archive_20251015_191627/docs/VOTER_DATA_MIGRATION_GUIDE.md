# Wyoming Voter Data Migration Guide
**Date:** October 15, 2025  
**Source:** `/home/anchor/projects/voterdata/wyoming/wy.sqlite`  
**Target:** Local D1 database (`wy_preview`)

## 🎯 **Migration Overview**

This guide will help you migrate the complete Wyoming voter database from SQLite to your local D1 database, enabling full functionality for the GrassrootsMVT canvass and contact system.

## 📊 **Source Data Analysis**

**Raw Wyoming Data Available:**
- **274,656 total voters** with complete registration info
- **113,221 phone records** with confidence scoring
- **274,656 address records** with normalization
- Complete party, district, and geographic data

**Key Tables in Source:**
- `voters` - Core voter registration (ID, party, county, districts)
- `voters_raw` - Raw import data with addresses
- `v_voters_addr_norm` - Cleaned addresses with standardized format
- `v_best_phone` - Phone numbers with confidence scores and area validation

**📋 COMPLETE SCHEMA**: See [`database_schema_reference.md`](database_schema_reference.md) for detailed table definitions and field descriptions.

## 🔧 **Migration Process**

### **Step 1: Setup Database Schema**
```bash
cd /home/anchor/projects/grassrootsmvt
./setup_d1_schema.sh
```

**What this does:**
- Creates all required D1 tables with proper schemas
- Sets up indexes for performance
- Creates operational tables (voter_contacts, canvass_activity, etc.)
- Adds default message templates
- Verifies existing data

### **Step 2: Migrate Voter Data**
```bash
./migrate_voter_data.sh
```

**Migration Features:**
- **Batch Processing**: 1,000 records at a time for stability
- **Development Limit**: 50,000 records max (configurable)
- **Data Integrity**: Proper escaping and foreign key relationships
- **Progress Tracking**: Real-time feedback on migration progress
- **Verification**: Automatic data validation after migration

**Tables Migrated:**
1. **`voters`** - Core voter registration data
2. **`v_voters_addr_norm`** - Normalized addresses with city/zip
3. **`v_best_phone`** - Phone numbers with confidence scores

## 📋 **Schema Mapping**

### **Voters Table**
**Source → Target Mapping:**
```sql
-- Source: voters table
voter_id         → voter_id (PRIMARY KEY)
first_name       → first_name
last_name        → last_name  
middle_name      → middle_name
name_suffix      → name_suffix
political_party  → political_party
county           → county
precinct         → precinct
house_district   → house_district
senate_district  → senate_district
eff_reg_date     → eff_reg_date
```

### **Addresses Table**
**Source → Target Mapping:**
```sql
-- Source: v_voters_addr_norm view
voter_id  → voter_id (FOREIGN KEY)
ln        → last_name
fn        → first_name
addr1     → address
city      → city
state     → state (defaults to 'WY')
zip       → zip
senate    → senate_district
house     → house_district
```

### **Phone Numbers Table**
**Source → Target Mapping:**
```sql
-- Source: v_best_phone view
voter_id         → voter_id (FOREIGN KEY)
phone10          → phone10 (10-digit format)
phone_e164       → phone_e164 (international format)
confidence_code  → confidence_code (quality score)
is_wy_area       → is_wy_area (Wyoming area code flag)
source           → source (data source identifier)
imported_at      → imported_at (original import timestamp)
```

## 🎯 **Performance Considerations**

### **Indexing Strategy**
```sql
-- Voters table indexes
CREATE INDEX idx_voters_party ON voters(political_party);
CREATE INDEX idx_voters_county ON voters(county);
CREATE INDEX idx_voters_house ON voters(house_district);
CREATE INDEX idx_voters_senate ON voters(senate_district);
CREATE INDEX idx_voters_county_party ON voters(county, political_party);

-- Address table indexes  
CREATE INDEX idx_addr_city ON v_voters_addr_norm(city);
CREATE INDEX idx_addr_zip ON v_voters_addr_norm(zip);

-- Phone table indexes
CREATE INDEX idx_phone_e164 ON v_best_phone(phone_e164);
```

### **Query Optimization**
- **County + Party filters**: Use composite index for best performance
- **Address lookups**: City and ZIP indexes support canvass queries
- **Phone banking**: E164 format enables efficient phone number searches

## 🧪 **Testing Migration**

### **Verification Queries**
```sql
-- Check data counts
SELECT COUNT(*) FROM voters;
SELECT COUNT(*) FROM v_voters_addr_norm;
SELECT COUNT(*) FROM v_best_phone;

-- Sample data validation
SELECT voter_id, first_name, last_name, political_party, county 
FROM voters LIMIT 5;

-- County distribution
SELECT county, COUNT(*) as count 
FROM voters 
GROUP BY county 
ORDER BY count DESC;

-- Party breakdown
SELECT political_party, COUNT(*) as count 
FROM voters 
GROUP BY political_party 
ORDER BY count DESC;
```

### **Functional Testing**
1. **Canvass Page**: Test voter search and results display
2. **Contact System**: Verify contact form and data storage
3. **API Endpoints**: Check `/api/voters` and `/api/canvass/nearby`
4. **Contact Status**: Test contact history display

**Test URL:**
```
http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated
```

## 📊 **Expected Results**

### **Data Volumes** (with 50K limit):
- **Voters**: ~50,000 records
- **Addresses**: ~50,000 records  
- **Phone Numbers**: ~20,000-25,000 records (subset with phones)

### **Geographic Coverage**:
- **All 23 Wyoming counties** represented
- **Major cities**: Cheyenne, Casper, Laramie, Rock Springs, etc.
- **Legislative districts**: Complete house and senate district data

### **Political Distribution**:
- **Republican**: ~75% of registered voters
- **Democratic**: ~15% of registered voters
- **Unaffiliated**: ~10% of registered voters

## 🚨 **Important Notes**

### **Development Limitations**:
- **50,000 record limit** prevents overwhelming D1 local instance
- **Phone coverage**: Not all voters have phone numbers
- **Address quality**: Some rural addresses may lack full normalization

### **Production Considerations**:
- Remove `MAX_TOTAL_RECORDS` limit for full production migration
- Consider using remote D1 for large datasets
- Monitor D1 usage and performance metrics

### **Data Privacy**:
- Voter data is public record in Wyoming
- Phone numbers have confidence scoring for quality
- No sensitive personal information beyond public registration

## 🔄 **Migration Commands**

### **Quick Start (Recommended)**:
```bash
cd /home/anchor/projects/grassrootsmvt

# 1. Setup schema
./setup_d1_schema.sh

# 2. Migrate data (interactive)
./migrate_voter_data.sh

# 3. Test functionality
bash test_canvass_contact_status.sh
```

### **Manual Schema Only**:
```bash
./setup_d1_schema.sh
```

### **Data Migration Only** (if schema exists):
```bash
./migrate_voter_data.sh
```

## ✅ **Success Verification**

After migration, you should see:
- **Voter search** working on canvass page
- **Address autocomplete** functioning
- **Phone numbers** displayed where available
- **Contact status** tracking operational
- **API responses** with complete voter data

## 🎉 **Next Steps**

1. **Test Core Functionality**: Verify canvass and contact features
2. **Performance Tuning**: Monitor query performance with real data
3. **Data Quality**: Review any data inconsistencies
4. **Production Planning**: Prepare for full dataset migration

---

**Status**: ✅ **Ready for Migration** - Scripts prepared and tested