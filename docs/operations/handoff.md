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

| Area                              | ADR | Notes                                                                                         |
| --------------------------------- | --- | --------------------------------------------------------------------------------------------- |
| Dynamic states / board columns    | 013 |                                                                                               |
| Backlog + incremental sync        | 014 |                                                                                               |
| Stuck detection                   | 015 | 3 working days in an in-progress column                                                       |
| Hierarchy / bug handling          | 016 |                                                                                               |
| Revisions (history)               | 017 |                                                                                               |
| Sprint history (say/do, velocity) | 018 | Delivery page                                                                                 |
| Capacity + days off               | 019 | Team isn't filling capacity in Azure yet                                                      |
| Scheduler + daily snapshots       | 020 | Needs `MATN_CRON_SECRET` in Lovable secrets AND GitHub Actions secrets (owner action pending) |
| Delivery schedule                 | 021 | Mapping per project, forecasts, committed/baseline dates                                      |
| Export Excel/PDF                  | 022 |                                                                                               |
| Scope from Azure backlog levels   | 023 | Rule v3; verified: only User Stories are scope                                                |
| Hierarchy page `/hierarchy`       | 024 |                                                                                               |

## In progress — Phase 4a (branch `claude/determined-fermi-iqg6f2`, not yet a PR)

Committed and tested (server + rules), UI not built yet:

- `src/lib/board/board-rules.ts` + tests — `buildSprintBoard` (team's Azure board, WIP limits, card age, stuck, children roll-up, off-board items).
- `src/lib/board/board.server.ts` — `buildSprintBoardPayload(target)`, `buildStuckAcrossTeams(tenant)`.
- Server functions `getSprintBoard`, `getStuckWork` in `src/lib/workspace/workspace.functions.ts`.
- i18n keys `nav.board`, `nav.stuck`, `bd.*`, `st.*` already added.

Next steps:

1. `src/routes/board.tsx` — columns side by side (horizontal scroll), header = name, count / WIP limit (red when over), points; cards = type, #id + link, title, assignee, points, age badge (`bd.days` / `bd.daysApprox` when `ageBasis === "state_change"`), stuck reasons (`st.reason.*`), tasks x/y, open bugs, unassigned children; "off board" list below; method line `bd.method` with the threshold.
2. `src/routes/stuck.tsx` — table from `getStuckWork`: age, item, project/team/sprint, column/state, assignee, reasons; search box.
3. Add nav items in `src/components/matn/AppShell.tsx` (`/board` icon `Columns3`, `/stuck` icon `OctagonAlert` from lucide-react) — only together with the routes, or the build breaks.
4. `vite build` (regenerates `routeTree.gen.ts`), lint, typecheck, tests, prettier → PR → merge → Publish (no migration).

## Remaining roadmap

- Phase 4b: Backlog page (filters: unestimated, unassigned, old, not ready) and People page (done / in progress / not started / stuck per person, what they did yesterday from revisions, no-update alert).
- Phase 4c: Portfolio (all projects/teams/current sprints: progress, stuck, days left).
- Phase 5: daily digest and alerts.
- New requests (answers pending from the owner): Release planning vs a product folder; Scrum ceremony tracking from a meetings folder with automatic AI reports. Open questions: folder location (Drive/SharePoint), product file format, how releases are defined in Azure, meeting platform and transcripts, an AI API key as a server secret.
- Open decision: task discipline (BE/FE/QA) from tags vs Activity vs title prefix.
- Known data facts: no current sprint exists (Sprint 2 ended 17 Sep, no Sprint 3 in Azure); tasks carry no remaining hours; capacity not filled in Azure.

## Local checks

Remove `bunfig.toml` / `bun.lock` locally (do not commit), `bun install --registry https://registry.npmjs.org`, then `npx tsc --noEmit`, `npx vitest run`, `npx eslint .`, `npx prettier --check .`, `npx vite build`.
