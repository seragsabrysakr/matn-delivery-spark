/**
 * Phase 1 mock -> Phase 2 contract adapter.
 *
 * The approved UI keeps consuming `DeliverySnapshot` directly; this adapter only
 * proves that the existing mock data can satisfy the new contracts, and gives
 * Phase 8 a single swap point. Mock output is always tagged `mode: "mock"` so
 * mock and live data can never be blended silently.
 */
import type { DeliverySnapshot, Iteration, KpiMetric, Risk } from "@/data/types";
import type {
  CalculationStamp,
  DomainFreshness,
  FreshnessReport,
  FreshnessStatus,
  KpiValue,
  Measure,
  Recommendation,
  RiskSignal,
} from "@/types/domain";
import type { KpiId, ResolvedKpiConfiguration } from "@/types/domain/kpi";
import type { DashboardContext, PartialDataWarning, Section } from "./shared";
import type {
  EngineeringHealthContract,
  FunnelStageContract,
  OverviewContract,
  SprintTrajectoryContract,
  TeamLoadEntryContract,
} from "./overview-contract";

/** Marker exported for guards and tests: this module never emits live data. */
export const MOCK_MODE = "mock" as const;

const MOCK_CALCULATION_VERSION = "mock-1.0.0";

/** Mock KPI id -> catalog KPI id. */
const KPI_ID_MAP: Record<string, KpiId> = {
  confidence: "sprint_confidence",
  scope: "scope_completion",
  expected: "expected_completion",
  scopeChange: "scope_change",
  blockers: "critical_blockers",
  release: "release_readiness",
};

function stamp(now: string): CalculationStamp {
  return { calculationVersion: MOCK_CALCULATION_VERSION, calculatedAt: now, origin: "mock" };
}

/** Mock mode always resolves to the shipped global default configuration. */
function mockResolvedConfiguration(kpiId: KpiId, now: string): ResolvedKpiConfiguration {
  return {
    kpiId,
    kpiDefinitionId: `mock-def-${kpiId}`,
    calculationVersion: MOCK_CALCULATION_VERSION,
    thresholds: { healthy: null, warning: null, critical: null, direction: "higherIsBetter" },
    weight: null,
    displayFormat: "0",
    enabled: true,
    resolvedFrom: "global_default",
    overrideId: null,
    configurationVersion: `mock-config-${kpiId}`,
    resolvedAt: now,
  };
}

function measure(value: number | null): Measure {
  return {
    value,
    availability: value === null ? "missing_source" : "available",
    completeness: value === null ? 0 : 1,
  };
}

function ready<T>(data: T): Section<T> {
  return { availability: "ready", data, reason: null };
}

function emptySection<T>(data: T): Section<T> {
  return { availability: "empty", data, reason: null };
}

function domainFreshness(
  status: FreshnessStatus,
  ageMinutes: number,
  now: string,
): DomainFreshness {
  return { status, lastSyncedAt: now, ageMinutes };
}

function freshnessFromSnapshot(snapshot: DeliverySnapshot, now: string): FreshnessReport {
  const status: FreshnessStatus =
    snapshot.freshness === "fresh"
      ? "current"
      : snapshot.freshness === "stale"
        ? "stale"
        : snapshot.freshness === "partial"
          ? "partial"
          : "unavailable";
  const age = snapshot.lastSyncMinutesAgo;
  const d = domainFreshness(status, age, now);
  return {
    workItems: d,
    capacity: d,
    repositories: d,
    pullRequests: d,
    builds: d,
    deployments: d,
    tests: d,
    overall: status,
  };
}

function toKpiValue(kpi: KpiMetric, ctx: DashboardContext, now: string): KpiValue {
  return {
    id: `mock-kpi-${kpi.id}`,
    tenantId: ctx.tenantId,
    kpiId: KPI_ID_MAP[kpi.id] ?? "scope_completion",
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    teamId: ctx.teamId,
    iterationId: ctx.iterationId,
    teamIterationId: ctx.teamIterationId,
    measure: measure(kpi.value),
    unit: kpi.unit === "percent" ? "percent" : kpi.unit === "count" ? "count" : "ratio",
    status: kpi.status,
    comparison: { kind: kpi.comparison.kind, value: kpi.comparison.value },
    trend: kpi.trend.map((p) => ({ label: p.label, value: p.value })),
    drivers: kpi.drivers,
    relatedWorkItemIds: kpi.relatedItems.map((i) => i.id),
    validFrom: now,
    resolvedConfiguration: mockResolvedConfiguration(KPI_ID_MAP[kpi.id] ?? "scope_completion", now),
    stamp: stamp(now),
  };
}

function toRiskSignal(risk: Risk, ctx: DashboardContext, now: string): RiskSignal {
  return {
    id: risk.id,
    tenantId: ctx.tenantId,
    ruleId: "aging_blocker",
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    teamId: ctx.teamId,
    teamIterationId: ctx.teamIterationId,
    iterationId: ctx.iterationId,
    severity: risk.severity,
    status: "open",
    title: risk.title,
    explanation: risk.explanation,
    evidence: [
      {
        label: risk.recommendation,
        metric: "ageDays",
        observed: risk.ageDays,
        threshold: null,
        entityIds: risk.items.map((i) => i.id),
      },
    ],
    affectedWorkItemIds: risk.items.map((i) => i.id),
    affectedMemberIds: [],
    firstDetectedAt: now,
    lastDetectedAt: now,
    ageDays: risk.ageDays,
    ownerMemberId: null,
    recommendedActionTemplate: risk.recommendation,
    resolutionCondition: "mock:never",
    resolvedAt: null,
    stamp: stamp(now),
  };
}

function toRecommendations(
  snapshot: DeliverySnapshot,
  ctx: DashboardContext,
  now: string,
): Recommendation[] {
  return snapshot.actions.map((action) => ({
    id: action.id,
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    teamId: ctx.teamId,
    teamIterationId: ctx.teamIterationId,
    iterationId: ctx.iterationId,
    priority: action.priority,
    title: action.title,
    reason: action.reason,
    expectedImpact: action.impact,
    confidence: "medium",
    source: "rule",
    relatedRiskSignalIds: [],
    evidence: [],
    relatedWorkItemIds: action.items.map((i) => i.id),
    targetMemberId: null,
    targetRole: null,
    status: "proposed",
    createdAt: now,
    acceptedAt: null,
    hiddenAt: null,
    completedAt: null,
    stamp: stamp(now),
  }));
}

function toTrajectory(snapshot: DeliverySnapshot, iteration: Iteration): SprintTrajectoryContract {
  return {
    points: snapshot.trajectory.points.map((p) => ({
      workingDay: p.day,
      label: String(p.day),
      actual: p.actual,
      expected: p.expected,
      forecast: p.forecast,
      forecastLow: p.forecastLow,
      forecastHigh: p.forecastHigh,
    })),
    totalWorkingDays: iteration.totalDays,
    currentWorkingDay: iteration.currentDay,
    forecastCompletion: measure(snapshot.trajectory.forecastCompletion),
    forecastRange: snapshot.trajectory.forecastRange,
    accessibleSummary: {
      ar: `اليوم ${iteration.currentDay} من ${iteration.totalDays}`,
      en: `Day ${iteration.currentDay} of ${iteration.totalDays}`,
    },
  };
}

function toFunnel(snapshot: DeliverySnapshot): FunnelStageContract[] {
  return snapshot.funnel.map((stage) => ({
    id: stage.id,
    label: { ar: stage.id, en: stage.id },
    count: stage.count,
    avgDays: stage.avgDays,
    status: stage.status,
    workItemIds: [],
  }));
}

function toTeamLoad(snapshot: DeliverySnapshot): TeamLoadEntryContract[] {
  return snapshot.teamLoad.map((member) => {
    const capacity = member.capacityHours;
    const assigned = member.assignedHours;
    const utilization =
      capacity !== null && capacity > 0 && assigned !== null ? (assigned / capacity) * 100 : null;
    return {
      memberId: member.id,
      name: member.name,
      role: member.role,
      capacityHours: capacity,
      assignedHours: assigned,
      activeItems: member.activeItems,
      blockedItems: member.blockedItems,
      utilizationPercentage: measure(utilization === null ? null : Math.round(utilization)),
      band:
        member.signal === "over"
          ? "over"
          : member.signal === "under"
            ? "under"
            : member.signal === "unknown"
              ? "unknown"
              : "balanced",
    };
  });
}

function toEngineering(snapshot: DeliverySnapshot): EngineeringHealthContract {
  const e = snapshot.engineering;
  return {
    activePullRequests: e.activePullRequests,
    stalePullRequests: e.stalePullRequests,
    medianReviewHours: measure(e.medianReviewHours),
    buildSuccessRate: measure(e.buildSuccessRate),
    failedTests: e.failedTests,
    deployment: {
      status: e.deployment.status,
      label: { ar: e.deployment.labelKey, en: e.deployment.labelKey },
      note: { ar: e.deployment.noteKey, en: e.deployment.noteKey },
    },
  };
}

export interface MockAdapterInput {
  readonly snapshot: DeliverySnapshot;
  readonly iteration: Iteration;
  readonly context: DashboardContext;
  readonly now: string;
}

/** Build an OverviewContract from the Phase 1 mock snapshot. */
export function toOverviewContract({
  snapshot,
  iteration,
  context,
  now,
}: MockAdapterInput): OverviewContract {
  const warnings: PartialDataWarning[] = [];
  if (snapshot.freshness !== "fresh") {
    warnings.push({
      section: "freshness",
      message: {
        ar: "بعض البيانات غير محدّثة في وضع البيانات التجريبية.",
        en: "Some data is not current in mock mode.",
      },
      severity: snapshot.freshness === "error" ? "critical" : "warning",
    });
  }

  const kpis = snapshot.kpis.map((k) => toKpiValue(k, context, now));
  const risks = snapshot.risks.map((r) => toRiskSignal(r, context, now));
  const funnel = toFunnel(snapshot);
  const teamLoad = toTeamLoad(snapshot);
  const actions = toRecommendations(snapshot, context, now);

  return {
    context: { ...context, mode: MOCK_MODE },
    freshness: freshnessFromSnapshot(snapshot, now),
    generatedAt: now,
    stamp: stamp(now),
    warnings,
    primaryKpis: kpis.length > 0 ? ready(kpis) : emptySection<readonly KpiValue[]>([]),
    // Sprint Confidence components are not modelled in Phase 1 mock data.
    sprintConfidence: {
      availability: "unavailable",
      data: null,
      reason: {
        ar: "نموذج ثقة السبرنت يُحتسب بعد ربط البيانات الحقيقية.",
        en: "The Sprint Confidence model is computed after live data is connected.",
      },
    },
    trajectory: ready(toTrajectory(snapshot, iteration)),
    criticalRisks: risks.length > 0 ? ready(risks) : emptySection<readonly RiskSignal[]>([]),
    funnel: funnel.length > 0 ? ready(funnel) : emptySection<readonly FunnelStageContract[]>([]),
    teamLoad:
      teamLoad.length > 0 ? ready(teamLoad) : emptySection<readonly TeamLoadEntryContract[]>([]),
    engineering: ready(toEngineering(snapshot)),
    recommendedActions:
      actions.length > 0 ? ready(actions) : emptySection<readonly Recommendation[]>([]),
  };
}
