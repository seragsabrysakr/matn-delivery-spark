import type {
  CalculationStamp,
  IsoTimestamp,
  Localized,
  Severity,
  TenantScoped,
  Uuid,
} from "./common";

/** Deterministic rule identifiers evaluated before any AI interpretation. */
export type RiskRuleId =
  | "scope_growth"
  | "aging_blocker"
  | "capacity_overload"
  | "qa_bottleneck"
  | "stale_pull_requests"
  | "build_instability"
  | "failed_tests"
  | "deployment_failure"
  | "missing_ownership"
  | "missing_estimates"
  | "late_scope_addition"
  | "stuck_in_state"
  | "unresolved_critical_bug"
  | "stale_synchronization";

export type RiskStatus = "open" | "acknowledged" | "mitigating" | "resolved" | "expired";

/** A single piece of machine-checkable evidence behind a signal. */
export interface RiskEvidence {
  readonly label: Localized;
  readonly metric: string;
  readonly observed: number | string | null;
  readonly threshold: number | string | null;
  readonly entityIds: readonly Uuid[];
}

export interface RiskSignal extends TenantScoped {
  readonly id: Uuid;
  readonly ruleId: RiskRuleId;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly teamId: Uuid | null;
  /** Canonical team-sprint reference for sprint-scoped signals. */
  readonly teamIterationId: Uuid | null;
  /** Derived convenience value. */
  readonly iterationId: Uuid | null;
  readonly severity: Severity;
  readonly status: RiskStatus;
  readonly title: Localized;
  readonly explanation: Localized;
  readonly evidence: readonly RiskEvidence[];
  readonly affectedWorkItemIds: readonly Uuid[];
  readonly affectedMemberIds: readonly Uuid[];
  readonly firstDetectedAt: IsoTimestamp;
  readonly lastDetectedAt: IsoTimestamp;
  readonly ageDays: number;
  readonly ownerMemberId: Uuid | null;
  readonly recommendedActionTemplate: Localized;
  /** Machine-readable condition that auto-resolves the signal. */
  readonly resolutionCondition: string;
  readonly resolvedAt: IsoTimestamp | null;
  readonly stamp: CalculationStamp;
}
