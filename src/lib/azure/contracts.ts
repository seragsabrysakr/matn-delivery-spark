/** Client-safe DTOs returned by the Azure DevOps server operations. */
import type { AzureErrorCode, AzureFailure } from "./errors";

export type ConnectionStatus = "unconfigured" | "pending" | "connected" | "error" | "disabled";

export type ValidationStage =
  | "configuration"
  | "dns_or_connect"
  | "tls"
  | "azure_response"
  | "response_parse"
  | "server_deadline";

export type ValidationOutcome =
  | "connected"
  | "missing_configuration"
  | "invalid_configuration"
  | "invalid_credentials"
  | "insufficient_permissions"
  | "organization_not_found"
  | "request_timeout"
  | "network_unreachable"
  | "provider_unavailable";

/** Sanitized: no provider bodies, headers, secrets, stacks or credentialed URLs. */
export interface ValidationDiagnostic {
  readonly outcome: ValidationOutcome;
  readonly stage: ValidationStage;
  readonly elapsedMs: number;
  readonly httpStatus: number | null;
  readonly projectCount: number | null;
}

export interface ConnectionValidationResult {
  readonly connected: boolean;
  readonly status: ConnectionStatus;
  readonly organization: string | null;
  readonly accessibleProjectCount: number | null;
  readonly checkedAt: string;
  readonly error: AzureFailure | null;
  readonly diagnostic: ValidationDiagnostic | null;
}

export interface DiscoveredProject {
  readonly azureProjectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: string;
  readonly visibility: string | null;
  readonly lastUpdateTime: string | null;
}

export type DiscoveryStatus = "complete" | "partial" | "failed";

/** Sanitized discovery envelope: counts, timing and a warning code only. */
export interface ProjectDiscoveryResult {
  readonly status: DiscoveryStatus;
  readonly projects: readonly DiscoveredProject[];
  readonly projectCount: number;
  readonly pagesFetched: number;
  readonly elapsedMs: number;
  readonly warning: AzureErrorCode | null;
  readonly error: AzureFailure | null;
}

export type SyncDomain =
  | "organization"
  | "projects"
  | "teams"
  | "iterations"
  | "teamIterations"
  | "members"
  | "teamMemberships";

export interface DomainCounts {
  readonly discovered: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly missing: number;
  readonly failed: number;
  readonly complete: boolean;
  readonly freshnessAt: string | null;
  /** True when the domain was skipped because a domain it depends on failed. */
  readonly blocked?: boolean;
  /** Sanitized reason code when the domain is blocked or partial. */
  readonly blockedBy?: SyncDomain | null;
}

export type SyncRunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "skipped";

export interface SyncRunReport {
  readonly runId: string;
  readonly status: SyncRunStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly organization: string;
  readonly totals: DomainCounts;
  readonly domains: Readonly<Record<SyncDomain, DomainCounts>>;
  readonly warnings: readonly string[];
  readonly partialDomains: readonly SyncDomain[];
  readonly nextSafeAction:
    "none" | "retry_sync" | "fix_credentials" | "wait_and_retry" | "contact_admin";
  readonly error: AzureFailure | null;
}

export interface SyncStatusResult {
  readonly configured: boolean;
  readonly organization: string | null;
  readonly connectionStatus: ConnectionStatus;
  readonly lastVerifiedAt: string | null;
  readonly statusMessage: string | null;
  readonly activeRun: { readonly runId: string; readonly startedAt: string | null } | null;
  readonly lastRun: SyncRunReport | null;
  readonly freshness: Readonly<Partial<Record<SyncDomain, string | null>>>;
  readonly canValidate: boolean;
  readonly canSync: boolean;
}

export const SYNC_DOMAINS: readonly SyncDomain[] = [
  "organization",
  "projects",
  "teams",
  "iterations",
  "teamIterations",
  "members",
  "teamMemberships",
];

export const emptyCounts = (): DomainCounts => ({
  discovered: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  missing: 0,
  failed: 0,
  complete: false,
  freshnessAt: null,
  blocked: false,
  blockedBy: null,
});
