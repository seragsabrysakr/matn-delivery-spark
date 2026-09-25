# Data Quality Rules

Rules run at the end of each sync stage and emit `DataQualityIssue` records (`src/types/domain/sync.ts`). Each issue carries severity, entity kind and id, field, bilingual explanation, first seen, last seen and resolution status; an issue auto-resolves when its condition no longer holds.

| Rule id                            | Severity | Trigger                                                    | Effect on KPIs                                                |
| ---------------------------------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `missing_project_mapping`          | critical | Work item's `System.TeamProject` has no synced project     | item excluded from all metrics                                |
| `unknown_state`                    | critical | State not in `stateCategoryMap`                            | `stateCategory = unknown`; item excluded from completion math |
| `unknown_work_item_type`           | warning  | Type not in `workItemTypeAliases`                          | alias `custom`; excluded from roll-up                         |
| `missing_estimate`                 | warning  | Committed item with no estimate                            | scope KPIs marked `partial`, coverage reported                |
| `missing_owner`                    | warning  | Active item with no assignee                               | feeds `items_without_owner` and a risk signal                 |
| `invalid_iteration_dates`          | warning  | Iteration with start or finish missing                     | Expected Completion returns `null`                            |
| `finish_before_start`              | critical | `finishDate < startDate`                                   | calendar disabled for that iteration                          |
| `duplicate_azure_id`               | critical | Same Azure id twice within one organization                | later row rejected, run marked partial                        |
| `broken_parent_relation`           | warning  | `System.Parent` points to an unsynced/deleted item         | roll-up treats the item as a root                             |
| `cross_project_child`              | info     | Child in a different project than its parent               | roll-up isolated per project, flagged in drill-down           |
| `unknown_identity`                 | warning  | Assignee descriptor cannot be resolved                     | placeholder member, capacity marked partial                   |
| `negative_capacity`                | critical | `capacityPerDay < 0` or negative available hours           | member excluded from utilization                              |
| `revision_gap`                     | warning  | `rev` sequence has holes                                   | cycle time / blocked age marked lower confidence              |
| `estimate_change_without_revision` | warning  | Current estimate differs from newest revision              | scope change events recomputed on next full pass              |
| `snapshot_gap`                     | warning  | Missing daily snapshot for a working day                   | burndown renders a break, trend confidence lowered            |
| `inconsistent_sprint_duration`     | critical | Working-day count disagrees between calendar and snapshots | sprint-day labels fall back to the calendar value             |
| `kpi_input_missing`                | warning  | A required input for a KPI is absent                       | KPI returns `null`/`partial` with reason                      |
| `partial_synchronization`          | warning  | A sync run ended `partially_completed`                     | affected domain freshness becomes `partial`                   |

Severity policy: `critical` issues block the affected KPI and surface on the Intelligence page; `warning` issues degrade confidence and appear in drill-downs; `info` issues are reporting only.

## Phase 2.1 additions

| Rule                           | Severity | Trigger                                                                      |
| ------------------------------ | -------- | ---------------------------------------------------------------------------- |
| `deletion_vs_access_ambiguous` | warning  | source item unreadable but deletion and revocation cannot be distinguished   |
| `unverified_disappearance`     | info     | item missing from a list result, awaiting direct-fetch verification          |
| `access_revoked`               | critical | `403` on a previously readable scope; sync marks the scope inaccessible      |
| `orphan_team_iteration`        | warning  | `core_team_iterations` row whose iteration node no longer exists at source   |
| `duplicate_active_scope`       | critical | two active authorization scope rows for the same user and project/team       |
| `kpi_override_conflict`        | warning  | two overlapping override rows resolve to the same level and effective window |
