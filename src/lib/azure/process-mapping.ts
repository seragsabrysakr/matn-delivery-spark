/**
 * Pure ProcessMapping resolution.
 *
 * Everything the work item reader needs — which Azure types are in scope, which
 * field carries the estimate, which field marks "blocked" — comes from the
 * tenant's `core_process_mappings` row, with documented defaults per template.
 */
import type { Database } from "@/integrations/supabase/types";
import type { StateCategory, WorkItemAlias } from "@/types/domain/work-item";

export type ProcessTemplateKind = Database["public"]["Enums"]["process_template_kind"];
export type BugHandlingMode = Database["public"]["Enums"]["bug_handling_mode"];

export interface ProcessMappingRow {
  readonly work_item_type_aliases: unknown;
  readonly state_category_map: unknown;
  readonly done_states: readonly string[] | null;
  readonly active_states: readonly string[] | null;
  readonly blocked_fields: readonly string[] | null;
  readonly estimate_fields: readonly string[] | null;
  readonly severity_field: string | null;
  readonly bug_handling_mode: BugHandlingMode;
}

export interface ResolvedProcessMapping {
  /** Azure `System.WorkItemType` names included in the sprint scope query. */
  readonly workItemTypes: readonly string[];
  readonly aliasByType: Readonly<Record<string, WorkItemAlias>>;
  readonly stateCategoryMap: Readonly<Record<string, StateCategory>>;
  readonly doneStates: readonly string[];
  readonly activeStates: readonly string[];
  readonly blockedFields: readonly string[];
  readonly estimateFields: readonly string[];
  readonly severityField: string | null;
  readonly bugHandlingMode: BugHandlingMode;
}

const DEFAULT_ALIASES: Record<string, WorkItemAlias> = {
  epic: "epic",
  feature: "feature",
  "user story": "story",
  "product backlog item": "story",
  requirement: "requirement",
  issue: "issue",
  bug: "bug",
  task: "task",
  "test case": "testCase",
};

const DEFAULT_TYPES_BY_KIND: Record<ProcessTemplateKind, readonly string[]> = {
  agile: ["Epic", "Feature", "User Story", "Bug", "Task"],
  scrum: ["Epic", "Feature", "Product Backlog Item", "Bug", "Task"],
  cmmi: ["Epic", "Feature", "Requirement", "Bug", "Task"],
  basic: ["Epic", "Issue", "Task"],
  custom: [
    "Epic",
    "Feature",
    "User Story",
    "Product Backlog Item",
    "Requirement",
    "Issue",
    "Bug",
    "Task",
  ],
};

const DEFAULT_STATE_CATEGORY: Record<string, StateCategory> = {
  new: "proposed",
  proposed: "proposed",
  approved: "proposed",
  "to do": "proposed",
  open: "proposed",
  active: "inProgress",
  committed: "inProgress",
  "in progress": "inProgress",
  doing: "inProgress",
  resolved: "resolved",
  "in review": "resolved",
  testing: "resolved",
  done: "completed",
  closed: "completed",
  completed: "completed",
  removed: "removed",
};

const DEFAULT_ESTIMATE_FIELDS = [
  "Microsoft.VSTS.Scheduling.StoryPoints",
  "Microsoft.VSTS.Scheduling.Effort",
  "Microsoft.VSTS.Scheduling.Size",
];

const DEFAULT_BLOCKED_FIELDS = ["Microsoft.VSTS.Common.Blocked", "Microsoft.VSTS.CMMI.Blocked"];

const asStringRecord = (value: unknown): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>)
    : {};

const asStringList = (value: readonly string[] | null | undefined): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];

export function resolveProcessMapping(
  row: ProcessMappingRow | null,
  templateKind: ProcessTemplateKind = "agile",
): ResolvedProcessMapping {
  const bugHandlingMode = row?.bug_handling_mode ?? "as_requirement";

  const configuredAliases = asStringRecord(row?.work_item_type_aliases);
  const aliasByType: Record<string, WorkItemAlias> = { ...DEFAULT_ALIASES };
  for (const [type, alias] of Object.entries(configuredAliases)) {
    aliasByType[type.toLowerCase()] = alias as WorkItemAlias;
  }

  const configuredTypes = Object.keys(configuredAliases);
  const baseTypes =
    configuredTypes.length > 0 ? configuredTypes : [...DEFAULT_TYPES_BY_KIND[templateKind]];
  const workItemTypes = baseTypes.filter(
    (type) => !(bugHandlingMode === "excluded" && type.toLowerCase() === "bug"),
  );

  const configuredStates = asStringRecord(row?.state_category_map);
  const stateCategoryMap: Record<string, StateCategory> = { ...DEFAULT_STATE_CATEGORY };
  for (const [state, category] of Object.entries(configuredStates)) {
    stateCategoryMap[state.toLowerCase()] = category as StateCategory;
  }

  const estimateFields = asStringList(row?.estimate_fields);
  const blockedFields = asStringList(row?.blocked_fields);

  return {
    workItemTypes,
    aliasByType,
    stateCategoryMap,
    doneStates: asStringList(row?.done_states),
    activeStates: asStringList(row?.active_states),
    blockedFields: blockedFields.length > 0 ? blockedFields : DEFAULT_BLOCKED_FIELDS,
    estimateFields: estimateFields.length > 0 ? estimateFields : DEFAULT_ESTIMATE_FIELDS,
    severityField: row?.severity_field ?? "Microsoft.VSTS.Common.Severity",
    bugHandlingMode,
  };
}

export function aliasFor(mapping: ResolvedProcessMapping, azureType: string): WorkItemAlias {
  return mapping.aliasByType[azureType.toLowerCase()] ?? "custom";
}

export function stateCategoryFor(mapping: ResolvedProcessMapping, state: string): StateCategory {
  const key = state.toLowerCase();
  if (mapping.doneStates.some((s) => s.toLowerCase() === key)) return "completed";
  if (mapping.activeStates.some((s) => s.toLowerCase() === key)) return "inProgress";
  return mapping.stateCategoryMap[key] ?? "unknown";
}
