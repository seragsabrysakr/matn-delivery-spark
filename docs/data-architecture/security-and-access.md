# Security and Access Architecture

Nothing in this phase requests, stores or references a real credential. No secret placeholders contain real values.

## Development prototype (Phase 4)

- Credential: a **read-only Azure DevOps Personal Access Token**, created by the customer.
- Minimum scopes: `Work Items (Read)`, `Project and Team (Read)`, `Code (Read)`, `Build (Read)`, `Release (Read)`, `Test Management (Read)`, `Identity (Read)`, `Graph (Read)`. No write, no manage, no full access.
- Storage: backend secret only, referenced by name (`SyncConnection.secretRef`). Never in the database, never in `VITE_*`, never in the client bundle, never in logs or error messages.
- Access: only server-side sync code reads it; browser code has no path to it.
- Lifetime: maximum 90 days, calendar reminder for rotation, revocable instantly from Azure DevOps user settings; revocation is detected as a 401 and disables the connection with an audit event.
- Scope of use: GET requests plus WIQL POST for querying only; write verbs are rejected by an allowlist in the HTTP client.

## Production

- Identity: **Microsoft Entra ID OAuth 2.0** against Azure DevOps (`499b84ac-1321-427f-aa17-267ca6975798/.default`), authorization code with PKCE for per-user access, or a service principal / managed identity for tenant-wide background sync.
- Deployment models: _per-user delegated_ (each viewer sees only what they can see in Azure DevOps) or _service principal_ (one read-only integration identity, MATN enforces visibility). The model is a per-tenant setting on `SyncConnection.authMode`.
- Tokens: short-lived access tokens held in memory for the request; refresh tokens encrypted at rest in the secret store, bound to tenant and connection, rotated on use, revoked on disconnect.
- Tenant isolation: every token is bound to one `(tenantId, organizationId)`; the sync worker refuses to write rows whose tenant differs from the run's tenant.
- Authorization: role-based, evaluated server-side; the client never asserts its own role.
- Auditing: connection created/verified/disabled, token refresh failures, role changes, recommendation decisions, and any future write-back are recorded in `aud_audit_events`.
- Rotation: secrets rotate on a schedule and on personnel change; rotation is a config update with no code change because only `secretRef` is stored.

## Application roles and permissions

| Role               | Scope          | Read dashboards | Drill into work items | Manage connections | Configure thresholds/process mapping | Decide recommendations | Manage users/roles | View audit |
| ------------------ | -------------- | --------------- | --------------------- | ------------------ | ------------------------------------ | ---------------------- | ------------------ | ---------- |
| Platform Admin     | all tenants    | yes             | yes                   | yes                | yes                                  | no                     | yes                | yes        |
| Tenant Admin       | one tenant     | yes             | yes                   | yes                | yes                                  | yes                    | yes                | yes        |
| Executive Viewer   | tenant         | yes (aggregate) | limited               | no                 | no                                   | no                     | no                 | no         |
| Delivery Manager   | projects       | yes             | yes                   | no                 | yes (thresholds)                     | yes                    | no                 | no         |
| Team Lead          | own teams      | yes (own teams) | yes                   | no                 | no                                   | yes (own teams)        | no                 | no         |
| Contributor        | own teams      | yes (own teams) | yes                   | no                 | no                                   | no                     | no                 | no         |
| QA & Release Owner | projects       | yes             | yes                   | no                 | yes (release gates)                  | yes (quality)          | no                 | no         |
| Read-only Viewer   | assigned scope | yes             | read-only             | no                 | no                                   | no                     | no                 | no         |

Notes: Executive Viewer sees aggregates and named risks but not individual member utilization detail; per-person metrics are visible to Delivery Manager, Team Lead (own team) and the member themself. No role exposes secrets or the service role key.

### Scope resolution (Phase 2.1)

Roles alone are not sufficient: project- and team-limited roles resolve through the explicit scope tables `core_user_project_scopes` and `core_user_team_scopes`.

| Role               | Resolution                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Platform Admin     | platform-wide; not bound to one tenant; audited on every access                           |
| Tenant Admin       | full access inside one `tenant_id`; no scope rows needed                                  |
| Executive Viewer   | tenant-wide **aggregates only** — per-member rows are filtered out server-side            |
| Delivery Manager   | union of active rows in `core_user_project_scopes`                                        |
| Team Lead          | union of active rows in `core_user_team_scopes`                                           |
| Contributor        | union of active rows in `core_user_team_scopes`                                           |
| QA & Release Owner | union of active rows in `core_user_project_scopes`                                        |
| Read-only Viewer   | strictly the explicitly assigned project **and** team scope rows; no implicit inheritance |

A scope row is _active_ when `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`. This predicate is mandatory in **every** authorization query; `revoked_at IS NULL` alone is never sufficient, because an expired row keeps `revoked_at NULL` until it is closed.

Lifecycle (implemented by the proposed `grant_project_scope` / `grant_team_scope` security-definer functions, see database-blueprint.md):

1. Take an advisory transaction lock on `(user, target)` so concurrent grants serialize.
2. Close expired-but-open rows in the same transaction (`revoked_at = now()`).
3. If an active grant already exists, return it — no second row, no error.
4. Otherwise insert the new grant.
5. Write an audit event for every outcome, keyed by the caller's idempotency key.

The partial unique index stays on `revoked_at IS NULL`; correctness comes from closing expired rows before replacement rather than from widening the index (which cannot reference `now()`, being non-immutable). Access is denied the instant `expires_at` passes, with no dependency on a cleanup job.

Authorization scopes also inherit the structural project rules: a team scope references a team that belongs to exactly one project, so a grant can never straddle projects.

Phase 3 implements this with security-definer functions, all `STABLE` and `SET search_path = public`:

- `public.has_role(_user_id uuid, _role app_role) returns boolean`
- `public.has_project_access(_user_id uuid, _project_id uuid) returns boolean`
- `public.has_team_access(_user_id uuid, _team_id uuid) returns boolean`

Every RLS policy is `tenant_id = current_tenant() AND (has_role(auth.uid(),'tenant_admin') OR has_project_access(auth.uid(), project_id) OR has_team_access(auth.uid(), team_id))`, shaped per table. Authorization is **never** derived from client-supplied filters, query parameters, or the selected workspace in the UI; the frontend selector only narrows what the server already permits.

RLS is **not implemented in this phase** — the section above is the specification Phase 3 translates into policies.

## Secure scheduled synchronization

The cron trigger route is a security boundary, not a convenience endpoint:

- `POST` only; `GET`/`HEAD` return `405`.
- Body carries `timestamp`, `nonce`, `idempotencyKey`, `tenantId`, `organizationId`, `scope`, `logicalDate`, `keyId`.
- Signed with `HMAC-SHA256` over `timestamp.nonce.idempotencyKey.body`, compared in constant time.
- Signing secret lives only in the encrypted secret store, referenced by `keyId`; it never appears in migration SQL, seed data, the database, logs, or client code.
- Requests outside the configurable clock-skew window (default ±300s) are rejected.
- Nonces are stored for 7 days; a reused nonce or a reused idempotency key is rejected.
- Rate-limited per organization; all accepted and rejected triggers are audited with the rejection reason.
- Errors return an opaque code — never Azure credentials, tokens, URLs with tokens, or upstream response bodies.
- No client-side code references the route, and it is never exposed in the app's navigation or bundle.

## Data protection

- No Azure DevOps write operations in this release; the HTTP client allowlists GET (plus WIQL POST).
- Descriptions and titles may contain customer content: they are stored, never sent to third parties except the configured AI gateway, and only with tenant consent.
- AI never modifies Azure DevOps. Any future write requires user confirmation, a permission check, an audit event, an idempotency key and post-write verification (`WriteBackIntent`).
- PII minimisation: only display name, unique name, email and avatar URL are stored for identities; no HR or performance data.
