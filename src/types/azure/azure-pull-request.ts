import type { AzureIdentityRef } from "./azure-common";

/** GET {org}/{project}/_apis/git/repositories */
export interface AzureRepository {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly defaultBranch?: string;
  readonly isDisabled?: boolean;
  readonly webUrl?: string;
  readonly project: { readonly id: string; readonly name: string };
}

export interface AzurePullRequestReviewer extends AzureIdentityRef {
  /** 10 approved, 5 approved with suggestions, 0 no vote, -5 waiting, -10 rejected. */
  readonly vote: number;
  readonly isRequired?: boolean;
  readonly hasDeclined?: boolean;
}

export interface AzurePullRequestThread {
  readonly id: number;
  readonly publishedDate: string;
  readonly lastUpdatedDate: string;
  readonly isDeleted: boolean;
  readonly comments: readonly {
    readonly id: number;
    readonly author: AzureIdentityRef;
    readonly commentType: "text" | "codeChange" | "system" | "unknown";
    readonly publishedDate: string;
  }[];
}

/** GET {org}/{project}/_apis/git/pullrequests */
export interface AzurePullRequest {
  readonly pullRequestId: number;
  readonly title: string;
  readonly description?: string;
  readonly status: "active" | "completed" | "abandoned" | "notSet" | "all";
  readonly createdBy: AzureIdentityRef;
  readonly creationDate: string;
  readonly closedDate?: string;
  readonly sourceRefName: string;
  readonly targetRefName: string;
  readonly isDraft?: boolean;
  readonly mergeStatus?:
    "succeeded" | "conflicts" | "queued" | "rejectedByPolicy" | "notSet" | "failure";
  readonly reviewers?: readonly AzurePullRequestReviewer[];
  readonly repository: { readonly id: string; readonly name: string };
  readonly workItemRefs?: readonly { readonly id: string; readonly url: string }[];
  readonly url: string;
}
