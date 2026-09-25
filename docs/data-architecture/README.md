# MATN Delivery Intelligence — Data Architecture (Phase 2)

Specification only. This phase defines contracts, mappings and plans. It creates **no** database tables, migrations, API calls, credentials or UI changes.

## Documents

| Document                                              | Contents                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Domain model](./domain-model.md)                     | Entities, ownership, relationships, Mermaid ER diagrams, multi-tenant boundary, hierarchy, sprint calendar, capacity model |
| [Azure DevOps contracts](./azure-devops-contracts.md) | Read-only API surface, work-item field mapping catalog, process mapping concept                                            |
| [Database blueprint](./database-blueprint.md)         | Proposed PostgreSQL/Supabase tables, keys, indexes, retention, volumes, schema strategy                                    |
| [KPI catalog](./kpi-catalog.md)                       | 34 KPI definitions, formulas, thresholds, Sprint Confidence and Release Readiness models                                   |
| [Synchronization plan](./synchronization-plan.md)     | Initial and incremental sync, cursors, throttling, run statuses, per-domain freshness                                      |
| [Data quality](./data-quality.md)                     | Automated validation rules, severities and their effect on KPIs                                                            |
| [Security and access](./security-and-access.md)       | PAT prototype, Entra ID production model, roles and permissions matrix                                                     |
| [Implementation plan](./implementation-plan.md)       | ADR-001 … ADR-008 and Phases 3–8 with acceptance criteria, rollback, security checks, tests, open questions                |

## Code contracts

| Path                                      | Purpose                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/types/domain/*`                      | Normalized, provider-independent domain entities                                   |
| `src/types/azure/*`                       | Raw Azure DevOps wire shapes (subset consumed by the sync layer)                   |
| `src/contracts/dashboard/*`               | Response contracts for Overview, Delivery, Team, Engineering, Intelligence         |
| `src/contracts/dashboard/mock-adapter.ts` | Maps the Phase 1 mock snapshot onto `OverviewContract`; always tags `mode: "mock"` |

Conventions: no `any`; `null` for known-unavailable values; optional properties only for not-yet-loaded fields; UTC ISO 8601 timestamps; internal UUIDs separate from Azure identifiers; unmapped Azure fields preserved in a JSON-safe `customFields` record.

## Status

- Phase 1 UI: approved and untouched.
- Phase 2: this specification — awaiting review.
- Phase 3 onward: not started; see the implementation plan.
