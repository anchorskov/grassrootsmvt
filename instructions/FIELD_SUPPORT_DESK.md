# Field Support Desk

## Scope

Field volunteers can start an active field session and choose whether to share their latest location. Support volunteers use the dashboard to see active sessions, add call-ahead tasks, and confirm next stops.

## Data Retention

Version 1 stores only the latest location on `field_sessions`.

- `POST /api/field-sessions/:id/stop-sharing` immediately clears `latest_lat`, `latest_lng`, `latest_accuracy_m`, and `latest_location_at`.
- `POST /api/field-sessions/:id/end` ends the session and clears the latest location fields.
- Support dashboards should treat active sessions with no latest location update for more than 30 minutes as stale.

Recommended manual cleanup until scheduled cleanup is added:

```sql
UPDATE field_sessions
SET status = 'ended',
    sharing_enabled = 0,
    latest_lat = NULL,
    latest_lng = NULL,
    latest_accuracy_m = NULL,
    latest_location_at = NULL,
    ended_at = COALESCE(ended_at, datetime('now')),
    updated_at = datetime('now')
WHERE status = 'active'
  AND started_at < datetime('now', '-24 hours');

DELETE FROM field_session_tasks
WHERE session_id IN (
  SELECT id FROM field_sessions
  WHERE status = 'ended'
    AND ended_at < datetime('now', '-30 days')
);

DELETE FROM field_sessions
WHERE status = 'ended'
  AND ended_at < datetime('now', '-30 days');
```

Run cleanup locally against `wy_local` first, then remote `wy` after verification.
