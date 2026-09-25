import type {
  CustomFields,
  IsoTimestamp,
  RecordMeta,
  Severity,
  SourceTracked,
  TenantScoped,
  Uuid,
} from "./common";

/** Normalized type alias; custom types resolve through ProcessMapping. */
export type WorkItemAlias =
  "epic" | "feature" | "story" | "requirement" | "issue" | "bug" | "task" | "testCase" | "custom";

/** Process-independent state category. */
export type StateCategory =
  "proposed" | "inProgress" | "resolved" | "completed" | "removed" | "unknown";

/** Azure relation kinds we normalize. */
export type WorkItemRelationType =
  | "parent"
  | "child"
  | "related"
  | "predecessor"
  | "successor"
  | "duplicate"
  | "duplicateOf"
  | "testedBy"
  | "tests"
  | "affects"
  | "other";

export interface WorkItemRelation extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly sourceWorkItemId: Uuid;
  /** Null when the target lives outside the synced scope (e.g. another project). */
  readonly targetWorkItemId: Uuid | null;
  readonly targetAzureWorkItemId: number;
  readonly relationType: WorkItemRelationType;
  readonly azureRelationName: string;
  /** True when the target project differs from the source project. */
  readonly isCrossProject: boolean;
}

/** Normalized current state of an Azure work item. */
export interface WorkItem extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly teamId: Uuid | null;
  readonly iterationId: Uuid | null;

  /** System.Id — unique within an organization. */
  readonly azureWorkItemId: number;
  /** System.Rev at the time of the last sync. */
  readonly azureRev: number;

  readonly title: string;
  readonly description: string | null;
  /** Raw Azure type name, e.g. "Product Backlog Item". */
  readonly azureWorkItemType: string;
  readonly alias: WorkItemAlias;
  /** Raw Azure state name. */
  readonly state: string;
  readonly stateCategory: StateCategory;
  readonly reason: string | null;

  readonly areaPath: string;
  readonly iterationPath: string;
  readonly tags: readonly string[];

  readonly assignedToMemberId: Uuid | null;
  readonly createdByMemberId: Uuid | null;
  readonly changedByMemberId: Uuid | null;
  readonly createdAtSource: IsoTimestamp;
  readonly changedAtSource: IsoTimestamp;

  readonly activatedDate: IsoTimestamp | null;
  readonly resolvedDate: IsoTimestamp | null;
  readonly closedDate: IsoTimestamp | null;
  readonly stateChangeDate: IsoTimestamp | null;

  readonly priority: number | null;
  readonly severity: Severity | null;
  readonly azureSeverityRaw: string | null;

  /** Normalized estimate in the project's estimate unit. */
  readonly estimate: number | null;
  readonly estimateUnit: "storyPoints" | "hours" | "effort" | null;
  /** Reference name the estimate was read from — traceability. */
  readonly estimateSourceField: string | null;
  readonly remainingWork: number | null;
  readonly completedWork: number | null;
  readonly originalEstimate: number | null;

  readonly isBlocked: boolean;
  /** Reference name that produced isBlocked, or "tag" when derived from a tag. */
  readonly blockedSourceField: string | null;
  /** Timestamp of the transition into blocked — never CreatedDate. */
  readonly blockedSince: IsoTimestamp | null;

  readonly parentWorkItemId: Uuid | null;
  readonly parentAzureWorkItemId: number | null;
  /** Depth from the top of the hierarchy, 0 for roots. */
  readonly hierarchyDepth: number | null;
  readonly isLeaf: boolean;

  /** True when this item counts toward committed scope for its iteration. */
  readonly countsTowardScope: boolean;
  readonly azureUrl: string;
  readonly customFields: CustomFields;
}
