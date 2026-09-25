/**
 * Pure, dependency-free rules for the resumable foundation sync job.
 * Everything here is deterministic so it can be unit-tested without Azure or the database.
 */
import { SYNC_DOMAINS, type DomainCounts, type SyncDomain, type SyncRunReport } from "./contracts";

/** The order in which domains are processed and checkpointed. */
export const JOB_DOMAIN_ORDER: readonly SyncDomain[] = SYNC_DOMAINS;

/** Domains advanced by the same work unit (one team pass covers both). */
export const PAIRED_DOMAINS: Partial<Record<SyncDomain, SyncDomain>> = {
  iterations: "teamIterations",
  members: "teamMemberships",
};

export interface JobCursor {
  /** Domain currently being processed. */
  readonly domain: SyncDomain;
  /** Zero-based index of the next work unit inside that domain. */
  readonly index: number;
}

/** Per-domain scan progress over its parent scopes (projects / teams). */
export interface ScopeTally {
  readonly expected: number;
  readonly attempted: number;
  readonly completed: number;
  readonly failed: number;
  readonly remainingContinuationTokens: number;
}

export type DomainStatus = "complete" | "partial" | "failed" | "blocked";

/**
 * Status invariants shared by every foundation domain:
 * - complete: every attempted scope finished and no work unit failed
 *   (a successful response with zero records is still complete);
 * - partial: at least one success AND at least one failed/incomplete unit;
 * - failed: no success and at least one explicit failure;
 * - blocked: a required dependency is not complete.
 */
export function domainStatus(counts: DomainCounts, tally?: ScopeTally): DomainStatus {
  if (counts.blocked) return "blocked";
  const incompleteScopes = tally
    ? Math.max(0, tally.expected - tally.completed, tally.attempted - tally.completed)
    : 0;
  if (
    counts.failed === 0 &&
    (!tally ||
      (tally.attempted === tally.expected &&
        tally.completed === tally.expected &&
        tally.failed === 0 &&
        tally.remainingContinuationTokens === 0))
  )
    return "complete";
  const hasSuccess =
    counts.inserted + counts.updated + counts.unchanged > 0 ||
    (tally ? tally.completed > 0 : false);
  return hasSuccess ? "partial" : "failed";
}

/** Sets the completion flag/freshness of a scoped domain from its tally. */
export function finalizeScopedDomain(
  counts: DomainCounts,
  tally: ScopeTally,
  nowIso: string,
): {
  readonly counts: DomainCounts;
  readonly status: DomainStatus;
  readonly incompleteScopes: number;
} {
  const status = domainStatus(counts, tally);
  const complete = status === "complete";
  return {
    counts: {
      ...counts,
      complete,
      freshnessAt: complete ? (counts.freshnessAt ?? nowIso) : counts.freshnessAt,
    },
    status,
    incompleteScopes: Math.max(
      0,
      tally.expected - tally.completed,
      tally.attempted - tally.completed,
    ),
  };
}

export interface JobState extends SyncRunReport {
  readonly cursor: JobCursor | null;
  /** Domains that finished a full successful scan and may be tombstoned. */
  readonly scannedDomains: readonly SyncDomain[];
  /** Scope progress per scoped domain, persisted so resumed runs stay accurate. */
  readonly scopes?: Readonly<Partial<Record<SyncDomain, ScopeTally>>>;
}

/** Time budget for one interactive advance call; well under the hosting deadline. */
export const ADVANCE_BUDGET_MS = 15_000;
/** A run whose lock has not been refreshed within this window is considered stale. */
export const LOCK_TTL_MS = 30 * 60_000;
/** A queued/running run untouched for this long is expired and can be reclaimed. */
export const RUN_STALE_MS = 10 * 60_000;

export const initialCursor = (): JobCursor => ({ domain: "organization", index: 0 });

/** Advances to the next work unit, or to the next domain when the current one is exhausted. */
export function nextCursor(cursor: JobCursor, unitsRemaining: boolean): JobCursor | null {
  if (unitsRemaining) return { domain: cursor.domain, index: cursor.index + 1 };
  const position = JOB_DOMAIN_ORDER.indexOf(cursor.domain);
  let next = position + 1;
  // Paired domains are consumed by their driver domain and never scheduled alone.
  const pairedTargets = new Set(Object.values(PAIRED_DOMAINS));
  while (next < JOB_DOMAIN_ORDER.length && pairedTargets.has(JOB_DOMAIN_ORDER[next]!)) next += 1;
  if (next >= JOB_DOMAIN_ORDER.length) return null;
  return { domain: JOB_DOMAIN_ORDER[next]!, index: 0 };
}

/**
 * Tombstones are only allowed after a domain reached the end of a complete,
 * failure-free scan. Partial, timed-out or failed domains never tombstone.
 */
export function canTombstone(
  counts: Pick<DomainCounts, "failed" | "complete">,
  scanReachedEnd: boolean,
): boolean {
  return scanReachedEnd && counts.complete && counts.failed === 0;
}

/** Derives the terminal status of a finished run from its per-domain counts. */
export function deriveRunStatus(
  domains: Readonly<Record<SyncDomain, DomainCounts>>,
): SyncRunReport["status"] {
  const anyComplete = JOB_DOMAIN_ORDER.some((d) => domains[d].complete);
  const allComplete = JOB_DOMAIN_ORDER.every((d) => domains[d].complete);
  if (allComplete) return "succeeded";
  return anyComplete ? "partial" : "failed";
}

export interface ActiveRunSnapshot {
  readonly runId: string;
  readonly status: SyncRunStatusLike;
  readonly heartbeatAt: string | null;
  readonly expiresAt: string | null;
}

type SyncRunStatusLike = SyncRunReport["status"];

export type StartDecision =
  | { readonly kind: "reuse"; readonly runId: string }
  | { readonly kind: "reclaim"; readonly runId: string }
  | { readonly kind: "start" };

/**
 * Duplicate Start clicks must never create a second run: a live run is reused,
 * a stale one is reclaimed, and only a clean slate starts fresh.
 */
export function decideStart(active: ActiveRunSnapshot | null, nowMs: number): StartDecision {
  if (!active) return { kind: "start" };
  if (active.status !== "queued" && active.status !== "running") return { kind: "start" };
  const expired = active.expiresAt ? Date.parse(active.expiresAt) <= nowMs : false;
  const beat = active.heartbeatAt ? Date.parse(active.heartbeatAt) : Number.NaN;
  const stale = Number.isFinite(beat) ? nowMs - beat > RUN_STALE_MS : true;
  if (expired || stale) return { kind: "reclaim", runId: active.runId };
  return { kind: "reuse", runId: active.runId };
}

export const isLockExpired = (expiresAt: string | null, nowMs: number): boolean =>
  expiresAt ? Date.parse(expiresAt) <= nowMs : true;

/**
 * Domain dependency graph. A domain may only run when every domain it depends
 * on finished a complete, failure-free scan.
 */
export const DOMAIN_DEPENDENCIES: Readonly<Record<SyncDomain, readonly SyncDomain[]>> = {
  organization: [],
  projects: ["organization"],
  teams: ["projects"],
  iterations: ["teams"],
  teamIterations: ["teams"],
  members: ["teams"],
  teamMemberships: ["teams"],
};

/** Returns the first unmet dependency of a domain, or null when it may run. */
export function blockingDependency(
  domain: SyncDomain,
  domains: Readonly<Record<SyncDomain, DomainCounts>>,
): SyncDomain | null {
  for (const dependency of DOMAIN_DEPENDENCIES[domain]) {
    const counts = domains[dependency];
    if (!counts?.complete || counts.failed > 0 || counts.blocked) return dependency;
  }
  return null;
}

/** A blocked domain is never complete, never fresh and never tombstoned. */
export function blockedCounts(counts: DomainCounts, blockedBy: SyncDomain): DomainCounts {
  return { ...counts, complete: false, freshnessAt: null, blocked: true, blockedBy };
}

export const isBlocked = (counts: DomainCounts): boolean => counts.blocked === true;
