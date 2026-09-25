import type {
  IsoDate,
  IsoTimestamp,
  Measure,
  RecordMeta,
  SourceTracked,
  TenantScoped,
  Uuid,
} from "./common";

/** Per-activity capacity as configured in Azure team capacity. */
export interface ActivityCapacity {
  /** "Development", "Testing", "Design", or "" when unspecified. */
  readonly activity: string;
  readonly hoursPerDay: number;
}

/**
 * Configured capacity for one member in one team-iteration. Current-state record.
 * Table: `core_member_capacity`, keyed on `(tenant_id, team_iteration_id, member_id)`.
 */
export interface MemberCapacity extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  /** Canonical team-sprint reference. The only persisted relationship. */
  readonly teamIterationId: Uuid;
  /** Derived convenience value, copied from the TeamIteration. Never a foreign key on its own. */
  readonly teamId: Uuid;
  /** Derived convenience value, copied from the TeamIteration. Never a foreign key on its own. */
  readonly iterationId: Uuid;
  readonly memberId: Uuid;
  readonly activities: readonly ActivityCapacity[];
  /** Personal days off inside the iteration. */
  readonly daysOff: readonly { readonly start: IsoDate; readonly end: IsoDate }[];
  /** Working days minus team days off minus personal days off. */
  readonly availableWorkingDays: number | null;
  /** availableWorkingDays * sum(activities.hoursPerDay); null when unconfigured. */
  readonly availableCapacityHours: number | null;
  /** True when the member also belongs to other teams in the same iteration. */
  readonly sharedAcrossTeams: boolean;
}

/** Utilization bands are configuration, never hardcoded thresholds. */
export interface UtilizationBands {
  readonly underMaxPercent: number;
  readonly balancedMaxPercent: number;
  readonly nearCapacityMaxPercent: number;
}

export type UtilizationBand = "under" | "balanced" | "near" | "over" | "unknown";

/** Calculated load for one member in one team-iteration. */
export interface MemberLoad {
  readonly memberId: Uuid;
  /** Canonical team-sprint reference. */
  readonly teamIterationId: Uuid;
  /** Derived convenience value. */
  readonly teamId: Uuid;
  /** Derived convenience value. */
  readonly iterationId: Uuid;
  readonly availableCapacityHours: number | null;
  readonly assignedRemainingHours: number | null;
  readonly assignedEstimateHours: number | null;
  readonly activeItemCount: number;
  readonly blockedItemCount: number;
  /** assignedRemainingHours / availableCapacityHours * 100; null when capacity is 0 or unknown. */
  readonly utilizationPercentage: Measure;
  readonly band: UtilizationBand;
  /** Share of assigned items carrying an estimate, 0..1 — qualifies the number above. */
  readonly estimateCoverage: number;
  readonly computedAt: IsoTimestamp;
}
