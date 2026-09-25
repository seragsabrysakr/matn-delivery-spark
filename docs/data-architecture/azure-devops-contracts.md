# Azure DevOps Contracts and Field Mapping

No API calls, credentials or SDKs are added in this phase. Wire shapes live in `src/types/azure/*`.

## API surface (read-only, api-version 7.1)

| Domain               | Endpoint                                                                        | Incremental key                |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Organizations        | `https://app.vssps.visualstudio.com/_apis/accounts`                             | full                           |
| Projects             | `{org}/_apis/projects`                                                          | `lastUpdateTime`               |
| Project process      | `{org}/_apis/projects/{id}/properties`                                          | full                           |
| Teams                | `{org}/_apis/projects/{project}/teams`                                          | full                           |
| Team settings / area | `{org}/{project}/{team}/_apis/work/teamsettings[,/teamfieldvalues]`             | full                           |
| Iterations           | `{org}/{project}/{team}/_apis/work/teamsettings/iterations`                     | full                           |
| Capacity             | `.../iterations/{id}/capacities`, `.../teamdaysoff`                             | full per iteration             |
| Work item ids        | `{org}/{project}/_apis/wit/wiql` (`System.ChangedDate >= @cursor`)              | ChangedDate                    |
| Work items           | `{org}/_apis/wit/workitemsbatch` (200 ids/batch, `$expand=relations`)           | by id                          |
| Revisions            | `.../wit/workItems/{id}/updates`                                                | `rev`                          |
| Types & states       | `{org}/{project}/_apis/wit/workitemtypes`                                       | full, cached                   |
| Repositories         | `{org}/{project}/_apis/git/repositories`                                        | full                           |
| Pull requests        | `.../git/repositories/{repo}/pullrequests`                                      | `minTime`/`maxTime` + `$skip`  |
| PR threads           | `.../pullrequests/{id}/threads`                                                 | per PR                         |
| Pipelines            | `{org}/{project}/_apis/pipelines`, `/build/definitions`                         | full                           |
| Builds               | `{org}/{project}/_apis/build/builds?minTime=`                                   | `minTime` + continuation token |
| Build timeline       | `.../builds/{id}/timeline`                                                      | per build                      |
| Deployments          | `vsrm.dev.azure.com/{org}/{project}/_apis/release/deployments?minModifiedTime=` | modified time                  |
| Environments         | `{org}/{project}/_apis/pipelines/environments`                                  | full                           |
| Test runs            | `{org}/{project}/_apis/test/runs?minLastUpdatedDate=`                           | last updated                   |

Rules: all requests are GET; `PATCH`/`POST` (other than WIQL) are forbidden by policy in this release; requests carry `api-version`, a tenant correlation id, and honour `Retry-After`.

## Work item field mapping catalog

`KPI?` lists the KPIs that read the field. Nullability describes how a missing value is handled.

| Azure reference name                         | Internal field                  | Type         | Nullable behavior    | Process templates                      | Fallbacks                                                            | Normalization                                                                          | KPI?                                 |
| -------------------------------------------- | ------------------------------- | ------------ | -------------------- | -------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| `System.Id`                                  | `azureWorkItemId`               | integer      | never null           | all                                    | —                                                                    | stored with organization scope                                                         | all                                  |
| `System.Rev`                                 | `azureRev`                      | integer      | never null           | all                                    | —                                                                    | monotonic; drives revision gap check                                                   | history integrity                    |
| `System.Title`                               | `title`                         | string       | never null           | all                                    | —                                                                    | trimmed, max 512 chars                                                                 | drill-downs                          |
| `System.Description`                         | `description`                   | HTML string  | null when empty      | all                                    | `Microsoft.VSTS.CMMI.Symptom` (CMMI bugs)                            | sanitized HTML, never rendered raw                                                     | none                                 |
| `System.State`                               | `state` + `stateCategory`       | string       | never null           | all                                    | —                                                                    | mapped via `stateCategoryMap`; unmapped → `unknown` + DQ issue                         | most                                 |
| `System.Reason`                              | `reason`                        | string       | may be null          | all                                    | —                                                                    | verbatim                                                                               | reopened bugs                        |
| `System.WorkItemType`                        | `azureWorkItemType` + `alias`   | string       | never null           | all                                    | —                                                                    | mapped via `workItemTypeAliases`; unmapped → `custom` + DQ issue                       | most                                 |
| `System.TeamProject`                         | `projectId`                     | string       | never null           | all                                    | —                                                                    | resolved to internal project UUID                                                      | all                                  |
| `System.AreaPath`                            | `areaPath` → `teamId`           | string       | never null           | all                                    | team default area                                                    | matched to team area paths, longest prefix wins                                        | team KPIs                            |
| `System.IterationPath`                       | `iterationPath` → `iterationId` | string       | never null           | all                                    | backlog iteration                                                    | resolved to iteration node; backlog paths → no sprint scope                            | sprint KPIs                          |
| `System.AssignedTo`                          | `assignedToMemberId`            | identity     | null = unassigned    | all                                    | —                                                                    | resolved by descriptor; unresolved → `isUnknownIdentity` member                        | capacity, missing owner              |
| `System.CreatedBy`                           | `createdByMemberId`             | identity     | rarely null          | all                                    | —                                                                    | identity resolution                                                                    | lead time                            |
| `System.CreatedDate`                         | `createdAtSource`               | ISO datetime | never null           | all                                    | —                                                                    | stored UTC                                                                             | lead time, bug age                   |
| `System.ChangedBy`                           | `changedByMemberId`             | identity     | may be null          | all                                    | —                                                                    | identity resolution                                                                    | none                                 |
| `System.ChangedDate`                         | `changedAtSource`               | ISO datetime | never null           | all                                    | —                                                                    | sync watermark                                                                         | sync cursor                          |
| `System.Tags`                                | `tags[]`                        | `; ` string  | null = no tags       | all                                    | —                                                                    | split on `;`, trimmed, case preserved                                                  | blocked fallback, exclusions         |
| `System.Parent`                              | `parentAzureWorkItemId`         | integer      | null = root          | all (Basic exposes via relations only) | hierarchy relation link                                              | resolved to internal parent id; unresolved → DQ `broken_parent_relation`               | roll-up                              |
| `Microsoft.VSTS.Common.Priority`             | `priority`                      | integer 1–4  | null = unset         | Agile, Scrum, CMMI                     | Basic: null                                                          | clamped 1–4                                                                            | risk ranking                         |
| `Microsoft.VSTS.Common.Severity`             | `severity`                      | string       | null = unset         | Agile, CMMI (bugs)                     | Scrum: `Microsoft.VSTS.Common.Priority`; custom field via mapping    | "1 - Critical"→`critical`, "2 - High"→`high`, "3 - Medium"→`medium`, "4 - Low"→`watch` | critical blockers, release readiness |
| `Microsoft.VSTS.Common.ActivatedDate`        | `activatedDate`                 | ISO datetime | null before start    | Agile, Scrum, CMMI                     | first `inProgress` transition                                        | UTC                                                                                    | cycle time, flow efficiency          |
| `Microsoft.VSTS.Common.ResolvedDate`         | `resolvedDate`                  | ISO datetime | null unless resolved | Agile, CMMI                            | `stateChangeDate` at resolved                                        | UTC                                                                                    | cycle time                           |
| `Microsoft.VSTS.Common.ClosedDate`           | `closedDate`                    | ISO datetime | null unless closed   | all                                    | `stateChangeDate` at completed                                       | UTC                                                                                    | throughput, cycle time               |
| `Microsoft.VSTS.Common.StateChangeDate`      | `stateChangeDate`               | ISO datetime | may be null          | all                                    | last transition timestamp                                            | UTC                                                                                    | stuck-in-state                       |
| `Microsoft.VSTS.Scheduling.StoryPoints`      | `estimate` (points)             | number       | null = unestimated   | Agile                                  | `Effort`, `Size`, custom                                             | first non-null in `estimateFields`                                                     | scope, velocity                      |
| `Microsoft.VSTS.Scheduling.Effort`           | `estimate` (points)             | number       | null = unestimated   | Scrum, CMMI                            | `StoryPoints`                                                        | as above                                                                               | scope, velocity                      |
| `Microsoft.VSTS.Scheduling.RemainingWork`    | `remainingWork`                 | hours        | null = unset         | Agile, Scrum, CMMI                     | `OriginalEstimate - CompletedWork`                                   | ≥ 0; negative → DQ issue                                                               | capacity, burndown                   |
| `Microsoft.VSTS.Scheduling.CompletedWork`    | `completedWork`                 | hours        | null = unset         | Agile, Scrum, CMMI                     | —                                                                    | ≥ 0                                                                                    | flow efficiency                      |
| `Microsoft.VSTS.Scheduling.OriginalEstimate` | `originalEstimate`              | hours        | null = unset         | Agile, Scrum, CMMI                     | —                                                                    | ≥ 0                                                                                    | estimate drift                       |
| `Microsoft.VSTS.Common.Blocked`              | `isBlocked`                     | "Yes"/"No"   | null = not blocked   | Scrum, Agile (some)                    | `Microsoft.VSTS.CMMI.Blocked`, tag `blocked`/`معلّق`, custom boolean | truthy set {Yes, true, 1}; source recorded in `blockedSourceField`                     | blockers, blocked age                |
| `Microsoft.VSTS.CMMI.Blocked`                | `isBlocked`                     | "Yes"/"No"   | null = not blocked   | CMMI                                   | as above                                                             | same                                                                                   | blockers                             |

Basic process: only `System.*` fields plus `Microsoft.VSTS.Scheduling.*` on some types; estimate and severity resolve to `null` and dependent KPIs report `missing_source` instead of guessing.

Every field not in this catalog is preserved verbatim in `customFields` as a JSON-safe value (`JsonValue`), so custom inherited processes lose nothing and the mapping can be extended later without a re-sync.

## Process mapping concept

`ProcessMapping` (`src/types/domain/project.ts`) is a per-project (optionally per-team) configuration row containing: type aliases, state-category map, done states, active states, blocked field candidates, estimate field candidates, severity field, bug handling mode, roll-up mode and hierarchy rules.

Defaults are seeded per template and then editable:

| Template         | story alias source   | Done states                           | Estimate    | Blocked          | Bug mode       |
| ---------------- | -------------------- | ------------------------------------- | ----------- | ---------------- | -------------- |
| Agile            | User Story           | Closed, Removed                       | StoryPoints | tag/custom       | as_requirement |
| Scrum            | Product Backlog Item | Done, Removed                         | Effort      | `Common.Blocked` | as_requirement |
| CMMI             | Requirement          | Closed, Removed                       | Size/Effort | `CMMI.Blocked`   | as_task        |
| Basic            | Issue                | Done                                  | none        | tag              | as_requirement |
| Custom inherited | mapped explicitly    | from `workitemtypes` state categories | mapped      | mapped           | configured     |

State categories are seeded from the `workitemtypes` API (`Proposed/InProgress/Resolved/Completed/Removed`) so custom states inherit a sane category automatically; anything still unmapped raises `unknown_state`.
