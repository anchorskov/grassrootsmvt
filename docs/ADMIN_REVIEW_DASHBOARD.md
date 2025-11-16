# Admin Review Dashboard

## Overview

The **Contact Review Dashboard** (`/admin/review.html`) is a streamlined interface for administrators to review voter contact records and pulse opt-ins efficiently. It replaces the raw JSON view with a human-readable card-based layout and adds powerful navigation features.

---

## Features

### 1. **Dual Data Source Support**
- **Voter Contacts**: Review all contact submissions from volunteers
- **Pulse Opt-ins**: Review SMS consent records from the `pulse_optins` table

### 2. **Improved Data Display**
Instead of JSON dumps, records are displayed in organized sections:
- **Basic Information**: ID, voter ID, status badges
- **Contact Details**: Method, outcome, volunteer, timestamp
- **Callback & Follow-up**: Preferences and scheduling info
- **Contact Preferences**: SMS/email opt-ins, DNC flag
- **Engagement & Issues**: Volunteer interest, policy positions

### 3. **Efficient Navigation**
- **List View (Left Sidebar)**: Compact list of all records with visual indicators
  - ✅ Green checkmark = Reviewed
  - ⏳ Yellow clock = Pending review
  - Active record highlighted in blue
  
- **Detail View (Right Panel)**: Full record details in readable format
  
- **Previous/Next Buttons**: Navigate through records sequentially
  - Also works with **keyboard arrows** (← → ↑ ↓)
  
### 4. **Quick Actions**
- **Mark as Reviewed**: Toggle review status (keyboard: `R`)
- **Delete**: Remove record (with confirmation)
- **Filter**: Show all, unreviewed only, or reviewed only
- **Refresh**: Reload current data set

### 5. **Keyboard Shortcuts**
| Key | Action |
|-----|--------|
| `←` or `↑` | Previous record |
| `→` or `↓` | Next record |
| `R` | Toggle reviewed status |

---

## Usage Guide

### Accessing the Dashboard
1. Navigate to `/admin/` (main admin page)
2. Click **"📋 Open Contact Review Dashboard"** button
3. Or go directly to `/admin/review.html`

### Reviewing Contacts
1. **Select Data Source**: Choose "Voter Contacts" or "Pulse Opt-ins" from dropdown
2. **Apply Filter**: Select "Unreviewed Only" to focus on pending items
3. **Navigate**: Click a record in the left list or use arrow keys
4. **Review**: Read the formatted details in the right panel
5. **Take Action**:
   - Click "✓ Mark as Reviewed" when done reviewing
   - Click "🗑️ Delete" to remove invalid records
6. **Continue**: Use "Next →" button or arrow keys to move to next record

### Reviewing Pulse Opt-ins
1. Switch **Data Source** to "Pulse Opt-ins"
2. Review consent details:
   - Voter ID
   - Contact method (usually SMS)
   - Consent source (call, canvass, online)
   - Volunteer who recorded consent
   - Opt-in timestamp
3. Delete opt-ins if:
   - Duplicate entry
   - Invalid phone number
   - Voter requested removal

---

## API Endpoints

### GET `/admin/pulse`
Fetch all pulse opt-in records.

**Query Parameters:**
- `limit` (optional, default: 500, max: 1000)
- `offset` (optional, default: 0)

**Response:**
```json
{
  "ok": true,
  "optins": [
    {
      "id": 123,
      "voter_id": "12345",
      "contact_method": "sms",
      "consent_given": 1,
      "consent_source": "call",
      "volunteer_email": "volunteer@example.com",
      "created_at": "2025-11-11T10:30:00Z"
    }
  ],
  "total": 150,
  "limit": 500,
  "offset": 0
}
```

### DELETE `/admin/pulse/:id`
Delete a specific pulse opt-in record.

**Response:**
```json
{
  "ok": true,
  "message": "Pulse opt-in deleted",
  "id": "123"
}
```

---

## Database Schema

### `voter_contacts` Table
See `instructions/Local_D1_Schema_Snapshot_wy_local_20251110.md` for complete schema.

**Key Fields for Admin Review:**
- `id` - Record identifier
- `voter_id` - Links to voter
- `volunteer_id` - Who made contact
- `method` - Contact method (phone, door, etc.)
- `outcome` - Result (contacted, not_home, etc.)
- `reviewed` - Admin review flag (0/1)
- `comments` - Free-form notes
- `dnc` - Do not contact flag
- `optin_sms`, `optin_email` - Consent flags
- `created_at` - Timestamp

### `pulse_optins` Table
**Schema:**
- `id` INTEGER PRIMARY KEY
- `voter_id` TEXT NOT NULL
- `contact_method` TEXT (sms, email)
- `consent_given` BOOLEAN (1 = yes, 0 = revoked)
- `consent_source` TEXT (call, canvass, online)
- `volunteer_email` TEXT
- `created_at` DATETIME

**Purpose:** Tracks explicit SMS consent for campaign texting. Only voters in this table should receive text messages.

---

## Best Practices

### Contact Review Workflow
1. **Daily Review**: Check unreviewed contacts at least once daily
2. **Flag Issues**: Delete records with:
   - Obvious data entry errors
   - Duplicate submissions
   - Test/demo entries
3. **Mark Reviewed**: After verifying accuracy, mark as reviewed to track progress
4. **Follow-up**: Note records requesting callbacks or information

### Pulse Opt-in Management
1. **Verify Consent**: Ensure consent source is legitimate
2. **Check Duplicates**: Delete duplicate opt-ins for same voter
3. **Respect Revocations**: If `consent_given = 0`, voter has opted out
4. **Audit Trail**: Volunteer email shows who recorded consent

### Data Quality
- Delete test entries immediately
- Ensure volunteer notes are present for unusual outcomes
- Verify phone/email format before approving for outreach
- Flag DNC records for volunteer training if patterns emerge

---

## Comparison: Old vs New

### Old Interface (`/admin/index.html`)
- ❌ JSON dumps hard to read
- ❌ Must view/edit each record individually
- ❌ No keyboard navigation
- ❌ No visual indicators for reviewed status
- ❌ No pulse opt-in review

### New Dashboard (`/admin/review.html`)
- ✅ Formatted card-based layout
- ✅ List + detail split view
- ✅ Arrow key navigation
- ✅ Visual badges and checkboxes
- ✅ Integrated pulse opt-in review
- ✅ Batch operations via filtering

---

## Technical Notes

### Performance
- Loads up to 500 records at once (configurable)
- Client-side navigation after initial load
- Efficient state management with index tracking

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Responsive design (works on tablets)

### Security
- Requires admin authentication via Cloudflare Access
- All API calls include auth headers
- Delete operations require confirmation

---

## Future Enhancements

**Potential improvements:**
1. **Batch Actions**: Select multiple records for bulk review/delete
2. **Search/Filter**: Find specific voter IDs or volunteers
3. **Export**: Download filtered results as CSV
4. **Inline Editing**: Edit fields without leaving detail view
5. **Activity Log**: Track who reviewed/modified records
6. **Smart Suggestions**: Auto-flag suspicious patterns

---

## Support

For issues or feature requests:
1. Check console for JavaScript errors
2. Verify admin authentication is working
3. Test with `/admin/whoami` endpoint
4. Review browser network tab for API failures
5. Document the issue with screenshots

---

## Related Documentation
- `docs/database_schema_reference.md` - Full database schema
- `instructions/Local_D1_Schema_Snapshot_wy_local_20251110.md` - Schema snapshot with contact tables
- `docs/contact_system_comprehensive.md` - Contact system overview
