/**
 * Pure builders for the two — and only two — allowlisted Azure DevOps read
 * POST operations: WIQL and Work Items Batch.
 *
 * No caller may supply a path or a raw body. Paths are derived from the exact
 * synchronized Azure project id; literals are escaped, never interpolated raw.
 */
import { AzureDevOpsError } from "./errors";

/** The complete POST allowlist. Anything else is rejected. */
export const AZURE_READ_POST_KINDS = ["wiql", "workItemsBatch"] as const;
export type AzureReadPostKind = (typeof AZURE_READ_POST_KINDS)[number];

export const MAX_BATCH_IDS = 200;
export const MAX_WORK_ITEMS_PER_SPRINT = 5_000;
export const WORK_ITEM_REQUEST_TIMEOUT_MS = 30_000;
export const WORK_ITEM_ADVANCE_BUDGET_MS = 15_000;

export function isAllowedReadPostKind(kind: string): kind is AzureReadPostKind {
  return (AZURE_READ_POST_KINDS as readonly string[]).includes(kind);
}

/** Escapes a WIQL string literal. Control characters are rejected outright. */
export function escapeWiqlLiteral(value: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new AzureDevOpsError("invalid_configuration");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) throw new AzureDevOpsError("invalid_configuration");
  return value.replace(/'/g, "''");
}

export interface IterationWiqlInput {
  /** Exact synchronized `System.TeamProject` name. */
  readonly projectName: string;
  /** Exact synchronized iteration path, e.g. `Hoteliana\Sprint 1`. */
  readonly iterationPath: string;
  readonly workItemTypes: readonly string[];
}

/**
 * Current-sprint scope query: one project, one iteration subtree, only the
 * work item types the tenant's ProcessMapping declares.
 */
export function buildIterationWiql(input: IterationWiqlInput): string {
  if (input.workItemTypes.length === 0) throw new AzureDevOpsError("invalid_configuration");
  const types = input.workItemTypes.map((type) => `'${escapeWiqlLiteral(type)}'`).join(", ");
  return [
    "SELECT [System.Id] FROM WorkItems",
    `WHERE [System.TeamProject] = '${escapeWiqlLiteral(input.projectName)}'`,
    `AND [System.IterationPath] UNDER '${escapeWiqlLiteral(input.iterationPath)}'`,
    `AND [System.WorkItemType] IN (${types})`,
    "ORDER BY [System.Id]",
  ].join(" ");
}

/** Splits ids into bounded batches and enforces the per-sprint ceiling. */
export function chunkIds(ids: readonly number[], size: number = MAX_BATCH_IDS): number[][] {
  const bounded = Math.min(Math.max(1, Math.trunc(size)), MAX_BATCH_IDS);
  const capped = ids.slice(0, MAX_WORK_ITEMS_PER_SPRINT);
  const chunks: number[][] = [];
  for (let i = 0; i < capped.length; i += bounded) chunks.push(capped.slice(i, i + bounded));
  return chunks;
}

/** The exact MVP field set. Nothing else is requested from Azure. */
export const WORK_ITEM_BATCH_FIELDS: readonly string[] = [
  "System.Id",
  "System.Rev",
  "System.Title",
  "System.Description",
  "System.WorkItemType",
  "System.State",
  "System.Reason",
  "System.AssignedTo",
  "System.CreatedBy",
  "System.ChangedBy",
  "System.CreatedDate",
  "System.ChangedDate",
  "System.AreaPath",
  "System.IterationPath",
  "System.Tags",
  "System.Parent",
  "System.BoardColumn",
  "System.BoardColumnDone",
  "System.BoardLane",
  "Microsoft.VSTS.Common.Priority",
  "Microsoft.VSTS.Common.Severity",
  "Microsoft.VSTS.Common.ActivatedDate",
  "Microsoft.VSTS.Common.ResolvedDate",
  "Microsoft.VSTS.Common.ClosedDate",
  "Microsoft.VSTS.Common.StateChangeDate",
  "Microsoft.VSTS.Scheduling.StoryPoints",
  "Microsoft.VSTS.Scheduling.Effort",
  "Microsoft.VSTS.Scheduling.Size",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
  "Microsoft.VSTS.Scheduling.RemainingWork",
  "Microsoft.VSTS.Scheduling.CompletedWork",
  "Microsoft.VSTS.Scheduling.DueDate",
];

export function buildWorkItemsBatchBody(
  ids: readonly number[],
  extraFields: readonly string[] = [],
): { ids: number[]; fields: string[] } {
  if (ids.length === 0 || ids.length > MAX_BATCH_IDS)
    throw new AzureDevOpsError("invalid_configuration");
  const fields = Array.from(new Set([...WORK_ITEM_BATCH_FIELDS, ...extraFields]));
  return { ids: [...ids], fields };
}
