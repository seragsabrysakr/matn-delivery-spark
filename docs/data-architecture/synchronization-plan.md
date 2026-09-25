# Synchronization Plan

Design only. No Edge Functions, workers or API calls are implemented in this phase.

## Initial synchronization order

Dependencies force this order; each stage completes before the next begins.

1. Organization metadata
2. Projects (+ process template properties)
3. Teams (+ team settings, area paths, working days)
4. Iteration nodes per project (`core_iterations`)
   4b. Team iteration subscriptions and team settings — working days, time zone, days off, `selectedForSync` (`core_team_iterations`)
5. Members (team memberships, identity resolution)
6. Capacity (per team, per iteration)
7. Current work items (WIQL by project, batched fetch)
8. Work-item revisions/updates (derive transitions, scope changes, blocked history)
9. Repositories
10. Pull requests (+ reviewers, threads for first meaningful review)
11. Pipelines and builds (+ timelines for stages)
12. Deployments (environments, approvals, retries)
13. Test runs and result summaries
14. Snapshots and calculated KPIs, risk signals, recommendations

Backfill window defaults: work items and revisions 12 months, PRs/builds/deployments/tests 6 months, snapshots reconstructed from revisions where possible and otherwise started from the first sync date (gaps recorded as `snapshot_gap`).

## Incremental synchronization

- Watermark: `System.ChangedDate` for work items, `minTime`/`minModifiedTime`/`minLastUpdatedDate` for PRs, builds, deployments and tests; continuation tokens where the endpoint provides them.
- Cursors persist in `SyncCursor` per `(connection, entityKind, project)` with an `overlapMinutes` window (default 10) to absorb clock skew; overlap is safe because writes are idempotent.
- Pagination: `$top = 200` for work item batches, `continuationToken` loops elsewhere; hard page cap per run with resumable cursor.
- Concurrency: bounded worker pool (default 4 concurrent requests per organization, 1 run per organization at a time).
- Throttling: honour `Retry-After` and `X-RateLimit-*`; exponential backoff with jitter (1s → 60s, max 6 attempts) for 429/502/503/504 and network errors. 401/403/404 are non-transient and fail the entity scope, not the run.
- Idempotency: upsert on natural keys — `(tenant_id, organization_id, azure_work_item_id)`, `(tenant_id, work_item_id, rev)`, `(tenant_id, organization_id, azure_pull_request_id)`, etc. History tables use `ON CONFLICT DO NOTHING`.
- Revisions are never overwritten; a re-sync can only add missing revisions.
- Partial failures are recorded per entity kind; the run ends `partially_completed` and the failing scope keeps its old cursor so the next run retries exactly that gap.
- Resumption: `SyncRun.resumeCursor` stores the in-flight position, so a canceled or crashed run resumes without re-reading completed pages.

## Sync run lifecycle

`queued → running → { completed | partially_completed | failed | canceled }`

Recorded per run: scope, project ids, started/completed timestamps, cursor before and after, `recordsRead`, `recordsInserted`, `recordsUpdated`, `recordsSkipped`, error list (code, entity, transient flag), rate-limit info (delayed, throttled, max `Retry-After`, remaining budget), and linked data-quality issue ids.

Proposed schedules: work items and PRs every 15 minutes; builds, deployments and tests every 30 minutes; capacity hourly; org/project/team/iteration metadata daily; snapshots once per day per team after the local working-day boundary (see below) plus an intra-day recompute of KPIs after each work-item sync.

## Secure scheduled trigger

| Control        | Rule                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Method         | `POST` only                                                                                           |
| Payload        | `timestamp`, `nonce`, `idempotencyKey`, `tenantId`, `organizationId`, `scope`, `logicalDate`, `keyId` |
| Authentication | `HMAC-SHA256` signature header, constant-time comparison, `keyId` selects the active secret version   |
| Secret storage | encrypted secret store only — never in migration SQL, seeds, the database, logs or the client bundle  |
| Clock skew     | configurable window, default ±300 s; outside → reject `clock_skew`                                    |
| Replay         | nonce table with 7-day TTL; reused nonce or idempotency key → reject                                  |
| Concurrency    | one active `ops_sync_locks` row per organization, with heartbeat and auto-expiry                      |
| Duration       | hard `maxExecutionSeconds`; the run checkpoints and resumes rather than exceeding it                  |
| Batching       | resumable batches driven by `SyncRun.resumeCursor`                                                    |
| Rotation       | overlapping key versions; old `keyId` accepted for one rotation window, then removed                  |
| Audit          | every accepted and rejected trigger writes `aud_audit_events` with the outcome and reason             |
| Rate limiting  | per organization and per source IP on the route                                                       |
| Errors         | opaque codes; Azure credentials, tokens and upstream bodies are never returned                        |
| Exposure       | never referenced from client-side code                                                                |

**Scheduler choice is not final.** pg_cron can only carry a secret if that secret is readable from the database session, which contradicts "secret store only". Unless the production target provides a database-side vault the app trusts, an **external scheduler holding the signing key** (platform scheduler or a managed cron service calling the signed route) is the preferred alternative. The decision is deferred until the production hosting target is confirmed; both options satisfy the controls above, only the key custody differs.

## Snapshot timing

The previous 23:55 local run is replaced:

- Snapshots run at a **configurable local time after the working-day boundary**, default `00:05` in the team time zone, capturing the day that just ended (`logicalDateOffsetDays = -1`).
- **Logical date, not wall clock, is authoritative.** The idempotency key is `(tenant, team, logicalDate)`, so a re-run can never create a second snapshot for the same day.
- **DST**: scheduling is wall-clock based. A skipped local hour runs at the next valid instant; a repeated local hour runs once, because the logical date already exists.
- **Retries**: bounded retries with exponential backoff; a failed attempt leaves the row in `pending`, a partial capture in `provisional`.
- **Missed days**: a backfill pass reconstructs missing logical dates inside the configured window (default 14 days) and marks them `backfilled`; days outside the window are recorded as a `snapshot_gap` data-quality issue.
- **Time-zone changes**: the capture time zone is stored on the snapshot job run; historical snapshots are never re-dated after a team changes time zone.
- **Finalization**: `pending → provisional → finalized`; only `finalized` (or `backfilled`) rows feed trend KPIs, and a finalized day is immutable.

## Source deletion and access revocation

| Signal                                                 | Interpretation                   | Action                                                                      |
| ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `404` on a previously synced item, first observation   | unverified                       | mark `awaiting_verification`, keep `active`, retry on the next run          |
| `404` confirmed on a second, separate verification     | deleted at source                | set `sourceStatus = "deleted"`, `isDeleted = true`, `deletedAtSource = now` |
| `403`                                                  | access revoked, **not** deletion | set `sourceStatus = "inaccessible"`, `accessRevokedAt = now`                |
| item absent from a list/WIQL result                    | insufficient evidence            | direct-fetch verification required before any tombstone                     |
| ambiguous (mixed 403/404, scope change during the run) | undetermined                     | keep `unknown`, raise `deletion_vs_access_ambiguous`                        |

Rules: revisions, snapshots and audit history are **never** deleted. Current-state rows are tombstoned, not removed. `lastSeenAt` advances on every successful read. KPI calculations exclude tombstoned items **from the effective date forward** — historical values keep the items that were real at the time. Restoration is supported: a later successful read clears the tombstone and records the restore.

## Data freshness

Freshness is computed **per domain** (`FreshnessReport`), never as a single global flag.

| Domain        | Current  | Delayed    | Stale     | Unavailable                     |
| ------------- | -------- | ---------- | --------- | ------------------------------- |
| Work items    | ≤ 30 min | 31–120 min | > 120 min | never synced or last run failed |
| Capacity      | ≤ 2 h    | 2–8 h      | > 8 h     | not configured in Azure         |
| Repositories  | ≤ 24 h   | 24–48 h    | > 48 h    | no repositories                 |
| Pull requests | ≤ 30 min | 31–120 min | > 120 min | no repositories                 |
| Builds        | ≤ 60 min | 1–4 h      | > 4 h     | no pipelines                    |
| Deployments   | ≤ 2 h    | 2–8 h      | > 8 h     | no environments                 |
| Tests         | ≤ 2 h    | 2–12 h     | > 12 h    | no test runs                    |

`partial` applies when a domain synced only some projects or ended `partially_completed`. The overall status is the worst domain status, and the UI must name which domains are behind — it may never state that everything is current when only work items are.
