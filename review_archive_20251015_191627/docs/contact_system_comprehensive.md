# Contact System - Comprehensive Documentation
**Last Updated:** October 15, 2025  
**Project:** GrassrootsMVT Voter Contact Management

## 🎯 **Overview**

The contact system enables volunteers to record detailed interactions with voters during canvassing activities. This system has been enhanced from a basic modal-based approach to a comprehensive page-based architecture with rich data collection capabilities.

## 🏗️ **System Architecture**

### **Contact Flow**
1. **Canvass Page** → Contact button click
2. **Contact Page** → Rich contact form
3. **API Submission** → Database storage
4. **Status Integration** → Contact history display

### **Key Components**
- **Frontend**: Contact form with progressive disclosure
- **API Endpoint**: `/api/contact` for data submission
- **Database**: `voter_contact_staging` table for contact records
- **Integration**: Contact status display on canvass page

---

## 🔧 **Technical Implementation**

### **Contact Button Integration**
The contact button on the canvass page extracts voter information and navigates to the contact form.

#### **DOM Structure**
```html
<div class="voter-card">                    <!-- Target container -->
  <div class="person-name">John Doe (ID: 12345)</div>
  <div class="addr">123 Main St</div>
  <div class="location-details">Apt 2B</div>
  <div class="toolbar">
    <button data-a="contacted">📋 Contact</button>
  </div>
</div>
```

#### **Contact Button Handler**
```javascript
document.addEventListener('click', function(e) {
  if (e.target.matches('button[data-a="contacted"]')) {
    const btn = e.target;
    
    // Find voter card with fallback logic
    let voterCard = btn.closest('.voter-card');
    if (!voterCard) {
      // Fallback: traverse up to find element containing .person-name
      let testCard = btn.parentElement;
      while (testCard && !testCard.querySelector('.person-name')) {
        testCard = testCard.parentElement;
        if (testCard === document.body) break;
      }
      if (testCard && testCard.querySelector('.person-name')) {
        voterCard = testCard;
      }
    }
    
    // Extract voter information with error handling
    const voterNameElement = voterCard.querySelector('.person-name');
    const voterAddressElement = voterCard.querySelector('.addr');
    const locationDetailsElement = voterCard.querySelector('.location-details');
    
    if (!voterNameElement || !voterAddressElement || !locationDetailsElement) {
      console.error('🚨 Contact button error: Required voter elements not found');
      alert('Error: Could not find voter information. Please try again.');
      return;
    }
    
    // Parse voter data
    const voterName = voterNameElement.textContent.split(' (ID:')[0];
    const voterAddress = voterAddressElement.textContent;
    const locationDetails = locationDetailsElement.textContent;
    const voterIdMatch = voterNameElement.textContent.match(/ID:\s*(\d+)/);
    const voterId = voterIdMatch ? voterIdMatch[1] : '';
    
    // Navigate to contact page
    const contactUrl = `/contact?${new URLSearchParams({
      voter_id: voterId,
      name: voterName,
      address: voterAddress,
      location: locationDetails
    }).toString()}`;
    
    window.location.href = contactUrl;
  }
});
```

### **Contact Form Features**

#### **Progressive Disclosure**
The contact form reveals additional fields based on user selections:
- **Initial**: Basic contact outcome selection
- **Conditional**: Detailed fields based on contact type
- **Advanced**: Volunteer information and follow-up options

#### **Data Collection Fields**
- **Basic Contact Info**: Date, time, contact method
- **Voter Response**: Support level, key issues
- **Contact Outcome**: Result of interaction
- **Volunteer Details**: Volunteer name and email
- **Follow-up**: Scheduled actions and notes

#### **API Integration**
```javascript
// Contact form submission
const submitContactForm = async (formData) => {
  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      showSuccessMessage('Contact recorded successfully!');
      redirectToCanvass();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    showErrorMessage('Failed to record contact. Please try again.');
  }
};
```

---

## 🗄️ **Database Schema**

**📋 COMPREHENSIVE REFERENCE**: See [`database_schema_reference.md`](database_schema_reference.md) for complete database documentation including all tables, fields, relationships, and data management details.

### **voter_contact_staging Table** *(Summary)*
The contact staging system uses a comprehensive table to capture new voter information that requires verification before integration with existing voter data. Key features:
```sql
CREATE TABLE voter_contact_staging (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id TEXT NOT NULL,
    volunteer_name TEXT,
    vol_email TEXT,
    contact_date TEXT DEFAULT (date('now')),
    contact_time TEXT DEFAULT (time('now')),
    contact_method TEXT,
    at_home TEXT,
    contact_quality TEXT,
    voter_response TEXT,
    support_level TEXT,
    key_issues TEXT,
    contact_notes TEXT,
    follow_up_needed TEXT,
    follow_up_date TEXT,
    follow_up_notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (voter_id) REFERENCES voter_file (voter_id)
);
```

### **Key Relationships**
- **Foreign Key**: Links to `voter_file.voter_id`
- **Staging Table**: Allows for data validation before production integration
- **Timestamps**: Automatic tracking of creation and contact times

---

## 🔍 **Troubleshooting Guide**

### **Common Issues & Solutions**

#### **1. "Required voter elements not found" Error**
**Symptoms**: Console error when clicking contact button
**Cause**: DOM selector unable to find voter information elements
**Solution**: 
- Verify voter card has `.voter-card` class
- Check that `.person-name`, `.addr`, and `.location-details` elements exist
- Use fallback DOM traversal logic

#### **2. Contact Page Not Loading**
**Symptoms**: 404 error or redirect issues
**Cause**: Incorrect URL format or server configuration
**Solution**:
- Use `/contact` instead of `/contact.html`
- Verify Cloudflare Pages routing configuration
- Check URL parameter encoding

#### **3. API Submission Failures**
**Symptoms**: Form submission errors or timeouts
**Cause**: API endpoint issues or data validation failures
**Solution**:
- Verify `/api/contact` endpoint is available
- Check foreign key constraints on `voter_id`
- Validate required field completion

#### **4. Authentication Warnings in Development**
**Symptoms**: Console warnings about missing access tokens
**Status**: Expected behavior in local development
**Action**: No action required - warnings don't affect functionality

### **Debug Testing Instructions**

1. **Test Contact Button**:
   ```bash
   # Navigate to canvass page
   http://localhost:8788/canvass/?county=ALBANY&city=LARAMIE&parties=Unaffiliated
   
   # Search for voters
   Street: HAYFORD AVE
   House: 3006
   
   # Click "Find nearby" and test contact button
   ```

2. **Verify Console Output**:
   ```javascript
   // Expected success messages:
   🔍 Debug: voterCard found: true
   🔍 Debug elements found: {voterName: true, voterAddress: true, locationDetails: true}
   ```

3. **Test Contact Form**:
   - Verify voter data pre-population
   - Test progressive form disclosure
   - Submit form and check API response

---

## 📊 **Contact Status Integration**

### **Contact History Display**
The canvass page shows the last contact information for each voter to avoid duplicate efforts.

#### **API Endpoint**: `/api/contact/status`
```javascript
// Fetch contact status for voters
const getContactStatus = async (voterIds) => {
  const response = await fetch('/api/contact/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voter_ids: voterIds })
  });
  return await response.json();
};
```

#### **Status Display**
```javascript
// Display contact badges on voter cards
const displayContactStatus = (voter, contactInfo) => {
  if (contactInfo) {
    const badge = `<span class="contact-badge">
      Last: ${contactInfo.contact_date} (${contactInfo.contact_method})
    </span>`;
    // Append badge to voter card
  }
};
```

---

## 🚀 **Deployment & Production Notes**

### **Environment Configuration**
- **Development**: Authentication bypass enabled
- **Production**: Full Cloudflare Access integration
- **Staging**: Intermediate testing environment

### **API Endpoint Mapping**
```javascript
const endpointMap = {
  'contact': '/api/contact',
  'contact-status': '/api/contact/status'
};
```

### **Performance Considerations**
- Contact status queries are batched for efficiency
- Database indexes on `voter_id` and `contact_date`
- Caching strategies for frequently accessed contact data

---

## ✅ **Current Status & Future Enhancements**

### **Completed Features**
- ✅ Contact button DOM traversal with fallback logic
- ✅ Comprehensive contact form with progressive disclosure
- ✅ API integration for contact submission
- ✅ Contact status display on canvass page
- ✅ Database schema for contact staging
- ✅ Error handling and user feedback

### **Planned Enhancements**
- 📋 Contact analytics and reporting
- 📋 Bulk contact import/export functionality
- 📋 Advanced search and filtering options
- 📋 Integration with voter file updates
- 📋 Mobile-optimized contact forms

### **Known Limitations**
- Contact data currently stored in staging table
- Limited validation on volunteer information
- No automated follow-up reminder system

---

## 📝 **Files & Components**

### **Frontend Files**
- `ui/canvass/index.html` - Canvass page with contact buttons
- `ui/contact.html` - Main contact form page
- `ui/contact-form/index.html` - Standalone contact form

### **Backend Files**
- `worker/src/api/contact-form.js` - Contact API endpoint
- `db/schema/voter_contact_staging.sql` - Database schema
- `db/queries/progressive_search.sql` - Contact-related queries

### **Documentation**
- This comprehensive guide
- API documentation in related files
- Testing guides and troubleshooting notes

---

**Status**: 🟢 **FULLY OPERATIONAL** - Contact system is working correctly with all major features implemented and tested.