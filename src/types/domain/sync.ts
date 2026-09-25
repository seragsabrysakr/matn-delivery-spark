import type { IsoTimestamp, JsonValue, Localized, RecordMeta, TenantScoped, Uuid } from "./common";

export type SyncEntityKind =
  | "organizations"
  | "projects"
  | "teams"
  | "iterations"
  | "members"
  | "capacity"
  | "workItems"
  | "workItemRevisions"
  | "repositories"
  | "pullRequests"
  | "pipelines"
  | "builds"
  | "deployments"
  | "testRuns"
  | "snapshots"
  | "kpis";

export type AuthMode = "pat_readonly" | "entra_oauth_user" | "entra_service_principal";

/** Connection settings. Credentials live in backend secrets, never in this row. */
export interface SyncConnection extends TenantScoped, RecordMeta {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly authMode: AuthMode;
  /** Name of the backend secret holding the credential — never the credential. */
  readonly secretRef: string;
  readonly scopes: readonly string[];
  readonly isReadOnly: true;
  readonly isEnabled: boolean;
  readonly lastVerifiedAt: IsoTimestamp | null;
  readonly rateLimitPerMinute: number | null;
  readonly maxConcurrency: number;
}

export type SyncRunStatus =
  "queued" | "running" | "partially_completed" | "completed" | "failed" | "canceled";

export interface SyncError {
  readonly entityKind: SyncEntityKind;
  readonly azureId: string | null;
  readonly code: string;
  readonly message: string;
  readonly isTransient: boolean;
  readonly occurredAt: IsoTimestamp;
}

export interface RateLimitInfo {
  readonly delayedRequests: number;
  readonly throttledRequests: number;
  readonly retryAfterSecondsMax: number | null;
  /** Azure "X-RateLimit-Remaining" style budget when reported. */
  readonly remainingBudget: number | null;
}

export interface SyncRun extends TenantScoped {
  readonly id: Uuid;
  readonly connectionId: Uuid;
  readonly trigger: "manual" | "schedule" | "backfill" | "webhook";
  readonly scope: readonly SyncEntityKind[];
  readonly projectIds: readonly Uuid[];
  readonly status: SyncRunStatus;
  readonly startedAt: IsoTimestamp;
  readonly completedAt: IsoTimestamp | null;
  readonly recordsRead: number;
  readonly recordsInserted: number;
  readonly recordsUpdated: number;
  readonly recordsSkipped: number;
  readonly errors: readonly SyncError[];
  readonly rateLimit: RateLimitInfo;
  readonly dataQualityIssueIds: readonly Uuid[];
  /** Cursor snapshot allowing safe resumption of a partial run. */
  readonly resumeCursor: JsonValue;
}

/** Persisted incremental position per entity kind and scope. */
export interface SyncCursor extends TenantScoped, RecordMeta {
  readonly id: Uuid;
  readonly connectionId: Uuid;
  readonly entityKind: SyncEntityKind;
  readonly projectId: Uuid | null;
  /** Watermark on ChangedDate; inclusive lower bound with overlap window. */
  readonly changedSince: IsoTimestamp | null;
  /** Azure continuation token when the endpoint supports it. */
  readonly continuationToken: string | null;
  readonly lastSuccessfulRunId: Uuid | null;
  readonly overlapMinutes: number;
}

/**
 * How a sync run reacted to an item that vanished from the source.
 * 404 alone is never enough: a second verification pass is required, and 403
 * is always treated as revoked access, never as deletion.
 */
export interface SourceDisappearanceOutcome {
  readonly entityKind: SyncEntityKind;
  readonly azureId: string;
  readonly entityId: Uuid | null;
  readonly httpStatus: 403 | 404 | null;
  readonly action:
    "tombstoned" | "marked_inaccessible" | "awaiting_verification" | "restored" | "issue_raised";
  readonly verificationPass: 1 | 2;
  readonly effectiveAt: IsoTimestamp;
  /** History (revisions, snapshots, audit) is never deleted, only excluded forward. */
  readonly historyPreserved: true;
}

export type DataQualitySeverity = "critical" | "warning" | "info";

export type DataQualityRuleId =
  | "missing_project_mapping"
  | "unknown_state"
  | "unknown_work_item_type"
  | "missing_estimate"
  | "missing_owner"
  | "invalid_iteration_dates"
  | "finish_before_start"
  | "duplicate_azure_id"
  | "broken_parent_relation"
  | "cross_project_child"
  | "unknown_identity"
  | "negative_capacity"
  | "revision_gap"
  | "estimate_change_without_revision"
  | "snapshot_gap"
  | "deletion_vs_access_ambiguous"
  | "unverified_disappearance"
  | "access_revoked"
  | "orphan_team_iteration"
  | "duplicate_active_scope"
  | "kpi_override_conflict"
  | "inconsistent_sprint_duration"
  | "kpi_input_missing"
  | "partial_synchronization";

export interface DataQualityIssue extends TenantScoped {
  readonly id: Uuid;
  readonly ruleId: DataQualityRuleId;
  readonly severity: DataQualitySeverity;
  readonly entityKind: SyncEntityKind;
  readonly entityId: Uuid | null;
  readonly azureId: string | null;
  readonly field: string | null;
  readonly explanation: Localized;
  readonly firstSeenAt: IsoTimestamp;
  readonly lastSeenAt: IsoTimestamp;
  readonly status: "open" | "acknowledged" | "resolved" | "ignored";
  readonly resolvedAt: IsoTimestamp | null;
}

/** Immutable audit trail for security-relevant events. */
export interface AuditEvent extends TenantScoped {
  readonly id: Uuid;
  readonly actorUserId: Uuid | null;
  readonly actorKind: "user" | "system" | "sync" | "ai";
  readonly action: string;
  readonly entityKind: string;
  readonly entityId: Uuid | null;
  readonly occurredAt: IsoTimestamp;
  readonly ipAddress: string | null;
  readonly metadata: JsonValue;
}
