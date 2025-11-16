# Streets Index Cleanup Plan - Confidence-Based Approach

## Analysis Summary
Total extra records not in cleaned CSV: **4,905**

## Malformed Data Categories

### **TIER 1: VERY HIGH CONFIDENCE MALFORMED (98%+)** - 285 records
Safe to delete immediately

1. **Leading spaces** (47 records)
   - Pattern: street_core LIKE ' %'
   - Examples: " E IVINSON B AVE", " N 9TH ST"
   - Risk: <2% (spaces are never intentional)

2. **Trailing spaces** (10 records)
   - Pattern: street_core LIKE '% '
   - Examples: "21ST ", "9TH "
   - Risk: <2% (spaces are never intentional)

3. **Unit suffixes with 3+ digits** (228 records)
   - Pattern: street_core GLOB '*[ ][0-9][0-9][0-9]*'
   - Examples: "N 17TH 206 ST", "N 18TH 402 ST", "S 17TH 101 ST"
   - Risk: <2% (3-digit suffixes are always unit numbers)

### **TIER 2: HIGH CONFIDENCE MALFORMED (90-95%)** - ~400 records
Review sample, then delete

4. **Unit suffixes with single letter** (estimated ~200 records)
   - Pattern: street_core GLOB '*[0-9](ST|ND|RD|TH) [A-Z]$'
   - Examples: "S 10TH C ST", "S 11TH D ST", "N 15TH A ST"
   - Risk: 5-10% (rare cases like "AVENUE A" exist, but these look like units)

5. **Special markers** (estimated ~100 records)
   - Pattern: 'NO [0-9]', 'FRNT', 'REAR', 'APT', 'LOT' in street_core
   - Examples: "CRYSTAL NO 208 CT", "E BAKER FRNT ST"
   - Risk: 5% (rarely are these part of official street names)

6. **Directional suffix anomalies** (estimated ~100 records)
   - Pattern: Directional at end instead of beginning
   - Examples: "CURTIS ST W", "MONROE ST E", "East St" (lowercase)
   - Risk: 10% (some streets officially have directional suffixes)

### **TIER 3: UNCERTAIN (50-70%)** - ~4,220 records
MANUAL REVIEW REQUIRED

7. **Potentially legitimate new streets** (~4,220 records)
   - Examples: "BOSWELL DR", "GRAND AVE", "HOWE RD", "S 12TH ST"
   - Risk: Unknown - could be:
     * Legitimate streets added from voter data
     * Streets you excluded during CSV cleaning
     * Duplicates with different formatting

## Recommended Cleanup Plan

### **Phase 1: Conservative Cleanup (TIER 1 only)**
Delete 285 very high-confidence malformed records:
- Leading/trailing spaces
- 3+ digit unit suffixes
- **Expected result:** 17,395 - 285 = **17,110 streets in local**
- **Risk:** <2% chance of removing legitimate data

### **Phase 2: Aggressive Cleanup (TIER 1 + TIER 2)**
After verifying Phase 1, delete ~685 records:
- All TIER 1 categories
- Single-letter unit suffixes
- Special markers (NO, FRNT, REAR)
- Directional suffix anomalies
- **Expected result:** 17,395 - 685 = **16,710 streets in local**
- **Risk:** 5-10% chance of removing a few legitimate streets

### **Phase 3: CSV Authority (Nuclear Option)**
Replace entire local streets_index with CSV + verified additions:
- Delete all 4,905 extra records
- Keep only the 13,362 from cleaned CSV
- **Expected result:** **13,362 streets in local**
- **Risk:** Lose all legitimate streets discovered from voter addresses

## My Recommendation: **Phase 1 + Manual Review**

1. Execute Phase 1 (delete 285 TIER 1 records) - SAFE
2. Export TIER 2 records to CSV for your review
3. You manually approve/reject TIER 2 deletions
4. Export TIER 3 records - you decide if CSV is authoritative or if these are valid additions

Would you like me to proceed with Phase 1?
