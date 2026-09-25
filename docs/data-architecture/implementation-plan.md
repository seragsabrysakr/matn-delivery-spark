# Implementation Plan

Phase 2 stops at specification. Nothing below is executed until a human approves it.

## Architecture Decision Records

### ADR-001: Lovable React frontend (TanStack Start)

- **Context**: An executive command center needs bilingual RTL/LTR rendering, SSR-friendly SEO, and fast iteration with a small team.
- **Decision**: Keep the approved Phase 1 TanStack Start + React + Tailwind frontend as the single client.
- **Consequences**: One deployment target, server functions available for backend logic, no separate BFF; Phase 1 visual work is preserved unchanged.
- **Alternatives**: Power BI embedded (weak Arabic RTL and custom UX), Next.js rewrite (no benefit, loses approved work), native mobile (out of scope).

### ADR-002: Supabase PostgreSQL as the analytics store

- **Context**: We need relational integrity, time-series snapshots, row-level tenant isolation and generated types.
- **Decision**: Store all normalized, historical and calculated data in Supabase PostgreSQL with RLS.
- **Consequences**: Strong constraints and SQL-based KPI computation; volume management (partitioning) needed for revisions and KPI values.
- **Alternatives**: Direct Azure Analytics OData queries (no history control, throttling, no cross-source joins), a document store (weak relational integrity), a data warehouse (overkill for the first release).

### ADR-003: Server-side integration layer for Azure DevOps

- **Context**: PATs and OAuth tokens must never reach the browser; syncs are long-running and scheduled.
- **Decision**: Run all Azure DevOps access server-side. On this TanStack Start stack that means `createServerFn` for app-internal calls and server routes under `src/routes/api/public/*` for scheduled/cron triggers — no Supabase Edge Functions.
- **Consequences**: Secrets stay in backend configuration; workers must respect Worker runtime limits (bounded batch sizes, resumable runs).
- **Scheduling (revised in Phase 2.1)**: the trigger route is `POST`-only and authenticated with an HMAC-SHA256 signature over `timestamp.nonce.idempotencyKey.body`, with a `keyId` for rotation, a configurable clock-skew window, nonce replay rejection, per-organization rate limiting, one active sync lock per organization, a maximum execution duration with resumable batches, and audit records for accepted **and** rejected triggers. The signing secret lives only in the encrypted secret store — never in migration SQL, seeds or the database. If pg_cron cannot retrieve that secret securely on the chosen host, an **external scheduler is the preferred alternative**; the choice is deferred until the production hosting target is known. Errors never echo Azure credentials, and no client-side code references the route.
- **Alternatives**: Client-side calls (unacceptable, leaks credentials), Supabase Edge Functions (not used on this stack), a separate container service (extra operations for no current benefit).

### ADR-004: REST API before runtime MCP

- **Context**: Azure DevOps offers a stable REST surface; MCP-based agent access is attractive but immature for scheduled bulk sync.
- **Decision**: Use REST (api-version 7.1) for all synchronization in this release; revisit MCP later for interactive copilot queries only.
- **Consequences**: Predictable pagination, throttling and error handling; MCP can be added later on top of the same normalized store.
- **Alternatives**: MCP-first (unproven throughput, weaker cursor semantics), Analytics OData only (limited entities, no PR/build depth).

### ADR-005: Immutable revisions and daily snapshots

- **Context**: Trends, burndown and scope-change history cannot be reconstructed from current state alone.
- **Decision**: Persist Azure revisions as immutable rows, derive transitions and scope-change events, and write append-only daily snapshots.
- **Consequences**: Trustworthy history, larger storage, retention/partitioning required; a later sync can fill gaps but never rewrite a closed day.
- **Alternatives**: Recompute from Azure on demand (slow, throttled, lossy after edits), current-state-only (no trends).

### ADR-006: Process-template normalization through configuration

- **Context**: Agile, Scrum, CMMI, Basic and custom inherited processes name types, states and estimate fields differently.
- **Decision**: Normalize through a per-project `ProcessMapping` record; preserve unmapped fields in a JSON-safe `customFields` bag.
- **Consequences**: New customers onboard by configuration, not code; mapping quality becomes a data-quality concern with explicit `unknown_*` issues.
- **Alternatives**: Hardcoding one template (breaks the second tenant), per-customer code branches (unmaintainable).

### ADR-007: Transparent, versioned KPI calculations

- **Context**: Executives must trust and challenge every number; formulas will evolve.
- **Decision**: Every KPI has a documented formula, configurable thresholds and a `calculationVersion` stored with each value; Sprint Confidence and Release Readiness expose their components and gates.
- **Consequences**: Historical values remain explainable across formula changes; slightly larger payloads and more catalog maintenance.
- **Alternatives**: Opaque AI score (rejected — unauditable), hardcoded thresholds (rejected — not tenant-specific).

### ADR-008: Read-only integration for the first release

- **Context**: Write-back to Azure DevOps carries real operational risk and demands full audit and permission handling.
- **Decision**: The first release is strictly read-only; write intents are modeled (`WriteBackIntent`) but not implemented.
- **Consequences**: Zero risk of corrupting customer work items; recommendations remain advisory; write-back becomes a separate, gated project.
- **Alternatives**: Immediate write-back (rejected), agent-driven changes (rejected — no confirmation, audit or verification path yet).

### ADR-009: Phase 2.1 architecture corrections

- **Context**: Review of the Phase 2 specification found five structural gaps: tenant foreign keys were declared composite without candidate keys, iterations conflated the Azure node with team configuration, project/team-limited roles had no storage, the scheduler's secret custody was unspecified, and source deletion was indistinguishable from lost access.
- **Decision**:
  1. **Composite tenant integrity** — every tenant-owned parent declares `UNIQUE (tenant_id, id)`; every tenant-owned child references `(tenant_id, parent_id)`. Cross-tenant rows fail on a foreign key, before RLS. A CI invariant test asserts each composite FK has a matching candidate key.
  2. **Team-iteration separation** — `core_iterations` stores one Azure node per project; `core_team_iterations` stores each team's subscription plus time zone, working weekdays, days off, `isCurrent` and `selectedForSync`. Calendars, capacity, iteration snapshots and iteration-scoped KPI values key on `teamIterationId`.
  3. **Authorization scopes** — `core_user_project_scopes` and `core_user_team_scopes` with `grantedByUserId`, `grantedAt`, `expiresAt`, `revokedAt`, active-only partial unique indexes, resolved by security-definer functions. Frontend filters are never an authorization mechanism.
  4. **Secure scheduler boundary** — signed, replay-protected, rate-limited `POST` trigger with secret-store custody, sync locks and full audit; scheduler technology deferred pending the hosting target.
  5. **Source deletion semantics** — `SourceTracked` lifecycle columns; `404` tombstones only after a second verification, `403` means access revoked; revisions, snapshots and audit history are never deleted; KPIs exclude tombstoned items forward from the effective date; ambiguity raises a data-quality issue.
- **Consequences**: More constraints and one extra join for team-scoped iteration data; in exchange, cross-tenant contamination becomes structurally impossible, multi-team sprints stop duplicating nodes, least-privilege access is representable, and history stays trustworthy through deletions and permission loss.
- **Alternatives**: Rely on RLS alone (rejected — a service-role bug bypasses it), keep per-team iteration duplicates (rejected — divergent dates), roles without scope tables (rejected — cannot express Delivery Manager or Read-only Viewer), unauthenticated cron route behind an obscure path (rejected).

### ADR-010: Same-project structural integrity and canonical team-sprint reference

- **Context**: Phase 2.1 made cross-_tenant_ rows impossible, but inside one tenant a team from project A could still be paired with an iteration from project B. Separately, several contracts still selected `teamId` and `iterationId` independently, allowing pairs with no corresponding `TeamIteration`. The KPI override uniqueness relied on a COALESCE sentinel uuid, and the active-grant index treated an expired row as active.
- **Decision**:
  1. **Canonical reference** — `teamIterationId` is the only persisted team-sprint relationship across capacity, load, all daily snapshots, KPI values, risk signals and recommendations. `teamId` / `iterationId` survive only as documented derived convenience values.
  2. **Project-composite keys** — `core_teams` and `core_iterations` gain `UNIQUE (tenant_id, project_id, id)`; `core_team_iterations` carries an immutable `project_id` and references both parents through it, so a cross-project pair fails with `23503`. Project-scoped children follow the same pattern; KPI overrides and process mappings add `CHECK (team_id IS NULL OR project_id IS NOT NULL)` plus the project-composite team FK.
  3. **No sentinel uniqueness for overrides** — three explicit partial unique indexes replace the COALESCE sentinel; where a sentinel remains (generated `scope_hash` columns) it is documented and guarded by `CHECK (id <> '00000000-0000-0000-0000-000000000000')` on every table that could produce a real id.
  4. **Grant lifecycle** — one active predicate everywhere, plus idempotent security-definer grant functions that lock, close expired rows, return existing active grants, insert, and audit.
- **Consequences**: One extra column and one extra index per project-scoped child, and a mandatory `TeamIteration` lookup before any sprint-scoped write; in exchange, invalid cross-project relationships are rejected by PostgreSQL rather than by application code or RLS, and expiring grants behave consistently without a cleanup job.
- **Alternatives**: Application-level validation (rejected — bypassable by sync workers and service-role code), triggers (rejected — heavier and still procedural), RLS-only enforcement (rejected — service-role paths bypass it), a `now()`-aware unique index (impossible — index predicates must be immutable).

### ADR-011: Tenant-scoped identity and explicit demo lifecycle (Phase 3.1)

- **Context**: The applied Phase 3 helpers resolved identity from `auth.uid()` alone. `current_core_user_id()`, `current_tenant_id()`, `has_role(role)` and `is_platform_admin()` each picked an arbitrary `core_users` row when one auth account belonged to more than one tenant, so a role held in tenant A satisfied a policy evaluated on a tenant B row. Migration 14 also seeded a demo tenant unconditionally as part of the production migration chain.
- **Decision**:
  1. **Tenant-scoped identity** — identity resolution always takes the row's tenant as an argument: `current_core_user_id(target_tenant_id)`, `has_role(target_tenant_id, target_role)`, `is_tenant_platform_admin(target_tenant_id)`. `current_tenant_id()` and the zero/one-argument variants are dropped, not deprecated in place, so no policy can accidentally keep using them. Every RLS policy passes the row's own `tenant_id`.
  2. **Model B for `platform_admin`** — platform administration remains a _tenant-scoped_ role rather than a global superuser. Cross-tenant administration is an out-of-band service-role operation, so no single browser session can ever read two tenants.
  3. **Multi-tenant membership is legal** — the global unique index on `core_users.auth_user_id` is replaced by `UNIQUE (tenant_id, auth_user_id)`. Isolation is now enforced by the tenant argument, not by forbidding the situation.
  4. **Read-only client roles** — `authenticated` holds `SELECT` only on prefixed tables, and RLS is `ENABLE`d _and_ `FORCE`d everywhere. All writes go through audited security-definer functions or the service role.
  5. **Member-detail authorization** — `can_view_member_detail()` grants detail to management roles with team access; `is_own_member_record()` additionally lets a contributor read their own member row and utilization. Executive viewers stay aggregate-only.
  6. **Explicit demo lifecycle** — no migration seeds data. `seed_demo_tenant()` / `remove_demo_tenant()` remain service-role-only development operations; removal matches on the deterministic demo id, slug and `is_demo = true`. `purge_ci_tenant()` cleans automated-test fixtures under the reserved `ci-` slug prefix.
- **Consequences**: Every policy is one argument longer and helper results are no longer cacheable per session; in exchange dual-tenant membership is safe by construction, and a fresh production database contains no fabricated rows. `dblink` is installed for the test harness only and is revoked from `PUBLIC`, `anon` and `authenticated`.
- **Alternatives**: Keep a session-level "current tenant" GUC (rejected — client-settable and easily forgotten in a policy), forbid multi-tenant auth accounts with a global unique index (rejected — a legitimate consultant/partner case, and the constraint hid the bug rather than fixing it), global `platform_admin` (rejected — one compromised session would expose every tenant).

### ADR-012: Read-only Azure DevOps foundation sync on the app server (Phase 4 / 5A)

- **Context**: The first live integration must read organizations, projects, teams, iterations, members and memberships from Azure DevOps without exposing the credential, without duplicating work under concurrent operators, and without deleting real rows when the provider is briefly unavailable.
- **Decision**:
  1. **App-server only** — synchronization runs in TanStack `createServerFn` handlers (`src/lib/azure/*`), not in a database function and not in an edge function. The PAT is read from `process.env` inside handlers; `ops_sync_connections.secret_ref` stores the secret's _name_.
  2. **GET-only client** — one typed client, `api-version=7.1`, continuation-token paging with a hard page ceiling, bounded concurrency, and retry that honours `Retry-After`. Errors are mapped to a closed `AzureErrorCode` set with fixed user-facing text; provider bodies never reach the browser.
  3. **Identity from the token** — the tenant is resolved from `auth.uid()` through `core_users`; an ambiguous multi-tenant match without an explicit tenant is `forbidden`. Sync requires `platform_admin` or `tenant_admin`; every operation is audited.
  4. **One active run per organization** — enforced structurally by a partial unique index on `ops_sync_locks (tenant_id, organization_id) WHERE released_at IS NULL`, with a 30-minute lock reclaim. A losing caller gets a `skipped` report, never a duplicate run.
  5. **Partial over silent** — per-domain completeness is reported; an incomplete domain skips tombstoning, and missing items are tombstoned (`source_status = 'deleted'`) rather than deleted. Memberships are closed with `left_at`.
  6. **`core_users.member_id`** — the "this is me" check uses an explicit composite foreign key to `core_members (tenant_id, id)` instead of matching on email.
- **Consequences**: A failed or throttled provider degrades to a partial, retryable run with an explicit next safe action, and history is never destroyed. The dashboards stay in mock mode until the foundation is verified against a real organization.
- **Alternatives**: `pg_cron` + `pg_net` calling Azure directly (rejected — credential in the database and no typed error handling), advisory locks (rejected — invisible to operators and lost on connection churn), hard deletes on missing items (rejected — a 403 is revoked access, not deletion).

### ADR-013: Dynamic Azure process and board metadata (Phase 1a)

- **Context**: State categories came from a hardcoded English dictionary (`DEFAULT_STATE_CATEGORY`), so any custom state (e.g. "Ready for QA", "Waiting Client") became `unknown` or was misclassified, and the Overview funnel was six fixed stages derived from state names (`state.includes("test")`). Every team configures its own states, board columns and work item types in Azure; none of that may be assumed in code.
- **Decision**:
  1. **Process metadata is synchronized, not coded** — per project, `GET _apis/wit/workitemtypes` (states inlined; `GET _apis/wit/workitemtypes/{type}/states` when not) is persisted to `az_work_item_types` and `az_work_item_type_states`, keeping Azure's raw state `category` (`Proposed`/`InProgress`/`Resolved`/`Completed`/`Removed`), color and order. An unexpected category maps to `unknown`, never to a guess.
  2. **Board metadata is synchronized per team** — `GET {project}/{team}/_apis/work/boards` and `/boards/{id}/columns` are persisted to `az_team_boards` and `az_board_columns` with Azure's column order, `columnType`, `itemLimit`, `isSplit` and `stateMappings` verbatim.
  3. **State category precedence** — explicit tenant configuration (`core_process_mappings`) → synchronized Azure metadata (type + state, then state alone only when every type agrees) → the old dictionary as a last resort. A last-resort or unresolved state raises an idempotent `ops_data_quality_issues` row (`state_category_fallback` / `state_category_unknown`) naming the type and state.
  4. **Board placement on work items** — `System.BoardColumn`, `System.BoardColumnDone` and `System.BoardLane` are read with every work item. `board_column_entered_at` is stamped with the item's `ChangedDate` when its column differs from the previous sync, kept while unchanged, and `null` on first sighting, including items synced before the column existed (never guessed; revisions will backfill it).
  5. **The funnel is the team's board** — one stage per Azure column, in Azure order, named as in Azure, on the board that holds most of the sprint's items. Items not on that board (e.g. tasks) are not counted. Items are placed by their synced column, else by the column mapped to their state. No board metadata means no funnel and an explicit `board_not_synchronized` reason, not a fabricated stage list.
  6. **Freshness without a scheduler** — metadata older than 6 hours is refreshed at the start of a work item sync. A metadata failure never fails the sync; it degrades to the fallback path, which is itself reported.
  7. **Same guarantees as the foundation** — GET only, natural-key upserts, tombstones only after a complete pass, composite tenant/project FKs, RLS enabled and forced, `authenticated` SELECT only (project scope for process metadata, team scope for boards).
- **Consequences**: Custom processes work without configuration or code changes; the funnel matches what each team sees in Azure. A few extra GETs per sync (bounded by the 6-hour freshness window), and four small tables. Until revisions are ingested, time-in-column is known only for moves observed between syncs.
- **Alternatives**: Extend the English dictionary (rejected — still hardcoded and wrong for localized or custom processes), require tenants to map every state by hand (rejected — Azure already knows the category), keep fixed funnel stages (rejected — does not reflect any real team's board).

### ADR-014: Project backlog and incremental work item sync (Phase 1b)

- **Context**: Only items under the current iteration were synchronized (`buildIterationWiql`), so the real backlog was invisible, and every sync re-read everything.
- **Decision**:
  1. **Backlog scope comes from Azure** — each team's areas are read from `GET {project}/{team}/_apis/work/teamsettings/teamfieldvalues` at sync time, honouring `includeChildren`; a team keyed on a non-area team field is skipped with a warning, and the synced `core_teams.area_paths` is only a flagged fallback. The backlog is every item in those areas, of the mapping's work item types that exist in the project, whose state is open, regardless of iteration.
  2. **"Open" is per type, from synced metadata** — the full query is `(type = T AND state IN (open states of T)) OR …`, where open means any state whose Azure category is not Completed/Removed (unknown counts as open). Types without synced states are skipped and make the run `partial`; nothing falls back to state names in code.
  3. **Incremental by watermark** — the per-project watermark lives in `ops_sync_cursors` (`entity_kind = 'work_items_backlog'`): `watermark_at` is the latest `System.ChangedDate` stored; `watermark_token` carries the last full reconcile instant. Later runs query `[System.ChangedDate] > watermark − 5 min` (`timePrecision=true`) with no state filter, so closures are seen too. The watermark only moves after a failure-free, untruncated run and never moves backwards.
  4. **Daily full reconcile** — the first run and any run 24 h after the last full one is full: after reading the open items, every stored open item of the project that Azure did not return is re-read by id (`errorPolicy: Omit`), so items that moved out of scope, closed or were deleted are corrected. Ids Azure no longer returns are counted as unavailable, never deleted (ADR-009).
  5. **Placement** — the owning team is the most specific matching team area (ties keep the current owner, else the lowest id); the iteration is resolved from `System.IterationPath`. `classifyPlacement` derives `in_sprint` / `in_backlog` / `closed` at read time instead of persisting a flag that goes stale when sprints roll over.
  6. **Visible limits** — the same 5,000-item ceiling as the sprint sync (`$top = ceiling + 1` detects overflow); a truncated run is `partial`, skips the reconcile and keeps the old watermark.
  7. **Shared persistence** — sprint and backlog syncs write through one `persistWorkItemBatch`, so blocked-since, board-column entry and state-category gap reporting behave identically.
- **Consequences**: The backlog and future sprints are available for the upcoming Backlog/People/Stuck pages; repeat syncs read only what changed. Items that leave a team's areas between full reconciles are corrected within a day. No schema change was needed.
- **Alternatives**: One query per team (rejected — shared areas would be read twice and ownership would flip), a persisted `in_backlog` flag (rejected — wrong as soon as a sprint rolls over), relying on `State NOT IN ('Closed','Removed')` (rejected — hardcoded names, ADR-013).

## Phase 3 — Database foundation

- **Inputs**: approved `database-blueprint.md`, `domain-model.md`, `security-and-access.md`.
- **Tasks**: enable the backend connection; author migrations per table group (core → azure → analytics → intelligence → operations → audit); add GRANTs, enable RLS and write tenant-scoped policies plus `core_user_roles` + `has_role()`; add non-production seed data for one demo tenant; regenerate types.
- **Outputs**: reviewed migrations, generated `Database` types, seeded demo tenant, RLS policy matrix.
- **Acceptance**: every public table has GRANT + RLS + at least one policy; no table stores roles on a profile; cross-tenant read attempt returns zero rows in tests; types compile.
- **Rollback**: migrations are additive and reversible per group; drop the newest group and restore generated types.
- **Security checks**: linter clean; no `anon` grants on tenant tables; immutable tables deny UPDATE/DELETE except `service_role`.
- **Tests**: policy tests per role, uniqueness/constraint tests, seed integrity test, **cross-tenant insert tests that expect `23503` foreign-key violations (not merely empty RLS results)**, schema invariant tests asserting every composite FK has a matching candidate key and that no project-scoped child references a team or iteration without `project_id`, cross-project insert tests expecting `23503`, and the authorization grant matrix (active duplicate, expired replacement, revoked replacement, concurrent grants, access immediately after expiry), and scope-resolution tests for project/team-limited roles.

## Phase 4 — Azure DevOps connection (read-only)

- **Inputs**: customer-supplied read-only PAT, organization name, target projects.
- **Tasks**: store the PAT as a backend secret; implement the read-only HTTP client with a GET/WIQL allowlist, retry, backoff and throttling; connection verification call; sync organizations, projects, teams and iterations; persist `SyncConnection` and first `SyncRun`.
- **Outputs**: verified connection, populated core tables, first sync run log.
- **Acceptance**: connection test returns projects; teams and iterations match Azure; no credential appears in logs, responses or the client bundle; a revoked PAT disables the connection with an audit event.
- **Rollback**: disable the connection, delete synced core rows for that organization, revoke the PAT.
- **Security checks**: secret never in the database or `VITE_*`; write verbs rejected by the client; audit events recorded.
- **Tests**: mocked-transport unit tests for retry/backoff, allowlist tests, mapping tests against recorded fixtures.

## Phase 5 — Work items and revisions

- **Inputs**: Phase 4 connection, process templates per project.
- **Tasks**: seed `ProcessMapping` per template; WIQL + batch fetch with ChangedDate cursor; normalize fields per the mapping catalog; ingest revisions/updates; derive transitions, scope changes and blocked history; hierarchy resolution and roll-up mode; data-quality rules for states, types, estimates and parents.
- **Outputs**: populated work items, revisions, transitions, scope-change events, first data-quality report.
- **Acceptance**: item counts match Azure queries within tolerance; no duplicate Azure ids; re-running the sync changes no history rows; unmapped states/types raise issues rather than silent defaults.
- **Rollback**: truncate work-item domain tables for the affected project and reset cursors.
- **Security checks**: tenant binding verified per write; descriptions sanitized.
- **Tests**: fixture-based mapper tests per template (Agile/Scrum/CMMI/Basic/custom), idempotency test, roll-up double-count test.

## Phase 6 — Capacity, pull requests, builds, deployments, tests

- **Inputs**: Phase 5 data, repository/pipeline inventory.
- **Tasks**: sync capacity and days off; repositories, PRs, reviewers and threads (first meaningful review detection); pipelines, builds and timelines; environments, deployments, approvals and retries; test runs and result summaries; per-domain freshness tracking.
- **Outputs**: complete engineering dataset with per-domain freshness.
- **Acceptance**: PR review times are plausible against a manual sample; partially succeeded and canceled builds are classified correctly; freshness is reported per domain, never as one global claim.
- **Rollback**: truncate engineering tables, reset those cursors only.
- **Security checks**: no source code or diffs stored; only metadata.
- **Tests**: meaningful-review unit tests (bot/system/author exclusions), build classification tests, stale-PR policy tests.

## Phase 7 — Snapshots and KPI engine

- **Inputs**: Phases 5–6 data, `kpi-catalog.md`.
- **Tasks**: daily snapshot jobs per project/iteration/team/member; KPI engine with configurable thresholds and `calculationVersion`; Sprint Confidence components and Release Readiness gates; deterministic risk rules; evidence-based recommendations; freshness and sync-health KPIs.
- **Outputs**: `an_kpi_values`, snapshots, risk signals, recommendations.
- **Acceptance**: every Overview KPI resolves to a documented formula; missing inputs return `null`/partial with a reason instead of zero; confidence weights sum to 100% after renormalization; snapshots are never rewritten.
- **Rollback**: KPI values and signals are recomputable; delete by `calculationVersion` and recompute.
- **Security checks**: AI outputs are labeled `ai_generated` and never write to Azure.
- **Tests**: golden-file tests per KPI, renormalization tests, cap-rule tests for readiness.

## Phase 8 — Connect the Overview page to live data

- **Inputs**: Phase 7 outputs, `src/contracts/dashboard/*`.
- **Tasks**: implement server functions returning `OverviewContract`; swap the mock adapter behind an explicit mode flag; wire partial/empty/stale/unavailable section states to the existing UI states; keep the dev-only state preview.
- **Outputs**: live Overview page, mock mode retained for demos.
- **Acceptance**: no visual change to the approved design; every section degrades gracefully; mock and live data are never mixed in one payload; contract `mode` is always explicit.
- **Rollback**: flip the mode flag back to mock; the UI keeps working.
- **Security checks**: all data access is tenant-scoped server-side; no secrets in loader data.
- **Tests**: contract shape tests, section-availability tests, visual regression against Phase 1 screenshots.

## Open questions requiring human approval

1. Which Azure DevOps organization(s) and projects are in scope for the first connection?
2. Process template per project, and the preferred roll-up mode (story points at story level vs task hours)?
3. Are bugs part of committed scope (`as_requirement`) or overhead (`as_task`)?
4. Deployment model: per-user delegated OAuth or a service-principal integration identity?
5. Approved threshold values per KPI, or accept the proposed defaults for the first release?
6. Retention: is 3 years of revisions and snapshots acceptable, or is a shorter window required?
7. Which release gates apply, and who signs business acceptance?
8. Working week and holiday calendar per team (default Sun–Thu, `Africa/Cairo`)?
9. Production hosting target, which decides whether pg_cron or an external scheduler holds the HMAC signing key.
10. Snapshot local run time per tenant (default `00:05`) and the automatic backfill window (default 14 days).
11. Confirmation of the retention defaults and of who may declare a legal hold.
12. Which roles may grant project/team scopes, and the default expiry for a temporary grant.
