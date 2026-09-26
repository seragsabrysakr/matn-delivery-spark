/**
 * Pure WIQL builders and result parsers for delivery discovery (ADR-021).
 * Read-only: flat and link queries go through the allowlisted `wiql`
 * endpoint; a saved query is read with GET.
 */
import { escapeWiqlLiteral, MAX_WORK_ITEMS_PER_SPRINT } from "@/lib/azure/wiql";
import { AzureDevOpsError } from "@/lib/azure/errors";

export type DeliveryMappingMode = "work_item_type" | "tag" | "area_path" | "saved_query";

export const DELIVERY_MAPPING_MODES: readonly DeliveryMappingMode[] = [
  "work_item_type",
  "tag",
  "area_path",
  "saved_query",
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates and normalizes a mapping value; throws `invalid_configuration`. */
export function normalizeMappingValue(mode: DeliveryMappingMode, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 400)
    throw new AzureDevOpsError("invalid_configuration");
  if (mode === "saved_query") {
    // Accept a bare id or a query URL that contains it.
    const match = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(trimmed);
    if (!match || !GUID.test(match[0])) throw new AzureDevOpsError("invalid_configuration");
    return match[0].toLowerCase();
  }
  escapeWiqlLiteral(trimmed);
  return trimmed;
}

/** Flat query for the deliverable roots of a type, tag or area mapping. */
export function buildRootsWiql(input: {
  readonly mode: Exclude<DeliveryMappingMode, "saved_query">;
  readonly value: string;
  readonly projectName: string;
}): string {
  const project = `[System.TeamProject] = '${escapeWiqlLiteral(input.projectName)}'`;
  const value = escapeWiqlLiteral(input.value);
  const condition =
    input.mode === "work_item_type"
      ? `[System.WorkItemType] = '${value}'`
      : input.mode === "tag"
        ? `[System.Tags] CONTAINS '${value}'`
        : `[System.AreaPath] UNDER '${value}'`;
  return `SELECT [System.Id] FROM WorkItems WHERE ${project} AND ${condition} ORDER BY [System.Id]`;
}

/** Recursive hierarchy query: every descendant of the given roots. */
export function buildDescendantsWiql(rootIds: readonly number[]): string {
  const ids = rootIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) throw new AzureDevOpsError("invalid_configuration");
  return [
    "SELECT [System.Id] FROM WorkItemLinks",
    `WHERE ([Source].[System.Id] IN (${ids.join(", ")}))`,
    "AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')",
    "MODE (Recursive)",
  ].join(" ");
}

export interface WiqlResult {
  readonly workItems?: readonly { readonly id: number }[];
  readonly workItemRelations?: readonly {
    readonly rel?: string | null;
    readonly source?: { readonly id: number } | null;
    readonly target?: { readonly id: number } | null;
  }[];
}

/**
 * Deliverable roots from a query result. A flat result lists them directly;
 * a tree result's roots are the entries without a source.
 */
export function rootsFromResult(result: WiqlResult): number[] {
  if (result.workItemRelations && result.workItemRelations.length > 0) {
    return unique(
      result.workItemRelations.filter((r) => !r.source && r.target).map((r) => r.target!.id),
    );
  }
  return unique((result.workItems ?? []).map((w) => w.id));
}

/**
 * Area mappings return every item in the area; the deliverables are the ones
 * whose parent is not itself in that set.
 */
export function topLevelOnly(
  ids: readonly number[],
  parentOf: ReadonlyMap<number, number | null>,
): number[] {
  const inSet = new Set(ids);
  return ids.filter((id) => {
    const parent = parentOf.get(id) ?? null;
    return parent === null || !inSet.has(parent);
  });
}

/** Every item id in a link-query result (roots and all descendants). */
export function idsFromLinks(result: WiqlResult): number[] {
  const ids: number[] = [];
  for (const relation of result.workItemRelations ?? []) {
    if (relation.source) ids.push(relation.source.id);
    if (relation.target) ids.push(relation.target.id);
  }
  return unique(ids);
}

/** Caps discovery at the shared ceiling and says whether it was reached. */
export function capIds(ids: readonly number[]): { ids: number[]; truncated: boolean } {
  return {
    ids: ids.slice(0, MAX_WORK_ITEMS_PER_SPRINT),
    truncated: ids.length > MAX_WORK_ITEMS_PER_SPRINT,
  };
}

const unique = (ids: readonly number[]) =>
  [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
