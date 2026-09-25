# SQL test suite (Phase 3 / 3.1)

Plain SQL, no pgTAP dependency. Every suite is self-contained: it builds its own
clearly-fake fixtures (`is_demo = true`), asserts, and then either deletes the
fixtures or aborts the surrounding transaction so nothing persists.

| File                                 | Covers                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01_tenant_isolation.sql`            | cross-tenant inserts, cross-tenant scope grants, tenant re-parenting                                                                                                                                                                                                     |
| `02_project_integrity.sql`           | cross-project team iteration / KPI override / process mapping / work item / snapshot, sentinel uuid rejection                                                                                                                                                            |
| `03_roles_and_rls.sql`               | project-limited delivery manager, team-limited team lead, aggregate-only executive viewer, tenant-limited admin, self role/scope elevation, expired scope                                                                                                                |
| `04_scope_grants.sql`                | grant idempotency, expired close-and-replace, revoked replace, invalid expiry, cross-tenant grant, audit trail                                                                                                                                                           |
| `05_immutability.sql`                | revision update/delete, finalized snapshot update, audit update/delete, project re-parenting                                                                                                                                                                             |
| `06_schema_invariants.sql`           | `tenant_id NOT NULL`, missing `tenant_id` detection, RLS enabled **and forced**, no `anon` grants, no client write privileges, empty pinned `search_path`, privileged functions restricted, composite FKs, KPI catalog seeded, ambiguous helpers removed, no demo tenant |
| `07_cross_tenant_identity.sql`       | **Phase 3.1** — one `auth.uid()` in two tenants: per-tenant identity resolution, role isolation (admin in A, contributor in B), non-member tenant denial, cross-tenant grant refusal                                                                                     |
| `09_process_board_metadata.sql`      | **Phase 1a** — dynamic process and board metadata: cross-project and cross-tenant references, column type and state-mapping checks, tombstone consistency, immutable identity, natural keys, select-only client grants                                                   |
| `scripts/concurrency-grant-test.mjs` | **Phase 3.1** — genuinely parallel scope grants (suite 08)                                                                                                                                                                                                               |

## Running

```bash
npm run db:test               # SQL suites, psql, ON_ERROR_STOP=1
npm run db:test:concurrency   # suite 08, two parallel sessions
```

A suite passes when it completes without an `ERROR`. Suites that must leave no
trace end with a deliberate `RAISE EXCEPTION 'SUITE ... PASSED'`, which rolls the
transaction back — an aborting "PASSED" message is the success signal there.

Suites `03`–`07` must run with a role that can `SET ROLE authenticated` and
execute the privileged grant functions (i.e. the service role). The sandbox psql
role is intentionally weaker; those suites were executed through the managed SQL
runner.

## Concurrency test (suite 08)

`scripts/concurrency-grant-test.mjs` is the executable concurrency proof. A
single SQL session cannot contend with itself, so the script issues two truly
parallel requests — two connections, two transactions — that call
`grant_project_scope()` (then `grant_team_scope()`) with identical arguments and
asserts:

1. neither call raises an unhandled unique violation,
2. both calls return the same grant id,
3. exactly one active grant row exists afterwards.

It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment (both
are present in CI; nothing is written to the repo). Fixtures use a reserved
`ci-` slug with `is_demo = true` and are removed through
`public.purge_ci_tenant()`, which refuses any tenant that does not match that
pattern.

## Known intentional exemptions

- `ops_cron_nonces` and `aud_audit_events` allow `tenant_id IS NULL` for
  platform-level rows, so they are excluded from invariant 6.1.
- `core_tenants` and `an_kpi_definitions` have no `tenant_id` by design (the
  tenant itself, and the global KPI catalog), so they are the only allowlisted
  tables in invariant 6.8.
- The read-only authorization helpers (`has_role(tenant_id, role)`,
  `has_tenant_access`, `has_project_access`, `has_team_access`,
  `has_full_tenant_access`, `current_core_user_id(tenant_id)`,
  `can_view_member_detail`, `is_own_member_record`) are `SECURITY DEFINER` and
  executable by `authenticated` on purpose: RLS policies call them as the
  requesting user. They take the tenant explicitly, accept no other privileged
  input, and return only booleans or the caller's own identity.
- `dblink` is installed for test tooling only and is revoked from `PUBLIC`,
  `anon` and `authenticated`; no application code references it.
