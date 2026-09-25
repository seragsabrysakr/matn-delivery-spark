import type {
  CustomFields,
  JsonValue,
  Localized,
  RecordMeta,
  SourceTracked,
  TenantScoped,
  Uuid,
} from "./common";

/** Azure process template family; custom inherited processes map onto a base. */
export type ProcessTemplateKind = "agile" | "scrum" | "cmmi" | "basic" | "custom";

/** Roll-up strategy used to avoid double-counting estimates. */
export type RollupMode = "leaf_only" | "parent_only" | "process_mapping" | "story_level";

/** How bugs participate in delivery metrics. */
export type BugHandlingMode = "as_requirement" | "as_task" | "excluded";

/** Configurable normalization contract per project (or per team override). */
export interface ProcessMapping {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly projectId: Uuid;
  readonly kind: ProcessTemplateKind;
  /** Azure work item type name -> normalized alias (e.g. "Product Backlog Item" -> "story"). */
  readonly workItemTypeAliases: Readonly<Record<string, string>>;
  /** Azure state name -> normalized state category. */
  readonly stateCategoryMap: Readonly<
    Record<string, "proposed" | "inProgress" | "resolved" | "completed" | "removed">
  >;
  readonly doneStates: readonly string[];
  readonly activeStates: readonly string[];
  /** Ordered candidate reference names used to detect blocked items. */
  readonly blockedFields: readonly string[];
  /** Ordered candidate reference names for the estimate (first non-null wins). */
  readonly estimateFields: readonly string[];
  readonly severityField: string | null;
  readonly bugHandlingMode: BugHandlingMode;
  readonly rollupMode: RollupMode;
  /** Allowed parent type per child alias, e.g. { task: ["story","bug"] }. */
  readonly hierarchyRules: Readonly<Record<string, readonly string[]>>;
  readonly notes: JsonValue;
}

/** Azure DevOps team project. Current-state record. */
export interface Project extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  /** Azure project GUID — required and unique within an organization. */
  readonly azureProjectId: string;
  readonly azureProjectName: string;
  readonly name: Localized;
  readonly description: string | null;
  readonly processTemplateKind: ProcessTemplateKind;
  /** Azure process template name as reported, may be a custom inherited process. */
  readonly processTemplateName: string | null;
  readonly processMappingId: Uuid | null;
  readonly visibility: "private" | "public" | null;
  readonly state: "wellFormed" | "createPending" | "deleting" | "unknown";
  readonly customFields: CustomFields;
}
