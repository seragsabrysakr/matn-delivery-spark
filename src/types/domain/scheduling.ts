/**
 * Scheduled synchronization and snapshot contracts (Phase 2.1).
 * Design only — nothing here is implemented or wired to a route in Phase 2.
 */
import type { IsoDate, IsoTimestamp, TenantScoped, TimeZone, Uuid } from "./common";
import type { SyncEntityKind } from "./sync";

/** Signed body of a scheduled trigger. POST only; never called from the client. */
export interface CronTriggerRequest {
  /** Sender clock time; rejected outside the configured skew window. */
  readonly timestamp: IsoTimestamp;
  /** Single-use random value; replays are rejected. */
  readonly nonce: string;
  /** Deduplicates retries of the same logical trigger. */
  readonly idempotencyKey: string;
  readonly organizationId: Uuid;
  readonly tenantId: Uuid;
  readonly scope: readonly SyncEntityKind[];
  /** Logical date the run is for; enables deterministic backfill. */
  readonly logicalDate: IsoDate | null;
  /** Identifier of the signing secret version used (supports rotation). */
  readonly keyId: string;
}

/** HMAC envelope carried in headers, never in the URL. */
export interface CronTriggerSignature {
  readonly algorithm: "HMAC-SHA256";
  readonly keyId: string;
  /** Hex digest over `timestamp.nonce.idempotencyKey.body`. */
  readonly signature: string;
}

export type CronRejectionReason =
  | "missing_signature"
  | "unknown_key_id"
  | "invalid_signature"
  | "clock_skew"
  | "replayed_nonce"
  | "duplicate_idempotency_key"
  | "rate_limited"
  | "lock_held"
  | "disabled_connection"
  | "malformed_body"
  | "wrong_method";

export interface CronTriggerOutcome {
  readonly accepted: boolean;
  readonly reason: CronRejectionReason | null;
  readonly runId: Uuid | null;
  readonly receivedAt: IsoTimestamp;
  /** Every accepted and rejected trigger is audited. */
  readonly auditEventId: Uuid | null;
}

/** At most one active lock per organization. */
export interface SyncLock extends TenantScoped {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly runId: Uuid;
  readonly acquiredAt: IsoTimestamp;
  /** Lock auto-expires so a crashed run cannot block the schedule forever. */
  readonly expiresAt: IsoTimestamp;
  readonly maxExecutionSeconds: number;
  readonly heartbeatAt: IsoTimestamp | null;
}

export type SnapshotFinalizationState = "pending" | "provisional" | "finalized" | "backfilled";

/** Per-team snapshot scheduling configuration. */
export interface SnapshotSchedule extends TenantScoped {
  readonly id: Uuid;
  readonly teamId: Uuid;
  readonly timeZone: TimeZone;
  /** Local time-of-day, after the working-day boundary. Default "00:05". */
  readonly localRunTime: string;
  /** Snapshot business date = the day that just ended in `timeZone`. */
  readonly logicalDateOffsetDays: -1 | 0;
  /** DST: the run is scheduled on local wall-clock time; skipped hours run at the next valid instant, repeated hours run once (idempotency key = logical date). */
  readonly dstPolicy: "wall_clock_once_per_logical_date";
  readonly maxRetries: number;
  readonly retryBackoffSeconds: number;
  /** How far back missed days may be backfilled automatically. */
  readonly backfillWindowDays: number;
}

export interface SnapshotJobRun extends TenantScoped {
  readonly id: Uuid;
  readonly teamId: Uuid;
  readonly logicalDate: IsoDate;
  readonly state: SnapshotFinalizationState;
  readonly attempt: number;
  readonly startedAt: IsoTimestamp;
  readonly completedAt: IsoTimestamp | null;
  /** Unique per `(tenant, team, logicalDate)`; prevents duplicate snapshots. */
  readonly idempotencyKey: string;
  /** Set when the team time zone changed after the day was captured. */
  readonly timeZoneAtCapture: TimeZone;
}
