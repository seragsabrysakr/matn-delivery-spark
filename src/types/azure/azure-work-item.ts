import type { AzureFieldBag, AzureLinks } from "./azure-common";

/** Relation entry on a work item. `rel` examples: System.LinkTypes.Hierarchy-Forward. */
export interface AzureWorkItemRelation {
  readonly rel: string;
  readonly url: string;
  readonly attributes?: AzureFieldBag;
}

/**
 * GET {org}/{project}/_apis/wit/workitems?ids=...&$expand=relations
 * `fields` is a reference-name keyed bag: values are JSON-safe, typed on read.
 */
export interface AzureWorkItem {
  readonly id: number;
  readonly rev: number;
  readonly url: string;
  readonly fields: AzureFieldBag;
  readonly relations?: readonly AzureWorkItemRelation[];
  readonly _links?: AzureLinks;
}

/** POST {org}/{project}/_apis/wit/wiql result. */
export interface AzureWiqlResult {
  readonly queryType: string;
  readonly asOf: string;
  readonly workItems: readonly { readonly id: number; readonly url: string }[];
}

/**
 * GET {org}/{project}/_apis/wit/workitemtypes/{type}/states — and inlined in
 * the work item type itself. `category` is typed loosely on purpose: a value
 * Azure adds later must surface as "unknown", not fail to parse.
 */
export interface AzureWorkItemStateColor {
  readonly name: string;
  readonly color?: string;
  readonly category?: string;
}

/** GET {org}/{project}/_apis/wit/workitemtypes */
export interface AzureWorkItemType {
  readonly name: string;
  readonly referenceName: string;
  readonly description?: string;
  readonly color?: string;
  readonly icon?: { readonly id?: string; readonly url?: string };
  readonly isDisabled?: boolean;
  readonly states?: readonly AzureWorkItemStateColor[];
}

/** Canonical reference names consumed by the mapper. */
export const AZURE_WORK_ITEM_FIELDS = {
  id: "System.Id",
  rev: "System.Rev",
  title: "System.Title",
  description: "System.Description",
  state: "System.State",
  reason: "System.Reason",
  workItemType: "System.WorkItemType",
  teamProject: "System.TeamProject",
  areaPath: "System.AreaPath",
  iterationPath: "System.IterationPath",
  assignedTo: "System.AssignedTo",
  createdBy: "System.CreatedBy",
  createdDate: "System.CreatedDate",
  changedBy: "System.ChangedBy",
  changedDate: "System.ChangedDate",
  tags: "System.Tags",
  parent: "System.Parent",
  priority: "Microsoft.VSTS.Common.Priority",
  severity: "Microsoft.VSTS.Common.Severity",
  activatedDate: "Microsoft.VSTS.Common.ActivatedDate",
  resolvedDate: "Microsoft.VSTS.Common.ResolvedDate",
  closedDate: "Microsoft.VSTS.Common.ClosedDate",
  stateChangeDate: "Microsoft.VSTS.Common.StateChangeDate",
  storyPoints: "Microsoft.VSTS.Scheduling.StoryPoints",
  effort: "Microsoft.VSTS.Scheduling.Effort",
  remainingWork: "Microsoft.VSTS.Scheduling.RemainingWork",
  completedWork: "Microsoft.VSTS.Scheduling.CompletedWork",
  originalEstimate: "Microsoft.VSTS.Scheduling.OriginalEstimate",
  blockedCommon: "Microsoft.VSTS.Common.Blocked",
  blockedCmmi: "Microsoft.VSTS.CMMI.Blocked",
} as const;

export type AzureWorkItemFieldKey = keyof typeof AZURE_WORK_ITEM_FIELDS;
