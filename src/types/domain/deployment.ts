import type { IsoTimestamp, RecordMeta, SourceTracked, TenantScoped, Uuid } from "./common";

export type DeploymentStatus =
  | "notDeployed"
  | "inProgress"
  | "succeeded"
  | "partiallySucceeded"
  | "failed"
  | "canceled"
  | "skipped"
  | "unknown";

export interface DeploymentApproval {
  readonly approverMemberId: Uuid | null;
  readonly status: "pending" | "approved" | "rejected" | "skipped" | "reassigned";
  readonly decidedAt: IsoTimestamp | null;
  readonly comment: string | null;
}

/** One attempt to deploy one build to one environment. */
export interface Deployment extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly environmentId: Uuid;
  readonly pipelineId: Uuid | null;
  readonly buildId: Uuid | null;
  /** Classic release id or pipeline run id, depending on source. */
  readonly azureDeploymentId: number;
  readonly azureReleaseId: number | null;
  readonly status: DeploymentStatus;
  /** 1 for the first attempt; increments on retry. */
  readonly attempt: number;
  readonly startedAt: IsoTimestamp | null;
  readonly finishedAt: IsoTimestamp | null;
  readonly requestedByMemberId: Uuid | null;
  readonly approvals: readonly DeploymentApproval[];
  readonly isRollback: boolean;
  readonly webUrl: string;
}
