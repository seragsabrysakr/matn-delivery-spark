import type { KpiValue, Localized, Measure, Uuid, WorkItemAlias } from "@/types/domain";
import type { DashboardContractBase, Section } from "./shared";
import type { FunnelStageContract, SprintTrajectoryContract } from "./overview-contract";

export interface BurnSeriesPoint {
  readonly workingDay: number;
  readonly date: string;
  readonly remaining: number | null;
  readonly completed: number | null;
  readonly scope: number | null;
  readonly ideal: number;
}

export interface ScopeChangeEntry {
  readonly workItemId: Uuid;
  readonly azureWorkItemId: number;
  readonly title: string;
  readonly alias: WorkItemAlias;
  readonly changeType: "added" | "removed";
  readonly estimate: number | null;
  readonly occurredAt: string;
  readonly afterIterationStart: boolean;
}

export interface FlowMetricsContract {
  readonly cycleTimeDays: Measure;
  readonly leadTimeDays: Measure;
  readonly throughputPerWeek: Measure;
  readonly workInProgress: Measure;
  readonly flowEfficiency: Measure;
}

/** Payload backing the Delivery page. */
export interface DeliveryContract extends DashboardContractBase {
  readonly kpis: Section<readonly KpiValue[]>;
  readonly burndown: Section<readonly BurnSeriesPoint[]>;
  readonly burnup: Section<readonly BurnSeriesPoint[]>;
  readonly trajectory: Section<SprintTrajectoryContract>;
  readonly funnel: Section<readonly FunnelStageContract[]>;
  readonly scopeChanges: Section<readonly ScopeChangeEntry[]>;
  readonly flow: Section<FlowMetricsContract>;
  readonly velocityHistory: Section<
    readonly { readonly iteration: Localized; readonly completed: number }[]
  >;
}
