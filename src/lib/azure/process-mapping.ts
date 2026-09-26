/**
 * Pure ProcessMapping resolution.
 *
 * Everything the work item reader needs — which Azure types are in scope, which
 * field carries the estimate, which field marks "blocked" — comes from the
 * tenant's `core_process_mappings` row, with documented defaults per template.
 *
 * State categories are resolved in a fixed precedence (ADR-013): explicit tenant
 * configuration, then the state metadata synchronized from Azure, and only then
 * a small English dictionary kept as a last resort. A fallback or unknown
 * result is reported so the sync can raise a data-quality issue.
 */
import type { Database } from "@/integrations/supabase/types";
import type { StateCategory, WorkItemAlias } from "@/types/domain/work-item";
import { lookupAzureStateCategory, type AzureStateIndex } from "./metadata-rules";

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
  /** Tenant-configured overrides only (lower-cased state -> category). */
  readonly stateCategoryMap: Readonly<Record<string, StateCategory>>;
  /** State categories synchronized from Azure for this project, if any. */
  readonly azureStates: AzureStateIndex | null;
  readonly doneStates: readonly string[];
  readonly activeStates: readonly string[];
  readonly blockedFields: readonly string[];
  readonly estimateFields: readonly string[];
  readonly severityField: string | null;
  readonly bugHandlingMode: BugHandlingMode;
  /** True when the tenant set bug handling explicitly; Azure's team setting then does not apply. */
  readonly bugHandlingConfigured: boolean;
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

/** Last resort only: used when neither the tenant nor Azure metadata knows a state. */
const FALLBACK_STATE_CATEGORY: Record<string, StateCategory> = {
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
  azureStates: AzureStateIndex | null = null,
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
  const stateCategoryMap: Record<string, StateCategory> = {};
  for (const [state, category] of Object.entries(configuredStates)) {
    stateCategoryMap[state.toLowerCase()] = category as StateCategory;
  }

  const estimateFields = asStringList(row?.estimate_fields);
  const blockedFields = asStringList(row?.blocked_fields);

  return {
    workItemTypes,
    aliasByType,
    stateCategoryMap,
    azureStates,
    doneStates: asStringList(row?.done_states),
    activeStates: asStringList(row?.active_states),
    blockedFields: blockedFields.length > 0 ? blockedFields : DEFAULT_BLOCKED_FIELDS,
    estimateFields: estimateFields.length > 0 ? estimateFields : DEFAULT_ESTIMATE_FIELDS,
    severityField: row?.severity_field ?? "Microsoft.VSTS.Common.Severity",
    bugHandlingMode,
    bugHandlingConfigured: row !== null,
  };
}

/**
 * Bug handling from the team's own Azure setting (`teamsettings.bugsBehavior`).
 * "asTasks": bugs are planned under stories like tasks, so they are not scope.
 * "off": bugs are not planned on the backlog; they stay synchronized for
 * visibility but are not scope either. Unknown values give no opinion.
 */
export function bugHandlingFromAzure(
  bugsBehavior: string | null | undefined,
): BugHandlingMode | null {
  switch ((bugsBehavior ?? "").toLowerCase()) {
    case "asrequirements":
      return "as_requirement";
    case "astasks":
    case "off":
      return "as_task";
    default:
      return null;
  }
}

/** Explicit tenant configuration wins; otherwise the team's Azure setting; otherwise the mapping default. */
export function effectiveBugHandling(
  mapping: ResolvedProcessMapping,
  teamBugHandling: BugHandlingMode | null | undefined,
): BugHandlingMode {
  if (mapping.bugHandlingConfigured) return mapping.bugHandlingMode;
  return teamBugHandling ?? mapping.bugHandlingMode;
}

export function aliasFor(mapping: ResolvedProcessMapping, azureType: string): WorkItemAlias {
  return mapping.aliasByType[azureType.toLowerCase()] ?? "custom";
}

/** Where a resolved state category came from. */
export type StateCategorySource = "tenant" | "azure" | "fallback" | "none";

export interface ResolvedStateCategory {
  readonly category: StateCategory;
  readonly source: StateCategorySource;
}

export function resolveStateCategory(
  mapping: ResolvedProcessMapping,
  state: string,
  azureType: string | null = null,
): ResolvedStateCategory {
  const key = state.toLowerCase();
  if (mapping.doneStates.some((s) => s.toLowerCase() === key))
    return { category: "completed", source: "tenant" };
  if (mapping.activeStates.some((s) => s.toLowerCase() === key))
    return { category: "inProgress", source: "tenant" };
  const configured = mapping.stateCategoryMap[key];
  if (configured) return { category: configured, source: "tenant" };

  const fromAzure = lookupAzureStateCategory(mapping.azureStates, azureType, state);
  if (fromAzure) return { category: fromAzure, source: "azure" };

  const fallback = FALLBACK_STATE_CATEGORY[key];
  if (fallback) return { category: fallback, source: "fallback" };
  return { category: "unknown", source: "none" };
}

export function stateCategoryFor(
  mapping: ResolvedProcessMapping,
  state: string,
  azureType: string | null = null,
): StateCategory {
  return resolveStateCategory(mapping, state, azureType).category;
}
