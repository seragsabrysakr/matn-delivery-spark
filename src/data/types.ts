/**
 * Domain types for MATN Delivery Intelligence.
 *
 * These shapes mirror the payloads that will later be produced by the
 * Azure DevOps sync layer and persisted through Lovable Cloud. The UI must
 * only ever consume these interfaces, never raw provider responses.
 */

export type Localized = { ar: string; en: string };

export type HealthStatus = "healthy" | "atRisk" | "critical" | "neutral" | "watch";
export type Severity = "critical" | "high" | "medium" | "watch";
export type DataFreshness = "fresh" | "stale" | "partial" | "error";
export type SectionState = "ready" | "loading" | "empty" | "error" | "partial";

export interface Organization {
  id: string;
  name: Localized;
}

export interface Project {
  id: string;
  organizationId: string;
  name: Localized;
}

export interface Team {
  id: string;
  projectId: string;
  name: Localized;
}

export interface Iteration {
  id: string;
  teamId: string;
  name: Localized;
  startDate: string;
  endDate: string;
  currentDay: number;
  totalDays: number;
}

export type KpiId = "confidence" | "scope" | "expected" | "scopeChange" | "blockers" | "release";

/** Structured facts behind a real-mode KPI explanation. The browser formats
 * these; it never invents numbers of its own. */
export interface KpiExplanationFacts {
  basis: "estimate" | "count" | "workingDays" | "components" | "none";
  numerator: number | null;
  denominator: number | null;
  sprintDay: number | null;
  totalWorkingDays: number | null;
  availableComponents: string[];
  missingComponents: string[];
  comparisonValue: number | null;
  coveragePercent: number | null;
  blockerCount: number | null;
  capacityAvailable: boolean;
}

export interface KpiMetric {
  id: KpiId;
  labelKey: string;
  tooltipKey: string;
  explanationKey: string;
  value: number;
  unit: "percent" | "count" | "delta";
  status: HealthStatus;
  comparison: { kind: "previous" | "target"; value: number };
  trend: { label: string; value: number }[];
  drivers: Localized[];
  relatedItems: WorkItemRef[];
  formula: Localized;
  /** Interpolation values for `explanationKey`. Real mode always sets these. */
  explanationVars?: Record<string, string | number> | undefined;
  /** Structured facts that generated the explanation (real mode only). */
  explanationFacts?: KpiExplanationFacts | undefined;
  /** When set, the metric has no trustworthy source: render N/A, never a value or status. */
  unavailable?: { reasonKey: string };
}

export interface WorkItemRef {
  id: string;
  title: Localized;
  type: "Bug" | "Task" | "User Story" | "Test Case";
  state: Localized;
}

export interface TrajectoryPoint {
  day: number;
  actual: number | null;
  expected: number;
  forecast: number | null;
  forecastLow: number | null;
  forecastHigh: number | null;
}

export interface SprintTrajectory {
  points: TrajectoryPoint[];
  startDate: string;
  endDate: string;
  forecastCompletion: number;
  forecastRange: [number, number];
}

export interface Risk {
  id: string;
  severity: Severity;
  title: Localized;
  explanation: Localized;
  recommendation: Localized;
  owner: string;
  ageDays: number;
  items: WorkItemRef[];
  adoUrl: string;
}

export type FunnelStageId = "backlog" | "ready" | "development" | "review" | "testing" | "done";

export interface FunnelStage {
  id: FunnelStageId;
  count: number;
  avgDays: number;
  status: HealthStatus;
}

export interface TeamMemberLoad {
  id: string;
  name: string;
  role: Localized;
  /** Null when Azure capacity is not configured/synchronized — never 0 as a stand-in. */
  capacityHours: number | null;
  /** Null when no assigned-effort data exists — the UI then shows item counts. */
  assignedHours: number | null;
  activeItems: number;
  blockedItems: number;
  /** "unknown" whenever there is no positive capacity denominator. */
  signal: "over" | "balanced" | "under" | "unknown";
}

export interface EngineeringHealth {
  activePullRequests: number;
  stalePullRequests: number;
  medianReviewHours: number;
  buildSuccessRate: number;
  failedTests: number;
  deployment: { status: HealthStatus; labelKey: string; noteKey: string };
}

export interface RecommendedAction {
  id: string;
  priority: number;
  title: Localized;
  impact: Localized;
  reason: Localized;
  items: WorkItemRef[];
}

export interface DeliverySnapshot {
  iterationId: string;
  lastSyncMinutesAgo: number;
  freshness: DataFreshness;
  kpis: KpiMetric[];
  trajectory: SprintTrajectory;
  risks: Risk[];
  funnel: FunnelStage[];
  teamLoad: TeamMemberLoad[];
  engineering: EngineeringHealth;
  actions: RecommendedAction[];
}

export interface WorkspaceFilters {
  organizationId: string;
  projectId: string;
  teamId: string;
  iterationId: string;
}
