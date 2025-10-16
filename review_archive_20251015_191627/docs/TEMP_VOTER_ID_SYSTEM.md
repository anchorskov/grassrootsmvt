# Voter ID System for Staging Table

## 🆔 **Purpose**

Since official `voter_id` values are managed by external systems (Wyoming Secretary of State), our staging table uses temporary voter IDs in the `voter_id` field until official IDs are assigned.

## 🔧 **Implementation**

### **Field Design**
```sql
voter_id TEXT NOT NULL DEFAULT ('TEMP-00000000') -- Our temporary voter_id for project flow
integrated_voter_id TEXT, -- Official voter_id when assigned by Wyoming system
```

### **Auto-Generation Trigger**
```sql
CREATE TRIGGER IF NOT EXISTS generate_voter_id
  AFTER INSERT ON voter_contact_staging
  WHEN NEW.voter_id = 'TEMP-00000000'
  BEGIN
    UPDATE voter_contact_staging 
    SET voter_id = 'TEMP-' || printf('%08d', NEW.staging_id)
    WHERE staging_id = NEW.staging_id;
  END;
```

## 📋 **Voter ID Format**

- **Pattern**: `TEMP-XXXXXXXX` (where X = 8-digit zero-padded number)
- **Examples**: 
  - `TEMP-00000001` (first submission)
  - `TEMP-00000002` (second submission)
  - `TEMP-00000123` (123rd submission)

## 🔄 **Workflow Integration**

### **1. Volunteer Submission**
```javascript
// Contact form submits voter info
POST /api/contact-form/submit
// Returns: { voterId: "TEMP-00000001", stagingId: 1 }
```

### **2. Project Flow**
- All project code uses `voter_id` field consistently
- Staging voters have `voter_id = "TEMP-00000001"`
- No special handling needed - `voter_id` works throughout system

### **3. Verification Process**
```sql
-- Admin verifies and assigns official voter_id
UPDATE voter_contact_staging 
SET status = 'verified', 
    integrated_voter_id = '800000123'  -- Official voter_id from WY system
WHERE voter_id = 'TEMP-00000001';     -- Our staging voter_id
```

### **4. Integration Tracking**
- `voter_id`: Used throughout project (temp format during staging)
- `integrated_voter_id`: Official Wyoming voter ID when assigned
- Maintains complete audit trail from staging to official registration

## 🎯 **Use Cases**

### **Contact Form API Response**
```javascript
{
  "success": true,
  "stagingId": 1,
  "voterId": "TEMP-00000001",  // Standard voter_id field
  "needsReview": false
}
```

### **Volunteer Dashboard**
```sql
-- Show volunteer's submitted contacts (using standard voter_id field)
SELECT voter_id, fn, ln, addr1, status 
FROM voter_contact_staging 
WHERE submitted_by = 'volunteer@email.com';
```

### **Admin Verification**
```sql
-- Review pending contacts (using standard voter_id field)
SELECT voter_id, fn, ln, addr1, potential_matches
FROM voter_contact_staging 
WHERE status = 'pending' AND needs_manual_review = 1;
```

### **Data Migration**
```sql
-- Promote verified contacts to main voter tables
INSERT INTO voters (voter_id, political_party, county)
SELECT integrated_voter_id, political_party, county
FROM voter_contact_staging
WHERE status = 'verified' AND integrated_voter_id IS NOT NULL;
```

## ✅ **Benefits**

1. **Project Consistency**: Standard `voter_id` field used throughout system
2. **Easy Integration**: No special handling needed for staging vs real voters
3. **Clear Identification**: TEMP prefix clearly identifies staging records
4. **Audit Trail**: Complete tracking from staging ID → official voter ID
5. **API Simplicity**: Single `voter_id` field in all responses