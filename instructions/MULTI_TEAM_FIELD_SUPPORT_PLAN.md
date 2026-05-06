# Multi-Team Field Support Plan

## Status Snapshot

This plan is still valid, but it needs a status update.

What is now complete:
- Phase 1 schema foundation is implemented locally and in production.
- `field_sessions` now has `team_id` and `support_queue`.
- `field_session_tasks` now has `team_id`, `assigned_support_email`, `priority`, `due_at`, and `version`.
- Admin field support UI now has a team filter.
- Worker routes now support team-aware reads and team inheritance on task creation.
- PATCH updates now support optimistic version checks.

What is not complete yet:
- Claim, release, and reassign endpoints.
- Support presence model and heartbeat.
- Task event audit table and event emission.
- Strong team membership enforcement backed by production team config.

Migration note:
- Local and production both reached migration `032_add_team_scope_field_support.sql`.
- Legacy migration drift required compatibility fixes in migrations `027`, `028`, `030`, and `031` so fresh, local, and production-aligned application would succeed.

## Goal

Enable the field support system to safely coordinate **multiple canvassing teams in different locations** with **multiple support operators** at the same time.

Primary outcomes:
- Team-scoped operations so one team's work does not leak into another team's queue.
- Safe task concurrency so two support operators do not accidentally overwrite each other.
- Clear ownership and auditability for task claims, reassignments, and status transitions.

## Intent and Delivery Strategy

This change is intentionally split into two stages:

1. **Review stage (this document):** confirm requirements, data model, endpoint contracts, and edge-case behavior.
2. **Implementation stage:** deliver in phased, backward-compatible increments with validation gates.

## Current-State Constraints

Current field support supports multiple admins in practice, but has gaps for scale:
- No explicit `team_id` scoping on sessions or tasks.
- No formal claim/lock semantics for support operators.
- Last-write-wins behavior for task updates.
- No explicit operator presence/capacity model.

## Review Checklist (must be approved before coding)

### A. Team Model
- Define source of truth for team membership (volunteer table, static config, or identity claims).
- Confirm whether users can belong to multiple teams.
- Confirm whether global dispatch users can view all teams.

### B. Support Routing
- Confirm default assignment strategy:
  - team-only queue, or
  - team queue with overflow fallback.
- Confirm whether supporters can manually reassign across teams.

### C. Concurrency Rules
- Confirm task lifecycle states and allowed transitions.
- Confirm claim timeout duration.
- Confirm whether a claim is required before status changes.

### D. Security and Audit
- Confirm role names and permissions.
- Confirm audit retention requirements for task events.

### E. Rollout Safety
- Confirm migration order and compatibility mode for existing data.
- Confirm backout strategy per phase.

## Proposed Data Model Changes

## Phase 1 schema deltas (team scoping)

### `field_sessions`
Add:
- `team_id TEXT NULL`
- `support_queue TEXT NULL` (optional logical channel)

Index additions:
- `idx_field_sessions_team_active (team_id, status, latest_location_at)`

### `field_session_tasks`
Add:
- `team_id TEXT NULL`
- `assigned_support_email TEXT NULL`
- `version INTEGER NOT NULL DEFAULT 1`
- `priority TEXT NOT NULL DEFAULT 'normal'` (enum: low, normal, high, urgent)
- `due_at TEXT NULL`

Index additions:
- `idx_tasks_team_status (team_id, status, created_at)`
- `idx_tasks_assignee_status (assigned_support_email, status, updated_at)`

## Phase 2 schema deltas (ownership + audit)

### New table: `support_presence`
- `email TEXT PRIMARY KEY`
- `team_id TEXT NULL`
- `status TEXT NOT NULL` (online, away, offline)
- `capacity INTEGER NOT NULL DEFAULT 5`
- `current_load INTEGER NOT NULL DEFAULT 0`
- `last_seen_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### New table: `field_task_events`
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `task_id INTEGER NOT NULL`
- `actor_email TEXT NOT NULL`
- `event_type TEXT NOT NULL` (created, claimed, released, reassigned, status_changed, edited)
- `old_status TEXT NULL`
- `new_status TEXT NULL`
- `old_assignee TEXT NULL`
- `new_assignee TEXT NULL`
- `metadata_json TEXT NULL`
- `created_at TEXT NOT NULL DEFAULT (datetime('now'))`

Index additions:
- `idx_task_events_task (task_id, created_at)`

## Backward compatibility

- Existing rows get `team_id = NULL` initially.
- During transition, API defaults `team_id` to user's primary team where available.
- Global admin can still query all records until strict team enforcement is enabled.

## Proposed API Contract Changes

## Existing endpoints to extend

### `GET /admin/field-sessions`
Add optional query params:
- `team_id`
- `include_all_teams` (global role only)
- `status` (active, ended)

Behavior:
- Non-global users can only read their own team scope.

### `POST /admin/field-sessions/:id/tasks`
Request additions:
- `team_id` (optional; inferred from session if omitted)
- `priority`, `due_at`

Behavior:
- Task inherits session `team_id` if not explicitly provided.
- Emit `field_task_events.created`.

### `PATCH /admin/field-session-tasks/:id`
Request additions:
- `expected_version` (required for status/title/notes updates)

Behavior:
- Reject with `409 conflict` if `expected_version` mismatches current row.
- Increment `version` on every successful update.
- Emit `field_task_events.status_changed` or `edited`.

## New endpoints

### `POST /admin/field-session-tasks/:id/claim`
Request:
- `expected_version`

Behavior:
- If unclaimed/open, set `assigned_support_email` to actor, transition to `claimed`, increment version.
- If already claimed by another actor, return `409`.
- Emit `field_task_events.claimed`.

### `POST /admin/field-session-tasks/:id/release`
Request:
- `expected_version`

Behavior:
- Clear assignee, optionally return to `open`, increment version.
- Emit `field_task_events.released`.

### `POST /admin/field-session-tasks/:id/reassign`
Request:
- `assignee_email`
- `expected_version`

Behavior:
- Allowed for team lead/global dispatch.
- Set new assignee, increment version.
- Emit `field_task_events.reassigned`.

### `POST /admin/support-presence/heartbeat`
Request:
- `team_id`, `status`, `capacity`

Behavior:
- Upsert presence row and `last_seen_at`.

## Auth and Role Model

Proposed role set:
- `field_volunteer`
- `support_operator`
- `team_lead`
- `global_dispatch`

Enforcement rules:
- Team-scoped routes require membership in target team.
- Cross-team access requires `global_dispatch`.
- Reassign across teams requires `global_dispatch`.

## UI/UX Changes

## Field Support Desk
- Add team filter dropdown with defaults:
  - My team
  - Specific team(s)
  - All teams (global dispatch only)
- Show task ownership fields:
  - Claimed by
  - Claimed age
  - Version (debug/hidden)
- Add actions:
  - Claim
  - Release
  - Reassign

## Task collision UX
- On `409`, show toast: "Task changed by another supporter. Reloading latest state."
- Auto-refresh task card and preserve user context.

## Presence UX
- Show operator presence card:
  - Online supporters by team
  - Queue size by team
  - Unclaimed tasks

## Acceptance Test Matrix

## Team isolation
1. Team A supporter cannot view Team B sessions/tasks.
2. Global dispatch can view Team A + Team B simultaneously.

## Concurrency
1. Supporter A claims task; Supporter B claim attempt gets `409`.
2. Supporter B tries status update with stale version; gets `409`.
3. UI refreshes and displays current owner/status after conflict.

## Routing
1. Task created for Team A appears only in Team A queue.
2. Reassign by team lead stays within team boundaries.

## Presence
1. Heartbeat updates online status and last seen.
2. Missing heartbeat marks supporter stale/offline (per timeout policy).

## Audit
1. Every claim/release/reassign/status change creates an event row.
2. Event row includes actor identity and timestamp.

## Implementation Phases

## Phase 1 - Team scope foundation
- Add `team_id` columns and indexes.
- Filter `GET /admin/field-sessions` and task reads by team.
- Add team filter control in support desk UI.
- Status: complete.

Gate: team isolation tests pass.

## Phase 2 - Ownership safety
- Add `version`, `assigned_support_email`, claim/release/reassign endpoints.
- Enforce optimistic concurrency on PATCH.
- Add conflict handling UX.
- Status: partially complete.
- Delivered already:
  - `version`
  - `assigned_support_email`
  - optimistic concurrency on PATCH
- Remaining:
  - claim endpoint
  - release endpoint
  - reassign endpoint
  - explicit conflict UX polish in the admin screen

Gate: concurrency tests pass under simultaneous updates.

## Phase 3 - Presence and balancing
- Add support presence heartbeat and dashboard summaries.
- Add stale claim release policy.
- Status: not started.

Gate: no orphaned claims after supporter disconnect/timeouts.

## Phase 4 - Metrics and hardening
- Add queue/latency metrics per team.
- Add dashboards and runbook notes.

Gate: operational review sign-off.

## Open Questions

1. Should team membership come from `volunteers` table, Access groups, or both?
2. Do we need per-county subqueues within team?
3. Should `claimed` tasks still be visible/editable by non-claimers with warning, or fully locked?
4. What claim timeout is acceptable (e.g., 5m, 10m, 15m)?

## Decision Log Template

- Date:
- Decision:
- Owner:
- Rationale:
- Impacted endpoints:
- Impacted schema:
- Follow-up actions:
