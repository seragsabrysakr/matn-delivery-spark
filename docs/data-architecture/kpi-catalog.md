# KPI Catalog

Every KPI is defined as data. Since Phase 2.1 the catalog is split in two:

- `an_kpi_definitions` (`KpiDefinition`) — **global and immutable per version**: `kpiId` unique globally, Arabic and English names, formula, required inputs, default display format, default thresholds and weight, `calculationVersion`. Not tenant-scoped.
- `an_kpi_configuration_overrides` (`KpiConfigurationOverride`) — tenant-owned thresholds, weights, display format and enablement, optionally narrowed to a project or a team, with `effectiveFrom/effectiveTo`, `changedByUserId` and `changeReason`.

Resolution order at calculation time: **team override → project override → tenant override → global default**. The winning configuration is materialized as `ResolvedKpiConfiguration` and stored on every `KpiValue` (`resolvedConfiguration`, `configurationVersion`), so a historical number can always be re-explained with the exact thresholds and weights that produced it — even after they change.

Thresholds below are the **global defaults**.

Conventions used in the tables:

- **Missing data**: `null` — return `null` with `availability`; `partial` — return value plus completeness flag; `exclude` — drop the component from a composite.
- **Confidence**: how trustworthy the metric is with typical Azure data quality.
- **Drill-down**: entity list returned when the user opens the detail drawer.

## 1. Sprint Confidence (`sprint_confidence`)

- Arabic: ثقة السبرنت — English: Sprint Confidence
- Business question: "How likely is this sprint to deliver its commitment?"
- Formula: weighted sum of nine normalized components (see [Sprint Confidence model](#sprint-confidence-model)); `score = Σ(component.normalizedScore × weight) / Σ(weight of available components)`
- Sources: iteration snapshots, work items, revisions, capacity, pull requests, builds, tests, historical iterations
- Azure fields: State, IterationPath, StoryPoints/Effort, RemainingWork, Blocked, ChangedDate, PR votes, build result, test outcomes
- History: 3 completed iterations for predictability (optional component)
- Frequency: on sync — Filters: current iteration, team scope — Exclusions: removed items
- Missing data: `exclude` component, renormalize weights, lower `dataConfidence`
- Display: integer percent — Healthy ≥ 75, Warning 50–74, Critical < 50
- Drill-down: component list with evidence work items
- Limitations: not a probability; sensitive to estimate coverage; capped `dataConfidence` when < 60% inputs available

## 2–6. Primary Overview KPIs

| KPI                   | AR              | Question                                 | Formula                                                                                                             | Missing data                                                          | Healthy / Warning / Critical                     | Drill-down                            |
| --------------------- | --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `scope_completion`    | إنجاز النطاق    | How much of the committed scope is done? | `completedCommittedEstimate / currentCommittedEstimate * 100`, with `originalCommittedEstimate` retained separately | `partial` when estimate coverage < 1; `null` when no estimates at all | ≥ 90 / 70–89 / < 70 (relative to expected)       | committed work items grouped by state |
| `expected_completion` | الإنجاز المتوقع | Where should we be today?                | `elapsedWorkingDays / totalWorkingDays * 100`                                                                       | `null` when iteration dates missing                                   | on track when within ±10 pts of scope completion | sprint calendar                       |
| `scope_change`        | تغيّر النطاق    | Has the commitment moved?                | `(currentScopeEstimate - originalScopeEstimate) / originalScopeEstimate * 100`                                      | `null` when original scope unknown (no snapshot at start)             | \|x\| ≤ 5 / 6–15 / > 15                          | scope change events                   |
| `critical_blockers`   | العوائق الحرجة  | What is hard-blocked right now?          | `count(workItems where isBlocked AND stateCategory = inProgress AND severity in (critical, high))`                  | `partial` when blocked field unmapped                                 | 0 / 1–2 / ≥ 3                                    | blocked items with blocked age        |
| `release_readiness`   | جاهزية الإصدار  | Can we release?                          | weighted gate composite (see [Release Readiness model](#release-readiness-model))                                   | unknown gates lower `dataConfidence`                                  | ≥ 85 / 60–84 / < 60                              | gate list                             |

`scope_completion` never rewrites history: `originalCommittedEstimate` comes from the first `DailyIterationSnapshot` of the iteration and is immutable.

## Flow, forecast and scope KPIs

| KPI                           | AR                            | Formula                                                                                             | Frequency          | Missing data                               | Thresholds (H/W/C)                                         | Drill-down          | Limitations                        |
| ----------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------ | ---------------------------------------------------------- | ------------------- | ---------------------------------- |
| `forecasted_completion`       | الإنجاز المتوقع نهاية السبرنت | `completedEstimate + (avgDailyCompletion × remainingWorkingDays)`, band = ±1σ of last 5 daily rates | daily              | `null` with < 3 data days                  | ≥ 95 / 80–94 / < 80                                        | trajectory points   | linear model, ignores dependencies |
| `velocity`                    | السرعة                        | `mean(completedEstimate)` over last N completed iterations (default N=3)                            | on iteration close | `null` with < 2 iterations                 | team-relative                                              | past iterations     | invalid across process changes     |
| `burndown`                    | مخطط الإنجاز المتناقص         | series of `remainingEstimate` per working day vs ideal line                                         | daily              | gaps rendered as breaks                    | —                                                          | daily snapshots     | requires daily snapshots           |
| `burnup`                      | مخطط الإنجاز المتزايد         | series of `completedEstimate` and `currentScopeEstimate` per working day                            | daily              | as above                                   | —                                                          | daily snapshots     | —                                  |
| `cycle_time`                  | زمن الدورة                    | `median(closedDate - activatedDate)` in working days for items completed in window                  | daily              | `null` when no completions                 | ≤ 5 / 6–10 / > 10 days                                     | completed items     | skewed by long-lived items         |
| `lead_time`                   | زمن التسليم                   | `median(closedDate - createdAtSource)`                                                              | daily              | as above                                   | ≤ 15 / 16–30 / > 30 days                                   | completed items     | includes backlog wait              |
| `throughput`                  | معدل الإنجاز                  | `count(items completed) / weeks in window`                                                          | daily              | `null` when window < 1 week                | trend-based                                                | completed items     | item size ignored                  |
| `work_in_progress`            | العمل الجاري                  | `count(items in stateCategory = inProgress)`                                                        | on sync            | —                                          | ≤ 2× members / ≤ 3× / > 3×                                 | active items        | needs WIP policy per team          |
| `flow_efficiency`             | كفاءة التدفق                  | `activeTime / (activeTime + waitTime) * 100` from state transitions                                 | daily              | `null` without transitions                 | ≥ 40 / 25–39 / < 25                                        | transitions         | requires clean state model         |
| `blocked_work_age`            | عمر العمل المعطّل             | `now - blockedTransitionTimestamp` (max and median) — never from CreatedDate                        | on sync            | `null` when no blocked transition recorded | ≤ 2 / 3–5 / > 5 days                                       | blocked items       | needs revision history             |
| `scope_added`                 | نطاق مضاف                     | `Σ estimateAtChange where changeType = added AND afterIterationStart`                               | on sync            | `partial` without estimates                | ≤ 5% / 6–15% / > 15% of original                           | scope change events | unestimated additions undercount   |
| `scope_removed`               | نطاق مُزال                    | `Σ estimateAtChange where changeType = removed AND afterIterationStart`                             | on sync            | as above                                   | as above                                                   | scope change events | removal may be legitimate          |
| `planned_vs_completed_points` | المخطط مقابل المنجز           | `completedEstimate` vs `originalCommittedEstimate` per iteration                                    | on iteration close | `null` without snapshots                   | ≥ 90% / 70–89% / < 70%                                     | iteration history   | —                                  |
| `capacity_utilization`        | استغلال الطاقة                | `assignedRemainingHours / availableCapacityHours * 100`                                             | hourly             | `null` when capacity unconfigured          | 71–95 healthy / 96–110 warn / > 110 or < 50 critical-watch | member load         | not a productivity measure         |

## Engineering KPIs

| KPI                       | AR                   | Formula                                                              | Missing data                    | Thresholds               | Drill-down    |
| ------------------------- | -------------------- | -------------------------------------------------------------------- | ------------------------------- | ------------------------ | ------------- |
| `pr_review_time`          | زمن مراجعة الطلبات   | `median(firstMeaningfulReviewAt - createdAtSource)` in working hours | `null` when no reviewed PRs     | ≤ 8 / 9–24 / > 24 hours  | pull requests |
| `stale_pull_requests`     | طلبات دمج راكدة      | `count(PRs matching StalePullRequestPolicy)`                         | `partial` when threads unsynced | 0–1 / 2–4 / ≥ 5          | pull requests |
| `build_success_rate`      | نجاح البناء          | `successfulCompletedBuilds / completedBuilds * 100`                  | `null` when no completed builds | ≥ 90 / 75–89 / < 75      | builds        |
| `deployment_frequency`    | تكرار النشر          | `count(successful production deployments) / weeks`                   | `null` without environments     | ≥ 3 / 1–2 / < 1 per week | deployments   |
| `deployment_failure_rate` | نسبة فشل النشر       | `failedDeployments / totalDeployments * 100`                         | `null` when none                | ≤ 10 / 11–25 / > 25      | deployments   |
| `failed_tests`            | اختبارات فاشلة       | `Σ failedTests` in window                                            | `null` when no runs             | 0 / 1–5 / > 5            | test runs     |
| `test_pass_rate`          | نسبة نجاح الاختبارات | `passedTests / executedTests * 100`                                  | `null` when `executedTests = 0` | ≥ 98 / 90–97 / < 90      | test runs     |

`successfulCompletedBuilds` counts `result = succeeded`. `partiallySucceeded` is reported separately and, by configuration, may be counted as success; `canceled` builds are excluded from both numerator and denominator.

**Meaningful review** for `pr_review_time`: the first reviewer action that is (a) a vote other than "no vote" by a user other than the PR author, or (b) a human comment of type `text`/`codeChange` on a thread by a non-author. Excluded: system comments, build/policy bot posts, author self-comments, and votes cast on drafts. If a PR completes without any meaningful review, it is excluded from the median and counted under governance reporting.

## Quality and governance KPIs

| KPI                      | AR                | Formula                                                                         | Missing data               | Thresholds                    | Drill-down       |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------- | -------------------------- | ----------------------------- | ---------------- |
| `items_without_owner`    | عناصر بلا مسؤول   | `count(active items where assignedToMemberId is null)`                          | —                          | 0 / 1–3 / > 3                 | work items       |
| `items_without_estimate` | عناصر بلا تقدير   | `count(committed items where estimate is null)`                                 | —                          | ≤ 5% / 6–20% / > 20%          | work items       |
| `reopened_bugs`          | أخطاء أُعيد فتحها | `count(bugs with a transition from completed/resolved back to active)`          | needs transitions          | 0 / 1–2 / ≥ 3                 | transitions      |
| `bug_age`                | عمر الأخطاء       | `median(now - createdAtSource)` for open bugs                                   | `null` when none           | ≤ 7 / 8–21 / > 21 days        | bugs             |
| `escaped_defects`        | عيوب تسربت        | `count(bugs created after the linked feature's release deployment)`             | `null` without deployments | 0 / 1–2 / ≥ 3                 | bugs             |
| `data_freshness`         | حداثة البيانات    | worst domain age vs SLA (see synchronization-plan.md)                           | `unavailable`              | ≤ 30 / 31–120 / > 120 minutes | freshness report |
| `sync_health`            | صحة المزامنة      | `completedRuns / totalRuns * 100` over 24h, degraded by open critical DQ issues | `null` without runs        | ≥ 95 / 80–94 / < 80           | sync runs        |

## Sprint Confidence model

Total weight = 100%. Weights are proposed defaults stored as configuration.

| Component                 | Input metric                                             | Normalization                                   | Weight | Missing-data handling       | Explanation shown                     |
| ------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------ | --------------------------- | ------------------------------------- |
| Delivery trajectory       | `scope_completion` vs `expected_completion`              | linear clamp of `(actual - expected + 20) / 40` | 25%    | exclude, renormalize        | "التسليم متقدم/متأخر عن الخط المخطط"  |
| Scope stability           | `scope_change`                                           | inverse linear, 0% change → 100, ±25% → 0       | 15%    | exclude                     | "حجم تغيّر النطاق بعد بداية السبرنت"  |
| Blocker pressure          | `critical_blockers` + `blocked_work_age`                 | step bands (0→100, 1–2→70, 3–4→40, ≥5→10)       | 15%    | exclude                     | "عدد وعمر العوائق الحرجة"             |
| Capacity pressure         | `capacity_utilization` spread                            | target band 70–95 → 100, distance-decayed       | 10%    | exclude                     | "توزيع الحمل مقابل الطاقة المتاحة"    |
| Pull-request flow         | `pr_review_time`, `stale_pull_requests`                  | inverse linear to SLA                           | 10%    | exclude                     | "سرعة المراجعة وتراكم الطلبات"        |
| Build health              | `build_success_rate`                                     | linear from 60→0 to 100→100                     | 8%     | exclude                     | "استقرار عمليات البناء"               |
| Test health               | `test_pass_rate`, `failed_tests`                         | linear from 85→0 to 100→100                     | 7%     | exclude                     | "نتائج الاختبارات الأخيرة"            |
| Historical predictability | stdev of `planned_vs_completed_points` over 3 iterations | inverse linear                                  | 5%     | exclude when < 2 iterations | "مدى ثبات أداء الفريق تاريخياً"       |
| Data completeness         | estimate coverage, freshness, DQ issues                  | linear 0–100                                    | 5%     | never excluded              | "اكتمال البيانات المستخدمة في الحساب" |

Result fields (`SprintConfidenceResult`): `score`, `band` (high ≥ 75, moderate 50–74, low 30–49, critical < 30, unknown when `dataConfidence < 40`), `dataConfidence`, per-component evidence, top three positive and negative drivers, and `calculationVersion`.

## Release Readiness model

| Gate                    | Default requirement                     | Pass condition                                  | Weight | Failure cap |
| ----------------------- | --------------------------------------- | ----------------------------------------------- | ------ | ----------- |
| Scope completion        | required                                | `scope_completion ≥ 95%`                        | 25%    | 70%         |
| Critical defects        | required                                | no open `critical`/`high` bugs in scope         | 20%    | 50%         |
| Regression tests        | required when a regression suite exists | `test_pass_rate ≥ 98%` on latest regression run | 15%    | 60%         |
| Build status            | required                                | latest build on release branch `succeeded`      | 10%    | 60%         |
| Deployment status       | required when environments exist        | last staging deployment `succeeded`             | 10%    | 70%         |
| Pull-request completion | required                                | no active PRs linked to in-scope items          | 8%     | 85%         |
| Release documentation   | optional                                | checklist marked complete                       | 5%     | —           |
| Business acceptance     | optional                                | acceptance recorded by Delivery Manager         | 5%     | —           |
| Security / compliance   | not applicable unless configured        | configured scan passed                          | 2%     | 60%         |

Cap rules: the final score is `min(weightedScore, min(caps of failed required gates))`. Optional failed gates subtract their weight but never cap. `notApplicable` gates are removed and remaining weights renormalized. `unknown` gates are treated as failed for capping only if configured as required with `strictUnknown = true`; otherwise they reduce `dataConfidence`.

## Traceability

Every dashboard value resolves to either (a) a normalized Azure field listed in `azure-devops-contracts.md`, (b) an immutable history record, or (c) a formula in this document with a `calculationVersion`. Values with no source return `null` with an availability reason; the UI never renders a fabricated zero.
