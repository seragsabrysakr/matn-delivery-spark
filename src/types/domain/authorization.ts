/**
 * Authorization model (Phase 2.1).
 * Authorization is evaluated server-side from these records only.
 * Frontend filters are a convenience, never a security boundary.
 */
import type { IsoTimestamp, RecordMeta, TenantScoped, Uuid } from "./common";

export type AppRole =
  | "platform_admin"
  | "tenant_admin"
  | "executive_viewer"
  | "delivery_manager"
  | "team_lead"
  | "contributor"
  | "qa_release_owner"
  | "readonly_viewer";

/** How far a role reaches before scope records are consulted. */
export type RoleScopeKind = "platform" | "tenant" | "project" | "team" | "explicit";

export interface RoleDefinition {
  readonly role: AppRole;
  readonly scopeKind: RoleScopeKind;
  /** True when the role additionally requires rows in the scope tables. */
  readonly requiresExplicitScopes: boolean;
  /** Aggregate-only roles never see per-member detail. */
  readonly aggregatesOnly: boolean;
}

/** Assignment row; roles are never stored on a profile/users table. */
export interface UserRoleAssignment extends TenantScoped, RecordMeta {
  readonly id: Uuid;
  readonly userId: Uuid;
  readonly role: AppRole;
  readonly grantedByUserId: Uuid | null;
  readonly grantedAt: IsoTimestamp;
  readonly revokedAt: IsoTimestamp | null;
}

interface ScopeGrantBase extends TenantScoped, RecordMeta {
  readonly id: Uuid;
  readonly userId: Uuid;
  readonly grantedByUserId: Uuid | null;
  readonly grantedAt: IsoTimestamp;
  /** Null means no expiry. */
  readonly expiresAt: IsoTimestamp | null;
  /** Null while the grant is active; set instead of deleting the row. */
  readonly revokedAt: IsoTimestamp | null;
}

/**
 * Table: `core_user_project_scopes`.
 * Partial unique index: `(tenant_id, user_id, project_id) WHERE revoked_at IS NULL`.
 * Expired-but-open rows are transactionally closed (`revoked_at = now()`) by the
 * grant function before a replacement is inserted, so the index never blocks a
 * legitimate re-grant. See `ScopeGrantLifecycle` below.
 */
export interface UserProjectScope extends ScopeGrantBase {
  readonly projectId: Uuid;
}

/**
 * Table: `core_user_team_scopes`.
 * Partial unique index: `(tenant_id, user_id, team_id) WHERE revoked_at IS NULL`,
 * with the same transactional close-then-insert lifecycle.
 */
export interface UserTeamScope extends ScopeGrantBase {
  readonly teamId: Uuid;
}

/* ------------------------------------------------------------------ */
/* Grant lifecycle (Phase 2.2)                                         */
/* ------------------------------------------------------------------ */

/**
 * One consistent lifecycle for every scope grant.
 *
 * A grant is ACTIVE only when:
 *   `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
 *
 * An expired row is therefore *not* active even though `revoked_at IS NULL`.
 * Such rows are closed (`revoked_at = now()`, `closedReason = "expired"`) inside
 * the same transaction that inserts a replacement, so the partial unique index
 * on `revoked_at IS NULL` stays correct and no duplicate active grant can exist.
 */
export type ScopeGrantState = "active" | "expired_open" | "expired_closed" | "revoked";

export type ScopeGrantCloseReason = "expired" | "revoked_by_admin" | "superseded";

export type ScopeTarget = "project" | "team";

/** Input to the proposed security-definer function `public.grant_scope(...)`. */
export interface ScopeGrantRequest {
  readonly tenantId: Uuid;
  readonly userId: Uuid;
  readonly target: ScopeTarget;
  /** Project id, or the team id when target is "team". */
  readonly targetId: Uuid;
  readonly grantedByUserId: Uuid;
  readonly expiresAt: IsoTimestamp | null;
  /** Caller-supplied key making retries safe. */
  readonly idempotencyKey: string;
  readonly reason: string | null;
}

/** Outcome of a grant attempt. The function is idempotent. */
export type ScopeGrantOutcome =
  "created" | "already_active" | "replaced_expired" | "replaced_revoked";

export interface ScopeGrantResult {
  readonly grantId: Uuid;
  readonly outcome: ScopeGrantOutcome;
  readonly state: ScopeGrantState;
  readonly expiresAt: IsoTimestamp | null;
  /** Rows closed as part of this transaction. */
  readonly closedGrantIds: readonly Uuid[];
  readonly auditEventId: Uuid;
  readonly resolvedAt: IsoTimestamp;
}

/** Documented behaviour the Phase 3 function must satisfy. */
export interface ScopeGrantLifecycle {
  readonly lockStrategy: "advisory_lock_on_user_and_target" | "select_for_update";
  readonly closesExpiredOpenRows: true;
  readonly returnsExistingActiveGrant: true;
  readonly writesAuditEvent: true;
  readonly isIdempotent: true;
  /** Predicate every authorization query must apply. */
  readonly activePredicate: "revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())";
}

/** Resolved, server-side authorization context for one request. */
export interface AuthorizationContext {
  readonly userId: Uuid;
  readonly tenantId: Uuid | null;
  readonly roles: readonly AppRole[];
  readonly isPlatformAdmin: boolean;
  readonly hasFullTenantAccess: boolean;
  /** Empty when access is tenant-wide; otherwise the allowed project ids. */
  readonly projectIds: readonly Uuid[];
  readonly teamIds: readonly Uuid[];
  readonly aggregatesOnly: boolean;
  readonly resolvedAt: IsoTimestamp;
}
