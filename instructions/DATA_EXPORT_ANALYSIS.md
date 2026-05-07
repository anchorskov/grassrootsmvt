# Data Export & Analysis Instructions

Instructions for AI tools to extract volunteer-collected data from the GrassrootsMVT D1 database into local CSV files and surface admin action items.

**Ground rules:**
- Always export to `exports/` in the project root (create if missing).
- CSV filenames include a date stamp so exports accumulate without overwriting history: `YYYYMMDD_tablename.csv`.
- Before exporting, check if today's file already exists — skip if it does (avoid repeating the same pull).
- All `wrangler d1 execute` commands run from the **project root** using `--config worker/wrangler.toml`.
- **Always include `--remote`** — without it, wrangler silently queries a local empty stub instead of the real database.
- Use `--env production --remote` for live data. Use `--local` (no `--remote`) for the local mirror.
- After each export, run the action-item queries against the CSV (or re-query D1) and write a dated summary to `exports/YYYYMMDD_action_items.md`.

---

## 1. Setup

```bash
mkdir -p exports
```

---

## 2. Export commands

Run each block in order. Replace `YYYYMMDD` with today's date (e.g. `20260507`).

### 2a. Voter contacts (`voter_contacts`)

Full volunteer interaction records — opt-ins, outcomes, DNC flags, issues.

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    vc.id,
    vc.voter_id,
    v.county,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    vc.method,
    vc.outcome,
    vc.volunteer_id,
    vc.ok_callback,
    vc.requested_info,
    vc.dnc,
    vc.optin_sms,
    vc.optin_email,
    vc.email,
    vc.wants_volunteer,
    vc.for_term_limits,
    vc.issue_public_lands,
    vc.best_day,
    vc.best_time_window,
    vc.comments,
    vc.reviewed,
    vc.created_at,
    vc.updated_at
  FROM voter_contacts vc
  LEFT JOIN voters v ON v.voter_id = vc.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = vc.voter_id
  ORDER BY vc.created_at DESC" \
  --json > exports/YYYYMMDD_voter_contacts.json
```

### 2b. Call activity (`call_activity`)

Every phone banking call logged — results, notes, pulse opt-ins, follow-up flags.

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    ca.id,
    ca.voter_id,
    v.county,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    ca.volunteer_email,
    ca.call_result,
    ca.notes,
    ca.pitch_used,
    ca.pulse_opt_in,
    ca.response_sentiment,
    ca.issue_interest,
    ca.followup_needed,
    ca.followup_date,
    ca.duration_seconds,
    ca.created_at
  FROM call_activity ca
  LEFT JOIN voters v ON v.voter_id = ca.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = ca.voter_id
  ORDER BY ca.created_at DESC" \
  --json > exports/YYYYMMDD_call_activity.json
```

### 2c. Canvass activity (`canvass_activity`)

Every door-knock logged — results, pulse opt-ins, follow-up flags, GPS.

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    ca.id,
    ca.voter_id,
    v.county,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    ca.volunteer_email,
    ca.result,
    ca.notes,
    ca.pitch_used,
    ca.pulse_opt_in,
    ca.door_status,
    ca.followup_needed,
    ca.location_lat,
    ca.location_lng,
    ca.created_at
  FROM canvass_activity ca
  LEFT JOIN voters v ON v.voter_id = ca.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = ca.voter_id
  ORDER BY ca.created_at DESC" \
  --json > exports/YYYYMMDD_canvass_activity.json
```

### 2d. Pulse opt-ins (`pulse_optins`)

Explicit consent records for SMS/email — source of truth for text/email lists.

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    po.id,
    po.voter_id,
    v.county,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    po.contact_method,
    po.consent_given,
    po.consent_source,
    po.volunteer_email,
    po.created_at
  FROM pulse_optins po
  LEFT JOIN voters v ON v.voter_id = po.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = po.voter_id
  ORDER BY po.created_at DESC" \
  --json > exports/YYYYMMDD_pulse_optins.json
```

---

## 3. Convert JSON → CSV

The `--json` flag returns a JSON array. Convert each file to CSV:

```bash
# Requires python3 (available on most systems)
python3 - <<'EOF'
import json, csv, sys, os, glob

for jsonfile in glob.glob('exports/*.json'):
    csvfile = jsonfile.replace('.json', '.csv')
    if os.path.exists(csvfile):
        print(f'SKIP (exists): {csvfile}')
        continue
    with open(jsonfile) as f:
        rows = json.load(f)
    if not rows:
        print(f'EMPTY: {jsonfile}')
        continue
    # D1 --json wraps results in [{results:[...]}, ...]
    if isinstance(rows, list) and 'results' in rows[0]:
        rows = rows[0]['results']
    with open(csvfile, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    print(f'WROTE: {csvfile} ({len(rows)} rows)')
EOF
```

---

## 4. Action item queries

Run these after exporting. Each surfaces a specific admin task.

### 4a. Pulse / SMS opt-ins to add to text list

Sources: `voter_contacts.optin_sms = 1` AND `call_activity.pulse_opt_in = 1` AND `pulse_optins` table.

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT DISTINCT
    vc.voter_id,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    v.county,
    vc.optin_sms,
    vc.created_at,
    'voter_contacts' AS source
  FROM voter_contacts vc
  LEFT JOIN voters v ON v.voter_id = vc.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = vc.voter_id
  WHERE vc.optin_sms = 1

  UNION

  SELECT DISTINCT
    ca.voter_id,
    va.fn, va.ln, va.city, v.county,
    1 AS optin_sms,
    ca.created_at,
    'call_activity' AS source
  FROM call_activity ca
  LEFT JOIN voters v ON v.voter_id = ca.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = ca.voter_id
  WHERE ca.pulse_opt_in = 1

  ORDER BY created_at DESC" \
  --json > exports/YYYYMMDD_action_sms_optins.json
```

### 4b. Email opt-ins

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    vc.voter_id,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    v.county,
    vc.email,
    vc.optin_email,
    vc.created_at
  FROM voter_contacts vc
  LEFT JOIN voters v ON v.voter_id = vc.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = vc.voter_id
  WHERE vc.optin_email = 1
  ORDER BY vc.created_at DESC" \
  --json > exports/YYYYMMDD_action_email_optins.json
```

### 4c. Follow-ups needed (phone + canvass)

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    ca.voter_id,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    v.county,
    ca.call_result,
    ca.notes,
    ca.followup_date,
    ca.volunteer_email,
    ca.created_at,
    'phone' AS contact_type
  FROM call_activity ca
  LEFT JOIN voters v ON v.voter_id = ca.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = ca.voter_id
  WHERE ca.followup_needed = 1

  UNION ALL

  SELECT
    can.voter_id,
    va.fn, va.ln, va.city, v.county,
    can.result AS call_result,
    can.notes,
    NULL AS followup_date,
    can.volunteer_email,
    can.created_at,
    'canvass' AS contact_type
  FROM canvass_activity can
  LEFT JOIN voters v ON v.voter_id = can.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = can.voter_id
  WHERE can.followup_needed = 1

  ORDER BY created_at DESC" \
  --json > exports/YYYYMMDD_action_followups.json
```

### 4d. Do Not Contact requests

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    vc.voter_id,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    v.county,
    vc.dnc,
    vc.comments,
    vc.created_at
  FROM voter_contacts vc
  LEFT JOIN voters v ON v.voter_id = vc.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = vc.voter_id
  WHERE vc.dnc = 1
  ORDER BY vc.created_at DESC" \
  --json > exports/YYYYMMDD_action_dnc.json
```

### 4e. Voters who want to volunteer

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    vc.voter_id,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    v.county,
    vc.email,
    vc.comments,
    vc.created_at
  FROM voter_contacts vc
  LEFT JOIN voters v ON v.voter_id = vc.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = vc.voter_id
  WHERE vc.wants_volunteer = 1
  ORDER BY vc.created_at DESC" \
  --json > exports/YYYYMMDD_action_wants_volunteer.json
```

### 4f. Issue interest summary (term limits, public lands)

```bash
npx wrangler d1 execute wy --env production --remote --config worker/wrangler.toml \
  --command "SELECT
    vc.voter_id,
    va.fn AS first_name,
    va.ln AS last_name,
    va.city,
    v.county,
    vc.for_term_limits,
    vc.issue_public_lands,
    ca.issue_interest AS call_issue_interest,
    vc.comments,
    vc.created_at
  FROM voter_contacts vc
  LEFT JOIN voters v ON v.voter_id = vc.voter_id
  LEFT JOIN voters_addr_norm va ON va.voter_id = vc.voter_id
  LEFT JOIN call_activity ca ON ca.voter_id = vc.voter_id
  WHERE vc.for_term_limits = 1
     OR vc.issue_public_lands = 1
     OR ca.issue_interest IS NOT NULL
  ORDER BY vc.created_at DESC" \
  --json > exports/YYYYMMDD_action_issues.json
```

---

## 5. Action item summary (write after running queries)

After running section 4, create this file. Update it each export run — don't create a new one per day; overwrite `exports/action_items_current.md`.

```markdown
# Admin Action Items — [DATE]

## SMS Opt-In List ([N] voters)
- Export: `YYYYMMDD_action_sms_optins.csv`
- Action: Add to SMS/Pulse contact list. Verify no duplicates from prior export.

## Email Opt-In List ([N] voters)
- Export: `YYYYMMDD_action_email_optins.csv`
- Action: Add emails to campaign email list.

## Follow-Ups Needed ([N] total — [X] phone, [Y] canvass)
- Export: `YYYYMMDD_action_followups.csv`
- Action: Assign to a volunteer or admin for callback. Check followup_date if set.

## Do Not Contact ([N] voters)
- Export: `YYYYMMDD_action_dnc.csv`
- Action: Remove from all future call and canvass lists. Mark in voter_contacts.reviewed.

## Wants to Volunteer ([N] voters)
- Export: `YYYYMMDD_action_wants_volunteer.csv`
- Action: Reach out to recruit. Add to volunteer intake if not already registered.

## Issue Interests ([N] records)
- Export: `YYYYMMDD_action_issues.csv`
- Action: Tag for issue-specific outreach (term limits mailer, public lands events, etc.)
```

---

## 6. Incremental exports (avoid re-pulling unchanged data)

To pull only records newer than the last export, add a `WHERE created_at > '...'` clause. Store the last-run timestamp in `exports/.last_export_ts`:

```bash
# Read last timestamp (default to epoch if file missing)
LAST_TS=$(cat exports/.last_export_ts 2>/dev/null || echo "2020-01-01T00:00:00")

# Use in query — example for call_activity:
# ... WHERE ca.created_at > '${LAST_TS}' ...

# After successful export, update timestamp:
date -u +"%Y-%m-%dT%H:%M:%S" > exports/.last_export_ts
```

---

## 7. Files in `exports/` and what they contain

| File pattern | Source table | Contents |
|---|---|---|
| `YYYYMMDD_voter_contacts.csv` | `voter_contacts` | All volunteer contact records |
| `YYYYMMDD_call_activity.csv` | `call_activity` | All phone banking calls |
| `YYYYMMDD_canvass_activity.csv` | `canvass_activity` | All door-knock records |
| `YYYYMMDD_pulse_optins.csv` | `pulse_optins` | Explicit SMS/email consent |
| `YYYYMMDD_action_sms_optins.csv` | derived | Voters who opted into SMS |
| `YYYYMMDD_action_email_optins.csv` | derived | Voters who opted into email |
| `YYYYMMDD_action_followups.csv` | derived | Voters needing follow-up call or visit |
| `YYYYMMDD_action_dnc.csv` | derived | Do Not Contact requests |
| `YYYYMMDD_action_wants_volunteer.csv` | derived | Voters who want to volunteer |
| `YYYYMMDD_action_issues.csv` | derived | Voters with issue interests flagged |
| `action_items_current.md` | derived | Current admin action summary (overwritten each run) |
| `.last_export_ts` | — | Timestamp of last successful export |

---

## 8. What NOT to do

- Do not commit CSV files to git — they contain PII. Confirm `exports/` is in `.gitignore`.
- Do not invent column names — verify against migrations in `worker/db/migrations/`.
- Do not run `--env production` D1 writes without explicit admin approval.
- Do not deduplicate voters across sources manually — use `DISTINCT voter_id` in SQL.
