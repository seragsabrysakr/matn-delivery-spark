# MATN Delivery Intelligence — handoff (2026-09-27)

Paste this file (or point to it) at the start of any new Claude Code session.

## Rules (non-negotiable)

- Reply to the owner in Egyptian Arabic; technical terms in English.
- Everything dynamic from Azure DevOps (single source of truth). Nothing about states, board columns, work item types or scope may be hardcoded.
- Azure is READ-ONLY: GET, plus POST only to the allowlisted `wiql` and `workItemsBatch`.
- Tenant isolation: `UNIQUE (tenant_id, id)`, composite FKs, RLS ENABLE + FORCE on every new table, clients SELECT only, writes via service role.
- Secrets only server-side (`process.env`), never in the DB, never `VITE_*`. Never ask the owner to paste a token/secret in chat.
- Tombstones, never hard deletes. History and snapshots immutable. Missing data → `null` + reason, never a fake 0.
- Calendar: Sun–Thu, Africa/Cairo. Every pure rule gets unit tests; every schema change is a forward migration.
- Do not commit `bun.lock` / `bunfig.toml`. Never push to `main`; never force-push (Lovable sync).
- Production DB changes need the owner's explicit approval each time.

## Release runbook

`docs/operations/release-runbook.md`: apply migration (Lovable `query_database`, record in `supabase_migrations.schema_migrations`) → merge PR → confirm Lovable has the code (`read_file`) → Publish (`deploy_project`) → owner hard-refreshes and syncs. A sync right after Publish can still hit the old deployment: check a new UI element is visible before syncing.

## Done (ADR numbers in `docs/data-architecture/implementation-plan.md`)

| Area                                 | ADR | Notes                                                                                         |
| ------------------------------------ | --- | --------------------------------------------------------------------------------------------- |
| Dynamic states / board columns       | 013 |                                                                                               |
| Backlog + incremental sync           | 014 |                                                                                               |
| Stuck detection                      | 015 | 3 working days in an in-progress column                                                       |
| Hierarchy / bug handling             | 016 |                                                                                               |
| Revisions (history)                  | 017 |                                                                                               |
| Sprint history (say/do, velocity)    | 018 | Delivery page                                                                                 |
| Capacity + days off                  | 019 | Team isn't filling capacity in Azure yet                                                      |
| Scheduler + daily snapshots          | 020 | Needs `MATN_CRON_SECRET` in Lovable secrets AND GitHub Actions secrets (owner action pending) |
| Delivery schedule                    | 021 | Mapping per project, forecasts, committed/baseline dates                                      |
| Export Excel/PDF                     | 022 |                                                                                               |
| Scope from Azure backlog levels      | 023 | Rule v3; verified: only User Stories are scope                                                |
| Hierarchy page `/hierarchy`          | 024 |                                                                                               |
| Sprint board `/board`, `/stuck`      | 025 | Published 2026-09-27                                                                          |
| Backlog `/backlog`, People `/people` | 026 | Published 2026-09-27                                                                          |
| Overview rebuild (stories vs tasks)  | 027 | Published 2026-09-27                                                                          |

## In progress — Overview command center (branch `claude/determined-fermi-iqg6f2`, PR open)

ADR-028. Phase 4b (Backlog, People) and ADR-027 were published 2026-09-27.

- Rule: current sprint = the team's latest started sprint; past its finish with no later sprint started it is **overdue** ("late"), for up to 30 days (`OVERDUE_LIMIT_DAYS`), then **inactive**. `sprintPhase` / `pickScheduledSprints` in `src/lib/scheduler/scheduler-rules.ts`; used by the scheduler, `/stuck`, the sprint selector default and the Overview.
- Overview (real mode): command header + portfolio cards (`getPortfolio`, `src/lib/portfolio/`), selected sprint status, needs attention (+ people not updating), delivery trend (say/do), deliverables, data health. Confidence, trajectory, KPI grid, risks, actions, funnel, team load, engineering removed from the live Overview.
- Team load counts hours only (was adding story points as hours).
- Design checked in a local preview with numbers shaped like the real data; not yet seen by the owner on real data.

Next steps: merge PR → confirm Lovable has the code → Publish (no migration) → owner checks the Overview.

## Remaining roadmap

- Phase 4c: portfolio started on the Overview (ADR-028); a dedicated portfolio page with deliverables per project remains.
- Phase 5: daily digest and alerts.
- New requests (answers pending from the owner): Release planning vs a product folder; Scrum ceremony tracking from a meetings folder with automatic AI reports. Open questions: folder location (Drive/SharePoint), product file format, how releases are defined in Azure, meeting platform and transcripts, an AI API key as a server secret.
- Open decision: task discipline (BE/FE/QA) from tags vs Activity vs title prefix.
- Known data facts: Hoteliana Sprint 2 (due 17 Sep) is still the current sprint, late, because no Sprint 3 exists in Azure; Hoteliana Sprint 2: all 19 stories still New while 62/120 tasks closed (team does not move stories); tasks carry no remaining hours; capacity not filled in Azure.

## Local checks

Remove `bunfig.toml` / `bun.lock` locally (do not commit), `bun install --registry https://registry.npmjs.org`, then `npx tsc --noEmit`, `npx vitest run`, `npx eslint .`, `npx prettier --check .`, `npx vite build`.
