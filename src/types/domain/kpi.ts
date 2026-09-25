import type {
  CalculationStamp,
  HealthStatus,
  IsoTimestamp,
  Localized,
  Measure,
  RecordMeta,
  TenantScoped,
  Uuid,
  ValueAvailability,
} from "./common";

export type KpiId =
  | "sprint_confidence"
  | "scope_completion"
  | "expected_completion"
  | "scope_change"
  | "critical_blockers"
  | "release_readiness"
  | "forecasted_completion"
  | "velocity"
  | "burndown"
  | "burnup"
  | "cycle_time"
  | "lead_time"
  | "throughput"
  | "work_in_progress"
  | "flow_efficiency"
  | "blocked_work_age"
  | "scope_added"
  | "scope_removed"
  | "planned_vs_completed_points"
  | "capacity_utilization"
  | "pr_review_time"
  | "stale_pull_requests"
  | "build_success_rate"
  | "deployment_frequency"
  | "deployment_failure_rate"
  | "failed_tests"
  | "test_pass_rate"
  | "items_without_owner"
  | "items_without_estimate"
  | "reopened_bugs"
  | "bug_age"
  | "escaped_defects"
  | "data_freshness"
  | "sync_health";

export type KpiUnit = "percent" | "count" | "hours" | "days" | "points" | "ratio" | "perDay";
export type KpiFrequency = "onSync" | "hourly" | "daily" | "onDemand";
export type MissingDataBehavior =
  "return_null" | "partial_with_flag" | "exclude_component" | "fallback_estimate";

/** Direction that counts as good. */
export type KpiDirection = "higherIsBetter" | "lowerIsBetter" | "targetBand";

/** Configurable thresholds; never hardcoded in UI code. */
export interface KpiThresholds {
  readonly healthy: number | null;
  readonly warning: number | null;
  readonly critical: number | null;
  readonly direction: KpiDirection;
}

/**
 * Global, immutable KPI identity and formula metadata.
 * Table: `an_kpi_definitions` — NOT tenant-scoped; `kpi_id` is globally unique.
 * Thresholds and weights live in `KpiConfigurationOverride`, never here beyond
 * the shipped default.
 */
export interface KpiDefinition {
  readonly id: Uuid;
  readonly kpiId: KpiId;
  readonly name: Localized;
  readonly businessQuestion: Localized;
  /** Human-readable formula; the authoritative text lives in kpi-catalog.md. */
  readonly formula: string;
  readonly unit: KpiUnit;
  /** Default display format; a tenant override may replace it at render time. */
  readonly defaultDisplayFormat: string;
  readonly requiredEntities: readonly string[];
  readonly requiredAzureFields: readonly string[];
  readonly requiresHistory: boolean;
  readonly minimumHistoryDays: number | null;
  readonly frequency: KpiFrequency;
  readonly filters: readonly string[];
  readonly exclusions: readonly string[];
  readonly missingDataBehavior: MissingDataBehavior;
  /** Shipped defaults; overridable per tenant/project/team. */
  readonly defaultThresholds: KpiThresholds;
  /** Default confidence weight when the KPI participates in a composite. */
  readonly defaultWeight: number | null;
  readonly drilldownKind: "workItems" | "pullRequests" | "builds" | "tests" | "members" | "none";
  readonly limitations: readonly Localized[];
  /** Bumped whenever the formula changes; definitions are never edited in place. */
  readonly calculationVersion: string;
}

/** Level at which an override was defined. */
export type KpiOverrideLevel = "team" | "project" | "tenant" | "global_default";

/**
 * Table: `an_kpi_configuration_overrides`.
 * Nullable `project_id` / `team_id` express tenant-wide and project-wide rows.
 * Structural rules (see database-blueprint.md):
 * - `CHECK (team_id IS NULL OR project_id IS NOT NULL)` — a team override always names its project.
 * - composite FK `(tenant_id, project_id, team_id) -> core_teams (tenant_id, project_id, id)`
 *   so a team from another project fails with `23503`.
 * - uniqueness uses explicit partial unique indexes, not a COALESCE sentinel.
 */
export interface KpiConfigurationOverride extends TenantScoped, RecordMeta {
  readonly id: Uuid;
  readonly kpiDefinitionId: Uuid;
  readonly kpiId: KpiId;
  /** Null = applies to the whole tenant. */
  readonly projectId: Uuid | null;
  /** Null = applies to the whole project (or tenant when projectId is null). */
  readonly teamId: Uuid | null;
  readonly thresholds: KpiThresholds | null;
  readonly weight: number | null;
  readonly displayFormat: string | null;
  readonly enabled: boolean;
  readonly effectiveFrom: IsoTimestamp;
  readonly effectiveTo: IsoTimestamp | null;
  readonly changedByUserId: Uuid | null;
  readonly changeReason: string | null;
}

/**
 * The configuration actually used by one calculation.
 * Resolution order: team → project → tenant → global default.
 * Persisted with every `KpiValue` so historical numbers stay explainable even
 * after thresholds or weights change.
 */
export interface ResolvedKpiConfiguration {
  readonly kpiId: KpiId;
  readonly kpiDefinitionId: Uuid;
  readonly calculationVersion: string;
  readonly thresholds: KpiThresholds;
  readonly weight: number | null;
  readonly displayFormat: string;
  readonly enabled: boolean;
  readonly resolvedFrom: KpiOverrideLevel;
  /** Null when the global default was used. */
  readonly overrideId: Uuid | null;
  /** Hash of the resolved configuration; stored on the value row. */
  readonly configurationVersion: string;
  readonly resolvedAt: IsoTimestamp;
}

/** A computed KPI value for one scope at one point in time. */
export interface KpiValue extends TenantScoped {
  readonly id: Uuid;
  readonly kpiId: KpiId;
  readonly organizationId: Uuid;
  readonly projectId: Uuid | null;
  readonly teamId: Uuid | null;
  /** Canonical team-sprint reference; the only persisted sprint relationship. */
  readonly teamIterationId: Uuid | null;
  /** Derived convenience value, copied from the TeamIteration. */
  readonly iterationId: Uuid | null;
  readonly measure: Measure;
  readonly unit: KpiUnit;
  readonly status: HealthStatus;
  readonly comparison: { readonly kind: "previous" | "target"; readonly value: number | null };
  readonly trend: readonly { readonly label: string; readonly value: number | null }[];
  readonly drivers: readonly Localized[];
  readonly relatedWorkItemIds: readonly Uuid[];
  readonly validFrom: IsoTimestamp;
  /** Snapshot of the configuration used; required for historical explainability. */
  readonly resolvedConfiguration: ResolvedKpiConfiguration;
  readonly stamp: CalculationStamp;
}

/** One transparent input of Sprint Confidence. */
export interface ConfidenceComponent {
  readonly key:
    | "delivery_trajectory"
    | "scope_stability"
    | "blocker_pressure"
    | "capacity_pressure"
    | "pr_flow"
    | "build_health"
    | "test_health"
    | "historical_predictability"
    | "data_completeness";
  readonly label: Localized;
  readonly inputMetric: KpiId | "composite";
  readonly normalization: "linear_clamped" | "inverse_linear" | "step_bands" | "ratio_to_target";
  /** 0..1; the sum of all component weights must equal 1. */
  readonly weight: number;
  /** Normalized 0..100 contribution score; null when the input is unavailable. */
  readonly normalizedScore: number | null;
  readonly availability: ValueAvailability;
  readonly missingDataHandling: MissingDataBehavior;
  readonly explanation: Localized;
  readonly evidenceWorkItemIds: readonly Uuid[];
}

export type ConfidenceBand = "high" | "moderate" | "low" | "critical" | "unknown";

/** The full, explainable Sprint Confidence result. */
export interface SprintConfidenceResult {
  readonly score: number | null;
  readonly band: ConfidenceBand;
  /** Share of weighted inputs that were actually available, 0..100. */
  readonly dataConfidence: number;
  readonly components: readonly ConfidenceComponent[];
  readonly topPositiveDrivers: readonly Localized[];
  readonly topNegativeDrivers: readonly Localized[];
  readonly stamp: CalculationStamp;
}

export type GateRequirement = "required" | "optional" | "notApplicable";
export type GateOutcome = "passed" | "failed" | "pending" | "unknown" | "skipped";

export interface ReleaseGate {
  readonly key:
    | "scope_completion"
    | "critical_defects"
    | "regression_tests"
    | "build_status"
    | "deployment_status"
    | "pull_requests"
    | "release_documentation"
    | "business_acceptance"
    | "security_compliance";
  readonly label: Localized;
  readonly requirement: GateRequirement;
  readonly outcome: GateOutcome;
  readonly score: number | null;
  readonly weight: number;
  readonly evidence: Localized;
  /** Max total readiness allowed when this required gate fails. */
  readonly failureCapPercent: number | null;
}

export interface ReleaseReadinessResult {
  readonly score: number | null;
  readonly cappedBy: readonly string[];
  readonly gates: readonly ReleaseGate[];
  readonly dataConfidence: number;
  readonly stamp: CalculationStamp;
}
