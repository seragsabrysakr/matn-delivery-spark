import type { IsoTimestamp, RecordMeta, SourceTracked, TenantScoped, Uuid } from "./common";

export interface Repository extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly azureRepositoryId: string;
  readonly name: string;
  readonly defaultBranch: string | null;
  readonly isDisabled: boolean;
  readonly webUrl: string;
}

export type PullRequestStatus = "active" | "completed" | "abandoned" | "notSet";
export type ReviewVote =
  "approved" | "approvedWithSuggestions" | "noVote" | "waitingForAuthor" | "rejected";
export type PolicyStatus =
  "approved" | "queued" | "running" | "rejected" | "broken" | "notApplicable" | "unknown";

export interface PullRequestReview extends TenantScoped, RecordMeta {
  readonly id: Uuid;
  readonly pullRequestId: Uuid;
  readonly reviewerMemberId: Uuid | null;
  readonly isRequired: boolean;
  readonly vote: ReviewVote;
  /** First vote or comment by this reviewer; null when they never engaged. */
  readonly firstResponseAt: IsoTimestamp | null;
  readonly lastVotedAt: IsoTimestamp | null;
  readonly commentCount: number;
}

export interface PullRequest extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly repositoryId: Uuid;
  readonly azurePullRequestId: number;
  readonly title: string;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly createdByMemberId: Uuid | null;
  readonly status: PullRequestStatus;
  readonly isDraft: boolean;
  readonly createdAtSource: IsoTimestamp;
  /** First meaningful review — see docs/data-architecture/kpi-catalog.md. */
  readonly firstMeaningfulReviewAt: IsoTimestamp | null;
  readonly completedAt: IsoTimestamp | null;
  readonly abandonedAt: IsoTimestamp | null;
  readonly lastActivityAt: IsoTimestamp;
  readonly mergeStatus:
    "succeeded" | "conflicts" | "queued" | "rejectedByPolicy" | "notSet" | "failure";
  readonly policyStatus: PolicyStatus;
  readonly linkedWorkItemIds: readonly Uuid[];
  readonly reviewerCount: number;
  readonly webUrl: string;
}

/** Stale detection is configuration, not a constant. */
export interface StalePullRequestPolicy {
  readonly inactivityWorkingHours: number;
  readonly flagAwaitingReview: boolean;
  readonly flagChangesRequested: boolean;
  readonly flagMergeConflict: boolean;
  readonly flagPolicyFailure: boolean;
  readonly ignoreDrafts: boolean;
}
