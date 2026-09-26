/**
 * Deterministic Overview rules.
 *
 * Pure functions only: no database, no clock, no Azure. Every number produced
 * here is traceable to synchronized work items, the sprint calendar, or a
 * persisted daily snapshot. When a source is missing the rule reports the
 * metric as unavailable instead of inventing a value.
 */
import { cairoToday, type SprintCalendar } from "@/lib/calendar/cairo";
import {
  boardColumnIndexFor,
  choosePrimaryBoard,
  type BoardColumnType,
} from "@/lib/azure/metadata-rules";
import { WORK_ITEM_RULE_VERSION } from "@/lib/azure/workitem-map";
import {
  assessStuck,
  defaultStuckSettings,
  type ColumnKind,
  type StuckAssessment,
  type StuckSettings,
} from "./stuck-rules";
import type { StateCategory, WorkItemAlias } from "@/types/domain/work-item";
import type {
  DeliverySnapshot,
  FunnelStage,
  HealthStatus,
  KpiExplanationFacts,
  KpiId,
  KpiMetric,
  RecommendedAction,
  Risk,
  Severity,
  TeamMemberLoad,
  TrajectoryPoint,
  WorkItemRef,
} from "@/data/types";

/** Minimum weight coverage before a composite confidence score is reported. */
export const MIN_CONFIDENCE_COVERAGE = 0.6;

export const CONFIDENCE_WEIGHTS = {
  deliveryTrajectory: 0.4,
  blockerPressure: 0.25,
  scopeStability: 0.2,
  dataCompleteness: 0.15,
} as const;

/** Blocked longer than this counts as a critical blocker. */
export const CRITICAL_BLOCKER_AGE_DAYS = 2;

export interface RealWorkItemFact {
  readonly id: string;
  readonly azureWorkItemId: number;
  readonly title: string;
  readonly alias: WorkItemAlias;
  readonly azureType: string;
  readonly state: string;
  readonly stateCategory: StateCategory;
  readonly isBlocked: boolean;
  readonly blockedSince: string | null;
  readonly estimate: number | null;
  readonly assignedToMemberId: string | null;
  readonly countsTowardScope: boolean;
  readonly stateChangeDate: string | null;
  readonly changedAtSource: string;
  readonly azureUrl: string | null;
  /** `System.BoardColumn` as synchronized; null when Azure did not report one. */
  readonly boardColumn: string | null;
  /** When the item was first observed in its current column; null if unknown. */
  readonly boardColumnEnteredAt: string | null;
  /** `System.Tags` as synchronized. */
  readonly tags: readonly string[];
  /** `System.Parent`, e.g. the User Story a Task belongs to. */
  readonly parentAzureWorkItemId: number | null;
}

export interface BoardColumnFact {
  readonly id: string;
  readonly name: string;
  readonly columnType: BoardColumnType;
  readonly itemLimit: number | null;
  readonly stateMappings: Readonly<Record<string, string>>;
}

/** One of the team's Azure boards with its columns in Azure order. */
export interface BoardFact {
  readonly id: string;
  readonly name: string;
  readonly columns: readonly BoardColumnFact[];
}

export interface MemberFact {
  readonly id: string;
  readonly displayName: string;
  readonly capacityHours: number | null;
}

/**
 * Version of the rule that decides which items are sprint scope. Bumped when
 * that rule changes (v2: bugs planned as tasks are no longer scope), so a
 * rule change is never reported as a scope change.
 */
export const SCOPE_RULE_VERSION = WORK_ITEM_RULE_VERSION;

export interface SnapshotHistoryPoint {
  readonly snapshotDate: string;
  readonly workingDay: number;
  readonly completedPercent: number;
  readonly scopeTotal: number;
  /** Scope rule the snapshot was taken under; null for snapshots before versioning. */
  readonly scopeRule: number | null;
}

export interface OverviewInput {
  readonly facts: readonly RealWorkItemFact[];
  readonly members: readonly MemberFact[];
  readonly calendar: SprintCalendar | null;
  readonly history: readonly SnapshotHistoryPoint[];
  /** The team's synchronized boards; empty until board metadata is synced. */
  readonly boards?: readonly BoardFact[];
  /** Stuck-work settings; defaults to 3 working days, Sun–Thu, Cairo. */
  readonly stuckSettings?: StuckSettings;
  readonly lastSyncedAt: string | null;
  readonly nowIso: string;
  readonly iterationId: string;
}

export type UnavailableReasonCode =
  | "no_work_items"
  | "no_sprint_dates"
  | "no_baseline_snapshot"
  | "baseline_same_day"
  | "no_estimates"
  | "insufficient_coverage"
  | "not_synchronized"
  | "board_not_synchronized";

export interface OverviewResult {
  readonly snapshot: DeliverySnapshot;
  /** Metrics/sections with no trustworthy source, keyed by id. */
  readonly unavailable: Readonly<Record<string, UnavailableReasonCode>>;
  readonly confidenceCoveragePercent: number;
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));
const round = (value: number): number => Math.round(value * 10) / 10;

const daysBetween = (fromIso: string | null, toIso: string): number | null => {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, (to - from) / 86_400_000);
};

const ACTIVE_CATEGORIES: readonly StateCategory[] = ["proposed", "inProgress", "resolved"];

const REF_TYPE: Record<string, WorkItemRef["type"]> = {
  bug: "Bug",
  task: "Task",
  testCase: "Test Case",
};

const toRef = (fact: RealWorkItemFact): WorkItemRef => ({
  id: String(fact.azureWorkItemId),
  title: { ar: fact.title, en: fact.title },
  type: REF_TYPE[fact.alias] ?? "User Story",
  state: { ar: fact.state, en: fact.state },
});

const statusFromPercent = (value: number, good: number, warn: number): HealthStatus =>
  value >= good ? "healthy" : value >= warn ? "watch" : value >= warn - 15 ? "atRisk" : "critical";

/** Scope completion: estimate-weighted when estimates exist, else item count. */
export function computeScopeCompletion(facts: readonly RealWorkItemFact[]): {
  percent: number | null;
  basis: "estimate" | "count";
  total: number;
  completed: number;
} {
  const scoped = facts.filter((f) => f.countsTowardScope);
  if (scoped.length === 0) return { percent: null, basis: "count", total: 0, completed: 0 };

  const estimated = scoped.filter((f) => typeof f.estimate === "number" && f.estimate > 0);
  const useEstimates = estimated.length / scoped.length >= 0.6;

  if (useEstimates) {
    const total = estimated.reduce((sum, f) => sum + (f.estimate ?? 0), 0);
    const completed = estimated
      .filter((f) => f.stateCategory === "completed")
      .reduce((sum, f) => sum + (f.estimate ?? 0), 0);
    if (total > 0) {
      return { percent: round((completed / total) * 100), basis: "estimate", total, completed };
    }
  }

  const completedCount = scoped.filter((f) => f.stateCategory === "completed").length;
  return {
    percent: round((completedCount / scoped.length) * 100),
    basis: "count",
    total: scoped.length,
    completed: completedCount,
  };
}

export function computeCriticalBlockers(
  facts: readonly RealWorkItemFact[],
  nowIso: string,
): { count: number; items: RealWorkItemFact[] } {
  const items = facts.filter((f) => {
    if (!f.isBlocked || !ACTIVE_CATEGORIES.includes(f.stateCategory)) return false;
    const age = daysBetween(f.blockedSince ?? f.stateChangeDate, nowIso);
    return age === null || age >= CRITICAL_BLOCKER_AGE_DAYS;
  });
  return { count: items.length, items };
}

interface ConfidenceComponent {
  readonly key: keyof typeof CONFIDENCE_WEIGHTS;
  readonly weight: number;
  readonly score: number;
}

export function computeSprintConfidence(input: {
  scopePercent: number | null;
  expectedPercent: number | null;
  baselineScopeTotal: number | null;
  currentScopeTotal: number;
  blockedActive: number;
  activeTotal: number;
  dataCoverage: number;
}): { score: number | null; coverage: number; components: readonly ConfidenceComponent[] } {
  const components: ConfidenceComponent[] = [];

  if (input.scopePercent !== null && input.expectedPercent !== null) {
    const gap = input.scopePercent - input.expectedPercent;
    components.push({
      key: "deliveryTrajectory",
      weight: CONFIDENCE_WEIGHTS.deliveryTrajectory,
      score: clamp(100 + gap * 2),
    });
  }

  if (input.activeTotal > 0) {
    const ratio = input.blockedActive / input.activeTotal;
    components.push({
      key: "blockerPressure",
      weight: CONFIDENCE_WEIGHTS.blockerPressure,
      score: clamp(100 - ratio * 300),
    });
  }

  if (input.baselineScopeTotal !== null && input.baselineScopeTotal > 0) {
    const churn =
      Math.abs(input.currentScopeTotal - input.baselineScopeTotal) / input.baselineScopeTotal;
    components.push({
      key: "scopeStability",
      weight: CONFIDENCE_WEIGHTS.scopeStability,
      score: clamp(100 - churn * 300),
    });
  }

  components.push({
    key: "dataCompleteness",
    weight: CONFIDENCE_WEIGHTS.dataCompleteness,
    score: clamp(input.dataCoverage * 100),
  });

  const coverage = components.reduce((sum, c) => sum + c.weight, 0);
  if (coverage < MIN_CONFIDENCE_COVERAGE) return { score: null, coverage, components };

  const weighted = components.reduce((sum, c) => sum + c.weight * c.score, 0);
  return { score: Math.round(weighted / coverage), coverage, components };
}

const stuckCandidate = (fact: RealWorkItemFact, columnKind: ColumnKind | null) => ({
  stateCategory: fact.stateCategory,
  isBlocked: fact.isBlocked,
  tags: fact.tags,
  columnKind,
  boardColumnEnteredAt: fact.boardColumnEnteredAt,
  stateChangeDate: fact.stateChangeDate,
});

/**
 * The kind of board column each item sits in, on the board that holds most of
 * the sprint's items; null for items not on that board (e.g. tasks).
 */
export function columnKindsByItem(
  facts: readonly RealWorkItemFact[],
  boards: readonly BoardFact[],
): Map<string, ColumnKind | null> {
  const result = new Map<string, ColumnKind | null>();
  const board = choosePrimaryBoard(
    boards,
    facts.map((f) => f.azureType),
  );
  for (const fact of facts) {
    const index = board ? boardColumnIndexFor(fact, board.columns) : null;
    result.set(fact.id, index === null || !board ? null : board.columns[index]!.columnType);
  }
  return result;
}

export interface StuckItem {
  readonly fact: RealWorkItemFact;
  readonly assessment: StuckAssessment;
}

/**
 * Every stuck open item, oldest in column first (unknown age last). A child
 * (e.g. a Task) is not reported when its parent (e.g. its User Story) is
 * itself stuck, so one piece of work is never counted twice; a stuck Task
 * under a healthy Story is still reported on its own.
 */
export function computeStuckItems(
  facts: readonly RealWorkItemFact[],
  boards: readonly BoardFact[],
  nowIso: string,
  stuckSettings: StuckSettings = defaultStuckSettings(),
): StuckItem[] {
  const kinds = columnKindsByItem(facts, boards);
  const stuck = facts
    .map((fact) => ({
      fact,
      assessment: assessStuck(
        stuckCandidate(fact, kinds.get(fact.id) ?? null),
        nowIso,
        stuckSettings,
      ),
    }))
    .filter((item) => item.assessment.stuck);
  const stuckIds = new Set(stuck.map((item) => item.fact.azureWorkItemId));
  return stuck
    .filter(
      (item) =>
        item.fact.parentAzureWorkItemId === null || !stuckIds.has(item.fact.parentAzureWorkItemId),
    )
    .sort(
      (a, b) => (b.assessment.workingDaysInColumn ?? -1) - (a.assessment.workingDaysInColumn ?? -1),
    );
}

/**
 * The delivery funnel is the team's own Azure board: one stage per column, in
 * Azure's order, named exactly as in Azure (ADR-013). The board shown is the
 * one that holds most of the sprint's items. Items that do not belong on that
 * board (e.g. tasks) are not counted. No board metadata means no funnel.
 */
export function computeFunnel(
  facts: readonly RealWorkItemFact[],
  boards: readonly BoardFact[],
  nowIso: string,
  stuckSettings: StuckSettings = defaultStuckSettings(),
): FunnelStage[] {
  const board = choosePrimaryBoard(
    boards,
    facts.map((f) => f.azureType),
  );
  if (!board || board.columns.length === 0) return [];

  const byColumn = board.columns.map(() => [] as RealWorkItemFact[]);
  for (const fact of facts) {
    const index = boardColumnIndexFor(fact, board.columns);
    if (index !== null) byColumn[index]!.push(fact);
  }

  return board.columns.map((column, index) => {
    const stageItems = byColumn[index]!;
    const ages = stageItems
      .map((f) =>
        daysBetween(f.boardColumnEnteredAt ?? f.stateChangeDate ?? f.changedAtSource, nowIso),
      )
      .filter((v): v is number => v !== null);
    const avgDays = ages.length > 0 ? round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    const overLimit = column.itemLimit !== null && stageItems.length > column.itemLimit;
    const stuckCount = stageItems.filter(
      (f) => assessStuck(stuckCandidate(f, column.columnType), nowIso, stuckSettings).stuck,
    ).length;
    const status: HealthStatus =
      column.columnType === "outgoing"
        ? "healthy"
        : avgDays >= 5
          ? "critical"
          : avgDays >= 3 || overLimit
            ? "atRisk"
            : "healthy";
    return {
      id: column.id,
      label: column.name,
      itemLimit: column.itemLimit,
      stuckCount,
      count: stageItems.length,
      avgDays,
      status,
    };
  });
}

export function computeTeamLoad(
  facts: readonly RealWorkItemFact[],
  members: readonly MemberFact[],
): TeamMemberLoad[] {
  const assigned = new Map<string, RealWorkItemFact[]>();
  for (const fact of facts) {
    if (!fact.assignedToMemberId) continue;
    const list = assigned.get(fact.assignedToMemberId) ?? [];
    list.push(fact);
    assigned.set(fact.assignedToMemberId, list);
  }

  return members
    .filter((member) => assigned.has(member.id))
    .map((member) => {
      const items = assigned.get(member.id) ?? [];
      const active = items.filter((f) => ACTIVE_CATEGORIES.includes(f.stateCategory));
      // Effort is only reportable when at least one assigned item carries an estimate.
      const estimated = items.filter((f) => typeof f.estimate === "number" && f.estimate > 0);
      const assignedHours =
        estimated.length > 0
          ? round(estimated.reduce((sum, f) => sum + (f.estimate ?? 0), 0))
          : null;
      const capacityHours =
        typeof member.capacityHours === "number" && member.capacityHours > 0
          ? member.capacityHours
          : null;
      const ratio =
        capacityHours !== null && assignedHours !== null ? assignedHours / capacityHours : null;
      const signal: TeamMemberLoad["signal"] =
        ratio === null ? "unknown" : ratio > 1.1 ? "over" : ratio < 0.6 ? "under" : "balanced";
      return {
        id: member.id,
        name: member.displayName,
        role: { ar: "", en: "" },
        capacityHours,
        assignedHours,
        activeItems: active.length,
        blockedItems: active.filter((f) => f.isBlocked).length,
        signal,
      };
    })
    .sort((a, b) => b.activeItems - a.activeItems);
}

export function computeRisks(
  facts: readonly RealWorkItemFact[],
  calendar: SprintCalendar | null,
  nowIso: string,
  stuck: readonly StuckItem[] = [],
): Risk[] {
  const risks: Risk[] = [];
  const blockers = computeCriticalBlockers(facts, nowIso);

  if (blockers.count > 0) {
    const oldest = Math.max(
      ...blockers.items.map((f) => daysBetween(f.blockedSince ?? f.stateChangeDate, nowIso) ?? 0),
    );
    risks.push({
      id: "risk-blocked",
      severity: blockers.count >= 3 ? "critical" : "high",
      title: { ar: "عناصر عمل محجوبة", en: "Blocked work items" },
      explanation: {
        ar: `${blockers.count} عنصر محجوب حالياً داخل السبرنت.`,
        en: `${blockers.count} active items are currently blocked.`,
      },
      recommendation: {
        ar: "راجع أسباب الحجب مع مالكي العناصر اليوم.",
        en: "Review blocking reasons with the item owners today.",
      },
      owner: "",
      ageDays: Math.round(oldest),
      items: blockers.items.slice(0, 5).map(toRef),
      adoUrl: blockers.items[0]?.azureUrl ?? "",
    });
  }

  // Stuck for a reason the blocked-items risk does not already cover.
  const blockerIds = new Set(blockers.items.map((f) => f.id));
  const stuckOnly = stuck.filter((item) => !blockerIds.has(item.fact.id));
  if (stuckOnly.length > 0) {
    const aged = stuckOnly.filter((i) => i.assessment.reasons.includes("aged_in_column")).length;
    const tagged = stuckOnly.filter((i) => i.assessment.reasons.includes("blocked_tag")).length;
    const flagged = stuckOnly.filter((i) => i.assessment.reasons.includes("blocked_field")).length;
    risks.push({
      id: "risk-stuck",
      severity: stuckOnly.length >= 3 ? "high" : "medium",
      title: { ar: "عناصر عمل عالقة", en: "Stuck work items" },
      explanation: {
        ar: `${stuckOnly.length} عنصر عالق: ${aged} تجاوز مدة البقاء في العمود، ${tagged} عليه وسم حجب، ${flagged} محجوب في Azure.`,
        en: `${stuckOnly.length} items are stuck: ${aged} over their time in column, ${tagged} tagged blocked, ${flagged} flagged blocked in Azure.`,
      },
      recommendation: {
        ar: "راجع العناصر العالقة مع مسؤوليها وحدد ما يعطلها.",
        en: "Review the stuck items with their owners and name what holds each one.",
      },
      owner: "",
      ageDays: stuckOnly[0]?.assessment.workingDaysInColumn ?? 0,
      items: stuckOnly.slice(0, 5).map((i) => toRef(i.fact)),
      adoUrl: stuckOnly[0]?.fact.azureUrl ?? "",
    });
  }

  // A Story is owned when it or any of its child items (e.g. Tasks) is assigned:
  // teams often assign the work on the Tasks and leave the Story itself open.
  const assignedParents = new Set(
    facts
      .filter((f) => f.assignedToMemberId && f.parentAzureWorkItemId !== null)
      .map((f) => f.parentAzureWorkItemId),
  );
  const unassigned = facts.filter(
    (f) =>
      f.countsTowardScope &&
      !f.assignedToMemberId &&
      !assignedParents.has(f.azureWorkItemId) &&
      f.stateCategory !== "completed",
  );
  if (unassigned.length > 0) {
    risks.push({
      id: "risk-unassigned",
      severity: unassigned.length >= 5 ? "high" : "medium",
      title: { ar: "عناصر بدون مسؤول", en: "Unassigned scope" },
      explanation: {
        ar: `${unassigned.length} عنصر ضمن النطاق بدون مسؤول محدد.`,
        en: `${unassigned.length} in-scope items have no assignee.`,
      },
      recommendation: {
        ar: "خصص مسؤولاً لكل عنصر قبل نهاية اليوم.",
        en: "Assign an owner to each item before end of day.",
      },
      owner: "",
      ageDays: 0,
      items: unassigned.slice(0, 5).map(toRef),
      adoUrl: unassigned[0]?.azureUrl ?? "",
    });
  }

  const unestimated = facts.filter(
    (f) => f.countsTowardScope && (f.estimate === null || f.estimate === 0),
  );
  if (unestimated.length > 0) {
    risks.push({
      id: "risk-unestimated",
      severity: "watch",
      title: { ar: "عناصر بدون تقدير", en: "Unestimated scope" },
      explanation: {
        ar: `${unestimated.length} عنصر بدون تقدير يقلل دقة التوقع.`,
        en: `${unestimated.length} items without estimates reduce forecast accuracy.`,
      },
      recommendation: {
        ar: "أضف التقديرات لتحسين موثوقية المؤشرات.",
        en: "Add estimates to improve indicator reliability.",
      },
      owner: "",
      ageDays: 0,
      items: unestimated.slice(0, 5).map(toRef),
      adoUrl: unestimated[0]?.azureUrl ?? "",
    });
  }

  if (calendar && calendar.currentWorkingDay >= Math.ceil(calendar.totalWorkingDays / 2)) {
    const notStarted = facts.filter((f) => f.countsTowardScope && f.stateCategory === "proposed");
    if (notStarted.length > 0) {
      risks.push({
        id: "risk-not-started",
        severity: notStarted.length >= 5 ? "high" : "medium",
        title: { ar: "عناصر لم تبدأ بعد", en: "Work not started" },
        explanation: {
          ar: `${notStarted.length} عنصر لم يبدأ رغم تجاوز منتصف السبرنت.`,
          en: `${notStarted.length} items have not started past the sprint midpoint.`,
        },
        recommendation: {
          ar: "أعد ترتيب الأولويات أو قلّص النطاق.",
          en: "Re-prioritise or reduce sprint scope.",
        },
        owner: "",
        ageDays: calendar.currentWorkingDay,
        items: notStarted.slice(0, 5).map(toRef),
        adoUrl: notStarted[0]?.azureUrl ?? "",
      });
    }
  }

  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, watch: 3 };
  return risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function actionsFromRisks(risks: readonly Risk[]): RecommendedAction[] {
  return risks.slice(0, 4).map((risk, index) => ({
    id: `action-${risk.id}`,
    priority: index + 1,
    title: risk.recommendation,
    impact: risk.title,
    reason: risk.explanation,
    items: risk.items,
  }));
}

function buildTrajectory(
  history: readonly SnapshotHistoryPoint[],
  calendar: SprintCalendar | null,
  scopePercent: number | null,
): DeliverySnapshot["trajectory"] {
  const total = calendar?.totalWorkingDays ?? 0;
  const current = calendar?.currentWorkingDay ?? 0;
  const byDay = new Map(history.map((point) => [point.workingDay, point.completedPercent]));
  if (scopePercent !== null && current > 0) byDay.set(current, scopePercent);

  const points: TrajectoryPoint[] = [];
  for (let day = 1; day <= total; day += 1) {
    const actual = day <= current ? (byDay.get(day) ?? null) : null;
    points.push({
      day,
      actual,
      expected: total > 0 ? Math.round((day / total) * 100) : 0,
      forecast: null,
      forecastLow: null,
      forecastHigh: null,
    });
  }

  // Linear forecast from the observed run rate. Reported only with >= 2 real
  // observations, so a single day never produces a confident projection.
  const observed = points.filter((p) => p.actual !== null);
  let forecastCompletion = scopePercent ?? 0;
  if (observed.length >= 2 && total > 0 && current > 0) {
    const rate = (scopePercent ?? 0) / current;
    forecastCompletion = clamp(round(rate * total));
    for (const point of points) {
      if (point.day < current) continue;
      const projected = clamp(round(rate * point.day));
      Object.assign(point, {
        forecast: projected,
        forecastLow: clamp(round(projected * 0.85)),
        forecastHigh: clamp(round(projected * 1.15)),
      });
    }
  }

  return {
    points,
    startDate: calendar?.startDate ?? "",
    endDate: calendar?.finishDate ?? "",
    forecastCompletion,
    forecastRange: [
      clamp(round(forecastCompletion * 0.85)),
      clamp(round(forecastCompletion * 1.15)),
    ],
  };
}

interface KpiExplanation {
  readonly key: string;
  readonly vars?: Record<string, string | number>;
  readonly facts?: KpiExplanationFacts;
}

const emptyFacts = (over: Partial<KpiExplanationFacts>): KpiExplanationFacts => ({
  basis: "none",
  numerator: null,
  denominator: null,
  sprintDay: null,
  totalWorkingDays: null,
  availableComponents: [],
  missingComponents: [],
  comparisonValue: null,
  coveragePercent: null,
  blockerCount: null,
  capacityAvailable: false,
  ...over,
});

const kpi = (
  id: KpiId,
  value: number,
  unit: KpiMetric["unit"],
  status: HealthStatus,
  comparison: number,
  drivers: KpiMetric["drivers"],
  formula: KpiMetric["formula"],
  trend: KpiMetric["trend"] = [],
  relatedItems: WorkItemRef[] = [],
  explain?: KpiExplanation,
): KpiMetric => ({
  id,
  // Labels/tooltips come from the dictionary; the explanation is always derived
  // from the same calculation result that produced `value` — never a static
  // Phase 1 sentence.
  labelKey: `kpi.${id}`,
  tooltipKey: `kpi.${id}.help`,
  explanationKey: explain?.key ?? `real.reason.not_synchronized`,
  explanationVars: explain?.vars,
  explanationFacts: explain?.facts,
  value,
  unit,
  status,
  comparison: { kind: "target", value: comparison },
  trend,
  drivers,
  relatedItems,
  formula,
});

/** A KPI card that must still be shown, but carries no value — only a reason. */
const unavailableKpi = (
  id: KpiId,
  unit: KpiMetric["unit"],
  reason: UnavailableReasonCode,
  explain?: KpiExplanation,
): KpiMetric => ({
  id,
  labelKey: `kpi.${id}`,
  tooltipKey: `kpi.${id}.help`,
  explanationKey: explain?.key ?? `real.reason.${reason}`,
  explanationVars: explain?.vars,
  explanationFacts: explain?.facts,
  value: 0,
  unit,
  status: "neutral",
  comparison: { kind: "target", value: 0 },
  trend: [],
  drivers: [],
  relatedItems: [],
  formula: { ar: "—", en: "—" },
  unavailable: { reasonKey: `real.reason.${reason}` },
});

/** Builds the entire real-data Overview payload from synchronized facts. */
export function buildOverview(input: OverviewInput): OverviewResult {
  const unavailable: Record<string, UnavailableReasonCode> = {};
  const { facts, calendar, nowIso } = input;

  if (facts.length === 0) unavailable["workItems"] = "no_work_items";
  if (!calendar) unavailable["sprintCalendar"] = "no_sprint_dates";

  const scope = computeScopeCompletion(facts);
  if (scope.percent === null) unavailable["scope"] = "no_work_items";

  const expectedPercent = calendar?.expectedCompletionPercent ?? null;
  if (expectedPercent === null) unavailable["expected"] = "no_sprint_dates";

  const scoped = facts.filter((f) => f.countsTowardScope);
  const active = facts.filter((f) => ACTIVE_CATEGORIES.includes(f.stateCategory));
  const blockers = computeCriticalBlockers(facts, nowIso);

  // Scope change needs a baseline captured on an earlier day than today. On the
  // first synchronized day the baseline is the current state, so any delta would
  // be 0% by construction rather than by measurement.
  const today = cairoToday(new Date(Date.parse(nowIso)));
  // Only a baseline taken under the current scope rule is comparable.
  const firstSnapshot =
    input.history.find((point) => point.scopeRule === SCOPE_RULE_VERSION) ?? null;
  const baseline =
    firstSnapshot && firstSnapshot.snapshotDate < today && firstSnapshot.scopeTotal > 0
      ? firstSnapshot
      : null;
  const scopeChangeReason: UnavailableReasonCode | null = baseline
    ? null
    : firstSnapshot
      ? "baseline_same_day"
      : "no_baseline_snapshot";
  if (scopeChangeReason) unavailable["scopeChange"] = scopeChangeReason;

  const coverageParts =
    scoped.length > 0
      ? (scoped.filter((f) => f.estimate !== null).length / scoped.length) * 0.5 +
        (scoped.filter((f) => f.assignedToMemberId !== null).length / scoped.length) * 0.5
      : 0;

  const confidence = computeSprintConfidence({
    scopePercent: scope.percent,
    expectedPercent,
    baselineScopeTotal: baseline?.scopeTotal ?? null,
    currentScopeTotal: scope.total,
    blockedActive: blockers.count,
    activeTotal: active.length,
    dataCoverage: coverageParts,
  });
  const confidenceReason: UnavailableReasonCode | null =
    confidence.score !== null
      ? null
      : facts.length === 0
        ? "no_work_items"
        : "insufficient_coverage";
  if (confidenceReason) unavailable["confidence"] = confidenceReason;

  const trendPoints = input.history.map((point) => ({
    label: String(point.workingDay),
    value: point.completedPercent,
  }));

  // All six primary cards are always rendered, in display order. A card with no
  // trustworthy source reports N/A and its reason instead of disappearing.
  const kpis: KpiMetric[] = [];

  const capacityAvailable = input.members.some(
    (m) => typeof m.capacityHours === "number" && m.capacityHours > 0,
  );
  const coveragePercent = Math.round(confidence.coverage * 100);
  const includedComponents = confidence.components.map((c) => c.key);
  const missingComponents = (
    Object.keys(CONFIDENCE_WEIGHTS) as (keyof typeof CONFIDENCE_WEIGHTS)[]
  ).filter((key) => !includedComponents.includes(key));
  const largestDrag = confidence.components.reduce<ConfidenceComponent | null>(
    (worst, c) => (worst === null || c.score < worst.score ? c : worst),
    null,
  );
  const sprintDay = calendar?.currentWorkingDay ?? null;
  const totalWorkingDays = calendar?.totalWorkingDays ?? null;
  const confidenceFacts = emptyFacts({
    basis: "components",
    availableComponents: [...includedComponents],
    missingComponents: [...missingComponents],
    coveragePercent,
    sprintDay,
    totalWorkingDays,
    blockerCount: blockers.count,
    capacityAvailable,
  });

  kpis.push(
    confidence.score !== null
      ? kpi(
          "confidence",
          confidence.score,
          "percent",
          statusFromPercent(confidence.score, 75, 55),
          Math.round(confidence.coverage * 100),
          [
            {
              ar: `تغطية المكوّنات ${Math.round(confidence.coverage * 100)}%`,
              en: `Component coverage ${Math.round(confidence.coverage * 100)}%`,
            },
            {
              ar: `مكوّنات مُدرجة: ${includedComponents.join("، ") || "لا شيء"}`,
              en: `Included components: ${includedComponents.join(", ") || "None"}`,
            },
            {
              ar: `مكوّنات ناقصة: ${missingComponents.join("، ") || "لا شيء"}`,
              en: `Missing components: ${missingComponents.join(", ") || "None"}`,
            },
          ],
          {
            ar: "متوسط مرجّح للمكوّنات المتوفرة فقط",
            en: "Weighted mean of available components only",
          },
          trendPoints,
          [],
          {
            key: `real.explain.confidence.${largestDrag?.key ?? "dataCompleteness"}`,
            vars: {
              a: coveragePercent,
              b: confidence.components.length,
              c: Math.round(largestDrag?.score ?? 0),
            },
            facts: confidenceFacts,
          },
        )
      : unavailableKpi("confidence", "percent", confidenceReason ?? "insufficient_coverage", {
          key: `real.reason.${confidenceReason ?? "insufficient_coverage"}`,
          facts: confidenceFacts,
        }),
  );

  kpis.push(
    scope.percent !== null
      ? kpi(
          "scope",
          scope.percent,
          "percent",
          expectedPercent === null
            ? "neutral"
            : statusFromPercent(scope.percent - expectedPercent + 100, 100, 90),
          expectedPercent ?? 0,
          [
            scope.basis === "estimate"
              ? {
                  ar: `محسوب على التقديرات · ${scope.completed} من ${scope.total} نقطة`,
                  en: `Estimate-weighted · ${scope.completed} of ${scope.total} points`,
                }
              : {
                  ar: `محسوب على عدد العناصر · ${scope.completed} من ${scope.total} عنصر`,
                  en: `Item-count based · ${scope.completed} of ${scope.total} items`,
                },
          ],
          scope.basis === "estimate"
            ? {
                ar: "التقديرات المكتملة ÷ إجمالي التقديرات",
                en: "Completed estimate ÷ total estimate",
              }
            : { ar: "العناصر المكتملة ÷ إجمالي العناصر", en: "Completed items ÷ total items" },
          trendPoints,
          scoped.slice(0, 5).map(toRef),
          {
            key: `real.explain.scope.${scope.basis}`,
            vars: {
              a: sprintDay ?? 0,
              b: totalWorkingDays ?? 0,
              c: scope.completed,
              d: scope.total,
            },
            facts: emptyFacts({
              basis: scope.basis,
              numerator: scope.completed,
              denominator: scope.total,
              sprintDay,
              totalWorkingDays,
              comparisonValue: expectedPercent,
              blockerCount: blockers.count,
              capacityAvailable,
            }),
          },
        )
      : unavailableKpi("scope", "percent", "no_work_items", {
          key: "real.reason.no_work_items",
          facts: emptyFacts({
            sprintDay,
            totalWorkingDays,
            blockerCount: blockers.count,
            capacityAvailable,
          }),
        }),
  );

  kpis.push(
    expectedPercent !== null && calendar
      ? kpi(
          "expected",
          expectedPercent,
          "percent",
          "neutral",
          100,
          [
            {
              ar: `اليوم ${calendar.currentWorkingDay} من ${calendar.totalWorkingDays}`,
              en: `Day ${calendar.currentWorkingDay} of ${calendar.totalWorkingDays}`,
            },
          ],
          {
            ar: "أيام العمل المنقضية ÷ إجمالي أيام العمل",
            en: "Elapsed working days ÷ total working days",
          },
          [],
          [],
          {
            key:
              calendar.currentWorkingDay >= calendar.totalWorkingDays
                ? "real.explain.expected.final"
                : "real.explain.expected.inProgress",
            vars: { a: calendar.currentWorkingDay, b: calendar.totalWorkingDays },
            facts: emptyFacts({
              basis: "workingDays",
              numerator: calendar.currentWorkingDay,
              denominator: calendar.totalWorkingDays,
              sprintDay: calendar.currentWorkingDay,
              totalWorkingDays: calendar.totalWorkingDays,
              blockerCount: blockers.count,
              capacityAvailable,
            }),
          },
        )
      : unavailableKpi("expected", "percent", "no_sprint_dates", {
          key: "real.reason.no_sprint_dates",
          facts: emptyFacts({ blockerCount: blockers.count, capacityAvailable }),
        }),
  );

  if (baseline) {
    const delta = round(((scope.total - baseline.scopeTotal) / baseline.scopeTotal) * 100);
    kpis.push(
      kpi(
        "scopeChange",
        delta,
        "delta",
        Math.abs(delta) <= 5 ? "healthy" : Math.abs(delta) <= 15 ? "watch" : "atRisk",
        0,
        [
          {
            ar: `خط الأساس ${baseline.snapshotDate}`,
            en: `Baseline ${baseline.snapshotDate}`,
          },
        ],
        {
          ar: "(النطاق الحالي − خط الأساس) ÷ خط الأساس",
          en: "(current scope − baseline) ÷ baseline",
        },
        [],
        [],
        {
          key: "real.reason.no_baseline_snapshot",
          facts: emptyFacts({
            numerator: scope.total,
            denominator: baseline.scopeTotal,
            sprintDay,
            totalWorkingDays,
            blockerCount: blockers.count,
            capacityAvailable,
          }),
        },
      ),
    );
  } else {
    kpis.push(
      unavailableKpi("scopeChange", "delta", scopeChangeReason ?? "no_baseline_snapshot", {
        key: `real.reason.${scopeChangeReason ?? "no_baseline_snapshot"}`,
        facts: emptyFacts({
          sprintDay,
          totalWorkingDays,
          blockerCount: blockers.count,
          capacityAvailable,
        }),
      }),
    );
  }

  kpis.push(
    kpi(
      "blockers",
      blockers.count,
      "count",
      blockers.count === 0 ? "healthy" : blockers.count <= 2 ? "watch" : "critical",
      0,
      [
        {
          ar: `محجوب ${CRITICAL_BLOCKER_AGE_DAYS} يوم أو أكثر`,
          en: `Blocked for ${CRITICAL_BLOCKER_AGE_DAYS}+ days`,
        },
      ],
      { ar: "عدد العناصر النشطة المحجوبة", en: "Count of active blocked items" },
      [],
      blockers.items.slice(0, 5).map(toRef),
      blockers.count === 0
        ? {
            key: "real.explain.blockers.none",
            facts: emptyFacts({
              numerator: 0,
              sprintDay,
              totalWorkingDays,
              blockerCount: 0,
              capacityAvailable,
            }),
          }
        : {
            key: "real.explain.blockers.some",
            vars: {
              a: blockers.count,
              b: CRITICAL_BLOCKER_AGE_DAYS,
              c: Math.round(
                Math.max(
                  ...blockers.items.map(
                    (f) => daysBetween(f.blockedSince ?? f.stateChangeDate, nowIso) ?? 0,
                  ),
                ),
              ),
            },
            facts: emptyFacts({
              numerator: blockers.count,
              sprintDay,
              totalWorkingDays,
              blockerCount: blockers.count,
              capacityAvailable,
            }),
          },
    ),
  );

  // Release readiness depends on builds, tests and deployments — none of which
  // are synchronized in this phase, so it stays explicitly unavailable.
  kpis.push(
    unavailableKpi("release", "percent", "not_synchronized", {
      key: "real.explain.release.notSynced",
      facts: emptyFacts({
        sprintDay,
        totalWorkingDays,
        blockerCount: blockers.count,
        capacityAvailable,
      }),
    }),
  );

  if ((input.boards ?? []).length === 0) unavailable["funnel"] = "board_not_synchronized";
  unavailable["release"] = "not_synchronized";
  unavailable["engineering"] = "not_synchronized";

  const stuckSettings = input.stuckSettings ?? defaultStuckSettings();
  const stuckItems = computeStuckItems(facts, input.boards ?? [], nowIso, stuckSettings);
  const risks = computeRisks(facts, calendar, nowIso, stuckItems);
  const lastSyncMinutesAgo = input.lastSyncedAt
    ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(input.lastSyncedAt)) / 60_000))
    : 0;

  const snapshot: DeliverySnapshot = {
    iterationId: input.iterationId,
    lastSyncMinutesAgo,
    freshness: !input.lastSyncedAt ? "partial" : lastSyncMinutesAgo > 90 ? "stale" : "fresh",
    kpis,
    trajectory: buildTrajectory(input.history, calendar, scope.percent),
    risks,
    funnel: computeFunnel(facts, input.boards ?? [], nowIso, stuckSettings),
    teamLoad: computeTeamLoad(facts, input.members),
    engineering: {
      activePullRequests: 0,
      stalePullRequests: 0,
      medianReviewHours: 0,
      buildSuccessRate: 0,
      failedTests: 0,
      deployment: {
        status: "neutral",
        labelKey: "eng.deploy.unknown",
        noteKey: "eng.deploy.notSynced",
      },
    },
    actions: actionsFromRisks(risks),
  };

  const violations = findExplanationContradictions(kpis);
  if (violations.length > 0 && process.env["NODE_ENV"] !== "production") {
    // Real mode must never narrate something its own numbers contradict.
    console.error("[overview] explanation contradictions", violations);
  }

  return {
    snapshot,
    unavailable,
    confidenceCoveragePercent: Math.round(confidence.coverage * 100),
  };
}

/**
 * Development/test guard: real-mode explanation facts may not contradict the
 * displayed value, availability, sprint day, blocker count, capacity
 * availability, or source coverage.
 */
export function findExplanationContradictions(kpis: readonly KpiMetric[]): string[] {
  const problems: string[] = [];
  for (const metric of kpis) {
    const facts = metric.explanationFacts;
    if (!facts) {
      problems.push(`${metric.id}: missing explanation facts`);
      continue;
    }
    if (metric.explanationKey.endsWith(".explain")) {
      problems.push(`${metric.id}: uses a static mock explanation key`);
    }
    if (
      metric.unavailable &&
      metric.explanationKey.startsWith("real.explain.") &&
      metric.id !== "release"
    ) {
      problems.push(`${metric.id}: unavailable metric narrates a computed value`);
    }
    if (metric.id === "blockers") {
      const zero = metric.value === 0;
      if (zero !== (metric.explanationKey === "real.explain.blockers.none")) {
        problems.push(`${metric.id}: blocker narrative contradicts count ${metric.value}`);
      }
      if (facts.blockerCount !== metric.value) {
        problems.push(
          `${metric.id}: facts blockerCount ${facts.blockerCount} != value ${metric.value}`,
        );
      }
    }
    if (metric.id === "scope" && !metric.unavailable) {
      if (facts.denominator === null || facts.numerator === null) {
        problems.push("scope: missing numerator/denominator");
      }
      const day = facts.sprintDay;
      if (day !== null && Number(metric.explanationVars?.["a"] ?? day) !== day) {
        problems.push("scope: narrated sprint day differs from the sprint calendar");
      }
    }
    if (metric.id === "expected" && !metric.unavailable && facts.capacityAvailable === false) {
      if (!metric.explanationKey.startsWith("real.explain.expected.")) {
        problems.push("expected: explanation is not derived from working days only");
      }
    }
    if (metric.id === "confidence" && !metric.unavailable) {
      const cited = metric.explanationKey.replace("real.explain.confidence.", "");
      if (!facts.availableComponents.includes(cited)) {
        problems.push(`confidence: cites unavailable component ${cited}`);
      }
      if ((facts.coveragePercent ?? 0) < MIN_CONFIDENCE_COVERAGE * 100) {
        problems.push("confidence: score reported below the coverage floor");
      }
    }
  }
  return problems;
}
