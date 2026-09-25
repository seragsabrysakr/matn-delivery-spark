import type {
  HealthStatus,
  KpiValue,
  Localized,
  Measure,
  Recommendation,
  RiskSignal,
  Uuid,
} from "@/types/domain";
import type { DashboardContractBase, Section } from "./shared";
import type { SprintConfidenceResult } from "@/types/domain/kpi";

/** One point on the sprint trajectory chart. */
export interface TrajectoryPointContract {
  readonly workingDay: number;
  readonly label: string;
  /** Null for future days. */
  readonly actual: number | null;
  readonly expected: number;
  readonly forecast: number | null;
  readonly forecastLow: number | null;
  readonly forecastHigh: number | null;
}

export interface SprintTrajectoryContract {
  readonly points: readonly TrajectoryPointContract[];
  readonly totalWorkingDays: number;
  readonly currentWorkingDay: number;
  readonly forecastCompletion: Measure;
  readonly forecastRange: readonly [number, number] | null;
  readonly accessibleSummary: Localized;
}

export interface FunnelStageContract {
  readonly id: string;
  readonly label: Localized;
  readonly count: number;
  readonly avgDays: number | null;
  readonly status: HealthStatus;
  readonly workItemIds: readonly Uuid[];
}

export interface TeamLoadEntryContract {
  readonly memberId: Uuid;
  readonly name: string;
  readonly role: Localized | null;
  readonly capacityHours: number | null;
  readonly assignedHours: number | null;
  readonly activeItems: number;
  readonly blockedItems: number;
  readonly utilizationPercentage: Measure;
  readonly band: "under" | "balanced" | "near" | "over" | "unknown";
}

export interface EngineeringHealthContract {
  readonly activePullRequests: number;
  readonly stalePullRequests: number;
  readonly medianReviewHours: Measure;
  readonly buildSuccessRate: Measure;
  readonly failedTests: number;
  readonly deployment: {
    readonly status: HealthStatus;
    readonly label: Localized;
    readonly note: Localized;
  };
}

/** Payload backing the approved Overview page. */
export interface OverviewContract extends DashboardContractBase {
  /** Exactly the six primary Overview KPIs, in display order. */
  readonly primaryKpis: Section<readonly KpiValue[]>;
  readonly sprintConfidence: Section<SprintConfidenceResult>;
  readonly trajectory: Section<SprintTrajectoryContract>;
  readonly criticalRisks: Section<readonly RiskSignal[]>;
  readonly funnel: Section<readonly FunnelStageContract[]>;
  readonly teamLoad: Section<readonly TeamLoadEntryContract[]>;
  readonly engineering: Section<EngineeringHealthContract>;
  readonly recommendedActions: Section<readonly Recommendation[]>;
}
