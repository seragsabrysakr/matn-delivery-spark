import type { IsoTimestamp, RecordMeta, SourceTracked, TenantScoped, Uuid } from "./common";

export type BuildStatus =
  "notStarted" | "inProgress" | "completed" | "cancelling" | "postponed" | "unknown";
export type BuildResult = "succeeded" | "partiallySucceeded" | "failed" | "canceled" | "none";

export interface BuildStage {
  readonly name: string;
  readonly status: BuildStatus;
  readonly result: BuildResult | "skipped";
  readonly startedAt: IsoTimestamp | null;
  readonly finishedAt: IsoTimestamp | null;
}

/** A single pipeline run. */
export interface Build extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly pipelineId: Uuid;
  readonly azureBuildId: number;
  readonly buildNumber: string;
  readonly sourceBranch: string;
  readonly sourceVersion: string | null;
  readonly requestedByMemberId: Uuid | null;
  readonly reason: string | null;
  readonly status: BuildStatus;
  /** Null while the run has not completed. */
  readonly result: BuildResult | null;
  readonly queuedAt: IsoTimestamp;
  readonly startedAt: IsoTimestamp | null;
  readonly finishedAt: IsoTimestamp | null;
  readonly durationSeconds: number | null;
  readonly stages: readonly BuildStage[];
  readonly linkedPullRequestId: Uuid | null;
  readonly webUrl: string;
}
