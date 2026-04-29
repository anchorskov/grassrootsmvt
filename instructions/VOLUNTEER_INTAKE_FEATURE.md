# Volunteer Add/Update Quick Action - Implementation Summary

## Status: ✅ COMPLETE

All components of the "Add/Update Volunteer" feature are fully implemented and integrated.

---

## Architecture Overview

### 1. **Database Schema** (`worker/db/migrations/013_create_volunteer_staging.sql`)

**Table: `volunteer_staging`**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `staging_id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique identifier |
| `submitted_by` | TEXT | NOT NULL | Email of submitter |
| `action` | TEXT | NOT NULL DEFAULT 'new' | 'new' or 'update' |
| `target_id` | TEXT | — | Existing volunteer email/ID (for updates) |
| `first_name` | TEXT | — | Volunteer first name |
| `last_name` | TEXT | — | Volunteer last name |
| `email` | TEXT | — | Volunteer email address |
| `cell_phone` | TEXT | — | Volunteer phone |
| `county` | TEXT | — | County |
| `city` | TEXT | — | City |
| `notes` | TEXT | — | Admin notes |
| `is_active` | INTEGER | — | 1/0 active flag |
| `review_status` | TEXT | DEFAULT 'pending' | pending/approved/rejected |
| `review_notes` | TEXT | — | Admin review notes |
| `reviewed_by` | TEXT | — | Admin email |
| `reviewed_at` | TEXT | — | Review timestamp |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | Creation time |
| `updated_at` | TEXT | — | Last update time (auto-trigger) |

**Indexes:**
- `idx_volunteer_staging_status` on `review_status`
- `idx_volunteer_staging_target` on `target_id`

**Trigger:**
- `trg_volunteer_staging_updated_at`: Automatically updates `updated_at` on every row update

---

### 2. **Frontend Components**

#### **A. Quick Action Button** (`ui/index.html` line 63)
```html
<button class="quick-action" data-quick-action="volunteer">
  🙋 Add/Update Volunteer
</button>
```

**Handler** (lines 227-230):
- Clicking navigates to `/volunteer-intake/index.html`
- Uses standard JavaScript navigation pattern

#### **B. Volunteer Intake Form** (`ui/volunteer-intake/index.html`)

**Form Fields:**
- **Request Type** (action): Select between "Add new volunteer" or "Update existing volunteer"
- **Existing Volunteer** (target_id): Email/ID required for updates
- **First Name**: Required for new submissions
- **Last Name**: Required for new submissions
- **Email**: Required volunteer email
- **Cell Phone** (optional): Auto-normalized
- **County**: Optional, auto-uppercased
- **City**: Optional, auto-uppercased
- **Notes**: Freeform textarea for admins
- **Is Active**: Checkbox (defaults to true)

**Form Logic:**
- Built with standard HTML5 form validation
- Uses `apiPost('volunteer-staging', payload)` via `apiClient.v2.js`
- Automatic auth handling via `ensureAccessSession()`
- Error/success state management with visual feedback
- Success card displays staging ID and status

**Data Submission:**
```javascript
{
  action: "new" | "update",
  target_id: null | "volunteer@email.com",
  first_name: "John",
  last_name: "Doe",
  email: "john@example.com",
  cell_phone: "+1307...",
  county: "LARAMIE",
  city: "CHEYENNE",
  notes: "...",
  is_active: true | false
}
```

---

### 3. **Backend API Endpoint**

#### **Endpoint: `POST /api/volunteer-staging`**
**Location:** `worker/src/index.js` lines 1977–2088

**Request Body:**
```javascript
{
  action: "new" | "update",
  target_id?: "volunteer@email.com",  // Required for updates
  first_name?: "John",
  last_name?: "Doe",
  email: "john@example.com",
  cell_phone?: "+1307...",
  county?: "LARAMIE",
  city?: "CHEYENNE",
  notes?: "...",
  is_active?: 1 | 0 | true | false
}
```

**Validation:**
- Requires auth via `ensureAuth(request, env, ctx.config)`
- Requires either `(first_name AND last_name)` OR `email` OR `cell_phone`
- Normalizes phone numbers via `normalizeCellPhone()`
- Uppercases county/city fields
- Converts boolean flags via `coerceBooleanFlag()`

**Database Insert:**
```sql
INSERT INTO volunteer_staging (
  submitted_by, action, target_id,
  first_name, last_name, email, cell_phone,
  county, city, notes, is_active, review_status, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
```

**Response (Success 200):**
```javascript
{
  ok: true,
  staging_id: 42,
  review_status: "pending",
  notification: {
    sent: true | false,
    status?: 250,
    skipped?: "no_recipient_configured",
    error?: "..."
  }
}
```

**Response (Error 400/500):**
```javascript
{
  ok: false,
  error: "Missing required fields: name",
  detail?: "..."
}
```

---

### 4. **Email Notification System**

#### **Function: `maybeSendVolunteerNotification(env, submission)`**
**Location:** `worker/src/index.js` lines 3612–3664

**Configuration:**
- **Recipient:** Reads from `VOLUNTEER_NOTIFY_EMAIL` env var, falls back to `ADMIN_EMAILS`
- **From:** Uses `NOTIFY_FROM_EMAIL` env var or `notifications@{PUBLIC_HOSTNAME}`
- **Provider:** MailChannels API (`https://api.mailchannels.net/tx/v1/send`)

**Email Content Format:**
```
A volunteer submitted a staging record.
Action: new | update
Target: volunteer@email.com (if update)
Volunteer email: john@example.com
Name: John Doe
County: LARAMIE
City: CHEYENNE
Staging ID: 42
Submitted at: 2025-12-02T15:30:45.123Z
```

**Return Value:**
- `{ sent: true, status: 250 }` on success
- `{ sent: false, skipped: 'no_recipient_configured' }` if no recipient configured
- `{ sent: false, status: 400, detail: "..." }` on API error
- `{ sent: false, error: "..." }` on network/timeout error

**Recipient Selection:**
```javascript
function pickVolunteerNotifyRecipient(env) {
  // Tries VOLUNTEER_NOTIFY_EMAIL first, falls back to ADMIN_EMAILS
  // Returns first non-empty email or null
}
```

---

### 5. **Helper Functions**

**Location:** `worker/src/index.js`

| Function | Lines | Purpose |
|----------|-------|---------|
| `pickVolunteerNotifyRecipient(env)` | 3604–3610 | Select notification recipient |
| `maybeSendVolunteerNotification(env, submission)` | 3612–3664 | Send email via MailChannels |
| `fetchVolunteerById(env, db, volunteerTable, id)` | 3666–3679 | Fetch volunteer record by ID |
| `getVoterProfile(env, db, voterId)` | 3681–3693 | Fetch voter profile |
| `normalizeCellPhone(phone)` | (utility) | Format phone numbers |
| `coerceBooleanFlag(value, defaultTrue)` | (utility) | Convert various boolean formats |
| `buildVolunteerName(first, last)` | (utility) | Format name string |

---

## End-to-End Flow

### User Interaction
1. **Volunteer clicks "🙋 Add/Update Volunteer"** on hub (`ui/index.html`)
2. **Navigated to intake form** (`ui/volunteer-intake/index.html`)
3. **Fills form fields** (name, email, county, notes, action type)
4. **Clicks "Submit to staging"**
5. **Form posts to `/api/volunteer-staging`** via `apiPost()`
6. **Server validates and inserts** into `volunteer_staging` table
7. **Email notification sent** to `VOLUNTEER_NOTIFY_EMAIL` (if configured)
8. **Success card displays** with staging ID and status
9. **Admin reviews** in staging queue (separate admin interface)

### Authentication & Security
- All requests require valid auth session (Cloudflare Access or dev bypass)
- `submitted_by` field automatically populated from `auth.email`
- Form includes CORS-safe headers and origin validation

---

## Configuration & Environment Variables

**Required for email notifications:**
- `VOLUNTEER_NOTIFY_EMAIL` – Email to receive admin notifications (or use `ADMIN_EMAILS`)
- `NOTIFY_FROM_EMAIL` – Sender email (optional, defaults to `notifications@{PUBLIC_HOSTNAME}`)
- `PUBLIC_HOSTNAME` – Public domain (used in default From address)

**Optional:**
- `ADMIN_EMAILS` – Fallback for notification recipient

**Example `.env`:**
```ini
VOLUNTEER_NOTIFY_EMAIL=admin@volunteers.grassrootsmvt.org
NOTIFY_FROM_EMAIL=forms@volunteers.grassrootsmvt.org
PUBLIC_HOSTNAME=volunteers.grassrootsmvt.org
```

---

## Database State

**Post-submission state:**
- Record created in `volunteer_staging` with `review_status = 'pending'`
- `created_at` auto-set to submission time
- `updated_at` managed by trigger on updates
- `submitted_by` contains submitter's email
- `staging_id` available for tracking/reference

**Admin Review Actions (future):**
- Approve: Update `review_status = 'approved'`, apply changes to `volunteers` table
- Reject: Update `review_status = 'rejected'`, set `review_notes`
- Contact: Email volunteer for clarification

---

## Testing Checklist

- [x] Migration creates table with correct schema
- [x] UI button navigates to intake form
- [x] Form validates required fields
- [x] Form submits to `/api/volunteer-staging` endpoint
- [x] API validates input and normalizes fields
- [x] Record inserted to staging table
- [x] `submitted_by` correctly set from auth
- [x] Email notification sent (if `VOLUNTEER_NOTIFY_EMAIL` set)
- [x] Success response includes staging ID
- [x] Error responses show meaningful messages
- [x] Form resets after successful submission

---

## Files & Locations

| File | Type | Purpose |
|------|------|---------|
| `worker/db/migrations/013_create_volunteer_staging.sql` | Schema | Table definition + indexes + trigger |
| `ui/index.html` | UI | Quick action button (line 63) + handler (line 228) |
| `ui/volunteer-intake/index.html` | UI | Complete intake form page |
| `worker/src/index.js` | API | POST `/api/volunteer-staging` (line 1977) |
| `worker/src/index.js` | Utils | Email notification (line 3612) + helpers |

---

## Usage Example

**As a volunteer:**
1. Click "🙋 Add/Update Volunteer"
2. Select "Add new volunteer"
3. Fill: John Doe, john@example.com, (307) 555-1234, LARAMIE, CHEYENNE
4. Add notes: "Availability: Weekends only, interested in calling"
5. Check "Mark as active"
6. Click "Submit to staging"
7. Success message shows Staging ID 42
8. Admin receives email notification

**Admin then:**
- Reviews in admin panel
- Approves/rejects with notes
- Merged record becomes active volunteer

---

## Notes

- Form uses existing `apiClient.v2.js` and `authGlobal.js` utilities
- Email notifications are optional (no failure if misconfigured)
- All timestamps use ISO 8601 format
- Phone normalization is best-effort (digits extracted, E.164 preferred)
- Field data is sanitized on input (trimmed, uppercased where needed)

---

**Status: Production Ready** ✅

All components tested and integrated. Feature ready for volunteer submissions and admin review workflow.
