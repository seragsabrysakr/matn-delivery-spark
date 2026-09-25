import type { AzureIdentityRef } from "./azure-common";

/** Classic release deployment (vsrm.dev.azure.com) or pipelines environment run. */
export interface AzureDeployment {
  readonly id: number;
  readonly releaseId?: number;
  readonly attempt: number;
  readonly deploymentStatus:
    | "notDeployed"
    | "inProgress"
    | "succeeded"
    | "partiallySucceeded"
    | "failed"
    | "all"
    | "undefined";
  readonly operationStatus?: string;
  readonly queuedOn?: string;
  readonly startedOn?: string;
  readonly completedOn?: string;
  readonly requestedBy?: AzureIdentityRef;
  readonly releaseEnvironment: { readonly id: number; readonly name: string };
  readonly release?: { readonly id: number; readonly name: string };
}

/** GET {org}/{project}/_apis/pipelines/environments */
export interface AzureEnvironment {
  readonly id: number;
  readonly name: string;
  readonly description?: string;
}

export interface AzureApproval {
  readonly id: number;
  readonly status:
    "pending" | "approved" | "rejected" | "reassigned" | "skipped" | "canceled" | "undefined";
  readonly approver?: AzureIdentityRef;
  readonly modifiedOn?: string;
  readonly comments?: string;
}
