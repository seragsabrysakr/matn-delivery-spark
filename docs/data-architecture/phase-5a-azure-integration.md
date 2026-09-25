# Phase 4 / 5A — Azure DevOps foundation integration

Read-only integration of organization, projects, teams, iterations, team iterations, members and
memberships. Work items, pull requests, builds, deployments and test runs are explicitly out of scope
for this phase; the dashboards remain in mock mode until the foundation is verified against a real
organization.

## Server boundary

| Concern         | Location                                       | Notes                                                                             |
| --------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| REST client     | `src/lib/azure/client.server.ts`               | GET-only, `api-version=7.1`, Basic auth built from the PAT inside the constructor |
| Pure rules      | `src/lib/azure/sync-rules.ts`                  | template kind, iteration phase, date normalization, identity precedence           |
| Foundation sync | `src/lib/azure/sync.server.ts`                 | lock, run row, upserts, tombstones, run report                                    |
| Authorization   | `src/lib/azure/authz.server.ts`                | tenant resolution from the validated bearer token, role checks, audit writes      |
| Operations      | `src/lib/azure/operations.server.ts`           | status, validate, discover, sync                                                  |
| RPC wrappers    | `src/lib/azure/azure.functions.ts`             | thin `createServerFn` declarations only                                           |
| UI              | `src/routes/_authenticated/settings.azure.tsx` | bilingual, RTL-aware, read-only controls                                          |

The PAT is read from `process.env` inside handlers, never at module scope, never returned to the
browser, never written to a table and never included in an error message. Error text sent to the
client comes from a fixed dictionary keyed by an `AzureErrorCode`; provider bodies are discarded.

## Secrets

| Name                        | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `AZURE_DEVOPS_ORGANIZATION` | the `dev.azure.com/{organization}` segment                               |
| `AZURE_DEVOPS_PAT`          | read-only PAT: Work Items (Read), Project & Team (Read), Identity (Read) |

`ops_sync_connections.secret_ref` stores the _name_ `AZURE_DEVOPS_PAT`, never a value.

## Authorization

1. `requireSupabaseAuth` validates the bearer token; `context.userId` is the only accepted identity.
2. `resolveTenantContext` looks up active `core_users` rows for that auth user. Zero rows or an
   ambiguous multi-tenant match without an explicit `tenantId` is rejected as `forbidden`.
3. Roles come from `core_user_roles` scoped to the resolved tenant, with `revoked_at IS NULL`.
4. Validation, discovery and synchronization require `platform_admin` or `tenant_admin`; status is
   additionally readable by delivery managers, team leads, QA release owners and executive viewers.
5. Every operation writes an `aud_audit_events` row with outcome and non-sensitive metadata.

## Sync semantics

- **Idempotent** — every write is an upsert on the table's natural key
  (`tenant_id, organization_id, azure_project_id`, `tenant_id, project_id, azure_team_id`,
  `tenant_id, project_id, azure_iteration_id`, `tenant_id, team_id, iteration_id`,
  `tenant_id, organization_id, azure_descriptor`). Re-running changes no row counts other than
  `last_seen_at` / `last_synced_at`.
- **Single active run** — `ops_sync_locks` has a partial unique index on
  `(tenant_id, organization_id) WHERE released_at IS NULL`. A second concurrent request receives a
  `skipped` report with code `conflict` instead of duplicating work. Locks older than 30 minutes are
  released before a new lock is taken, so a crashed run cannot block the organization forever.
- **Resumable** — the run row (`ops_sync_runs`) is created before any domain work and finalized in a
  `finally` block; the full report is persisted in `details` so a later run can be compared to it.
- **Partial-safe** — each domain tracks `complete`. A domain that raised an error is reported
  incomplete and its tombstoning step is skipped, so a transient failure never deletes live rows.
- **Deletion-safe** — items absent from a _complete_ pass are tombstoned
  (`source_status = 'deleted'`, `is_deleted = true`), never hard-deleted. Memberships are closed with
  `left_at` instead of removed.
- **Throttling** — bounded concurrency (4 projects, 4 teams) and retry with `Retry-After` and
  exponential backoff on 429/502/503/504; page ceiling of 50 pages per list call.

## Run report

`SyncRunReport` is the single DTO shown in the UI and stored in `ops_sync_runs.details`: per-domain
`discovered / inserted / updated / missing / failed / complete / freshnessAt`, aggregate totals,
`partialDomains`, sanitized `error` and a `nextSafeAction`
(`none | retry_sync | fix_credentials | wait_and_retry | contact_admin`).

## Verification

- `bun run test` — 14 unit tests over the client (auth header, paging, ceiling, retry/Retry-After,
  401/403/HTML mapping, timeout, optional endpoints, concurrency limiter) and the pure sync rules.
- `bun run typecheck` — 0 errors, no `any`.
- `bun run build` — production build succeeds.
- `bun run db:test` — existing SQL suites, unchanged by this phase.

## Migration in this phase

Forward-only correction migration: drops the unused `dblink` extension, adds
`core_users.member_id` with a composite `(tenant_id, member_id)` foreign key to `core_members` so
`is_own_member_record()` no longer matches on email, and adds the active-sync-lock unique index.
