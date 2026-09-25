import type { HealthStatus, KpiValue, Measure, Uuid } from "@/types/domain";
import type { DashboardContractBase, Section } from "./shared";

export interface PullRequestSummary {
  readonly pullRequestId: Uuid;
  readonly azurePullRequestId: number;
  readonly title: string;
  readonly repository: string;
  readonly authorName: string | null;
  readonly ageHours: number;
  readonly isStale: boolean;
  readonly staleReason:
    "inactivity" | "awaitingReview" | "changesRequested" | "conflict" | "policy" | null;
}

export interface BuildTrendPoint {
  readonly date: string;
  readonly total: number;
  readonly succeeded: number;
  readonly partiallySucceeded: number;
  readonly failed: number;
  readonly canceled: number;
}

export interface DeploymentSummary {
  readonly environment: string;
  readonly lastDeploymentAt: string | null;
  readonly status: HealthStatus;
  readonly failureRate: Measure;
  readonly frequencyPerWeek: Measure;
}

export interface TestSummaryContract {
  readonly executedTests: number;
  readonly passedTests: number;
  readonly failedTests: number;
  readonly passRate: Measure;
  readonly regressionCoverageAvailable: boolean;
}

/** Payload backing the Engineering page. */
export interface EngineeringContract extends DashboardContractBase {
  readonly kpis: Section<readonly KpiValue[]>;
  readonly pullRequests: Section<readonly PullRequestSummary[]>;
  readonly reviewTimeHours: Measure;
  readonly buildTrend: Section<readonly BuildTrendPoint[]>;
  readonly deployments: Section<readonly DeploymentSummary[]>;
  readonly tests: Section<TestSummaryContract>;
}
