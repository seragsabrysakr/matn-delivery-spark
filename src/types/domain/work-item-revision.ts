import type { CustomFields, IsoTimestamp, JsonValue, TenantScoped, Uuid } from "./common";
import type { StateCategory } from "./work-item";

/**
 * Immutable revision captured from Azure. Never updated or deleted by later syncs.
 */
export interface WorkItemRevision extends TenantScoped {
  readonly id: Uuid;
  readonly workItemId: Uuid;
  readonly azureWorkItemId: number;
  readonly rev: number;
  readonly revisedAt: IsoTimestamp;
  readonly revisedByMemberId: Uuid | null;

  readonly state: string;
  readonly stateCategory: StateCategory;
  readonly iterationPath: string;
  readonly areaPath: string;
  readonly assignedToMemberId: Uuid | null;
  readonly estimate: number | null;
  readonly remainingWork: number | null;
  readonly isBlocked: boolean;
  readonly tags: readonly string[];

  /** Field-level diff versus the previous revision, JSON-safe. */
  readonly changedFields: Readonly<
    Record<string, { readonly from: JsonValue; readonly to: JsonValue }>
  >;
  readonly customFields: CustomFields;
  readonly ingestedAt: IsoTimestamp;
}

/** Derived, immutable state transition used by cycle time and blocked age. */
export interface WorkItemStateTransition extends TenantScoped {
  readonly id: Uuid;
  readonly workItemId: Uuid;
  readonly fromState: string | null;
  readonly fromCategory: StateCategory | null;
  readonly toState: string;
  readonly toCategory: StateCategory;
  readonly occurredAt: IsoTimestamp;
  readonly byMemberId: Uuid | null;
  /** Hours spent in fromState; null for the first transition. */
  readonly durationHours: number | null;
  readonly sourceRev: number;
}

/** Immutable record of iteration membership changes (scope in / scope out). */
export interface WorkItemScopeChange extends TenantScoped {
  readonly id: Uuid;
  readonly workItemId: Uuid;
  readonly iterationId: Uuid;
  readonly changeType: "added" | "removed";
  readonly occurredAt: IsoTimestamp;
  /** Estimate at the moment of the change — drives Scope Added / Removed. */
  readonly estimateAtChange: number | null;
  /** True when the change happened after the iteration start date. */
  readonly afterIterationStart: boolean;
  readonly sourceRev: number;
}
