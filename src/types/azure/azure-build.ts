import type { AzureIdentityRef } from "./azure-common";

/** GET {org}/{project}/_apis/build/definitions and pipelines API. */
export interface AzurePipelineDefinition {
  readonly id: number;
  readonly name: string;
  readonly path?: string;
  readonly revision?: number;
  readonly queueStatus?: "enabled" | "paused" | "disabled";
  /** 1 = designer/classic, 2 = YAML. */
  readonly type?: "build" | "xaml";
  readonly process?: { readonly type: number };
  readonly repository?: { readonly id: string; readonly defaultBranch?: string };
  readonly _links?: Readonly<Record<string, { readonly href: string }>>;
}

/** GET {org}/{project}/_apis/build/builds */
export interface AzureBuild {
  readonly id: number;
  readonly buildNumber: string;
  readonly status:
    "none" | "inProgress" | "completed" | "cancelling" | "postponed" | "notStarted" | "all";
  readonly result?: "none" | "succeeded" | "partiallySucceeded" | "failed" | "canceled";
  readonly queueTime: string;
  readonly startTime?: string;
  readonly finishTime?: string;
  readonly sourceBranch: string;
  readonly sourceVersion?: string;
  readonly reason?: string;
  readonly requestedFor?: AzureIdentityRef;
  readonly definition: { readonly id: number; readonly name: string };
  readonly project?: { readonly id: string };
  readonly _links?: Readonly<Record<string, { readonly href: string }>>;
}

/** GET {org}/{project}/_apis/build/builds/{id}/timeline */
export interface AzureBuildTimelineRecord {
  readonly id: string;
  readonly type: "Stage" | "Phase" | "Job" | "Task" | "Checkpoint";
  readonly name: string;
  readonly state: "pending" | "inProgress" | "completed";
  readonly result?:
    "succeeded" | "succeededWithIssues" | "failed" | "canceled" | "skipped" | "abandoned";
  readonly startTime?: string;
  readonly finishTime?: string;
}
