/**
 * Shared envelope used by every dashboard page contract.
 * The UI owns the loading state; the contract describes data availability.
 */
import type {
  CalculationStamp,
  FreshnessReport,
  HealthStatus,
  IsoTimestamp,
  Localized,
  Uuid,
} from "@/types/domain";

/** Which selection produced this payload. */
export interface DashboardContext {
  readonly tenantId: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly teamId: Uuid;
  /** The Azure iteration node (project-owned, shared across teams). */
  readonly iterationId: Uuid;
  /** Canonical team-sprint reference. Always present; team/iteration ids are derived. */
  readonly teamIterationId: Uuid;
  readonly labels: {
    readonly organization: Localized;
    readonly project: Localized;
    readonly team: Localized;
    readonly iteration: Localized;
  };
  readonly sprint: {
    readonly currentWorkingDay: number | null;
    readonly totalWorkingDays: number | null;
    readonly startDate: string | null;
    readonly finishDate: string | null;
  };
  /** Mock mode is always explicit — real and mock data are never blended. */
  readonly mode: "mock" | "live";
}

export type SectionAvailability = "ready" | "empty" | "partial" | "unavailable";

/** Every section carries its own availability so one gap cannot fake a full page. */
export interface Section<T> {
  readonly availability: SectionAvailability;
  /** Null whenever availability is "unavailable". */
  readonly data: T | null;
  readonly reason: Localized | null;
}

export interface PartialDataWarning {
  readonly section: string;
  readonly message: Localized;
  readonly severity: "info" | "warning" | "critical";
}

/** Base fields shared by all page contracts. */
export interface DashboardContractBase {
  readonly context: DashboardContext;
  readonly freshness: FreshnessReport;
  readonly generatedAt: IsoTimestamp;
  readonly stamp: CalculationStamp;
  readonly warnings: readonly PartialDataWarning[];
}

export interface StatusCount {
  readonly label: Localized;
  readonly count: number;
  readonly status: HealthStatus;
}
