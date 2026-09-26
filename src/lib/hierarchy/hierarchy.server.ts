/**
 * Server-only project hierarchy (ADR-024): every synchronized work item of
 * the selected sprint's project, as a tree with roll-ups. Read-only; nothing
 * here calls Azure DevOps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { StateCategory } from "@/types/domain/work-item";
import {
  buildHierarchy,
  type BacklogLevel,
  type HierarchyInput,
  type HierarchyPayloadStats,
  type HierarchyRow,
} from "./hierarchy-rules";

const PAGE = 1_000;

/** Used only until Azure backlog levels are synchronized for the project. */
const LEVEL_BY_ALIAS: Record<string, BacklogLevel> = {
  epic: "portfolio",
  feature: "portfolio",
  story: "requirement",
  requirement: "requirement",
  task: "task",
  bug: "bug",
};

export interface HierarchyPayload {
  readonly projectName: string;
  readonly rows: readonly HierarchyRow[];
  readonly stats: HierarchyPayloadStats;
  /** True when levels come from Azure's process configuration (not the fallback). */
  readonly levelsFromAzure: boolean;
}

export async function buildProjectHierarchy(
  target: ResolvedTeamIteration,
): Promise<HierarchyPayload> {
  const [types, members] = await Promise.all([
    supabaseAdmin
      .from("az_work_item_types")
      .select("name, backlog_level")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("is_deleted", false),
    supabaseAdmin
      .from("core_members")
      .select("id, display_name")
      .eq("tenant_id", target.tenantId)
      .eq("organization_id", target.organizationId),
  ]);
  const levelByType = new Map(
    (types.data ?? [])
      .filter((t) => t.backlog_level)
      .map((t) => [t.name.toLowerCase(), t.backlog_level as BacklogLevel]),
  );
  const memberName = new Map((members.data ?? []).map((m) => [m.id, m.display_name]));

  const items: HierarchyInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("az_work_items")
      .select(
        "azure_work_item_id, parent_azure_work_item_id, azure_work_item_type, alias, title, state, state_category, counts_toward_scope, estimate, remaining_work, iteration_path, closed_date, team_id, assigned_to_member_id, board_column, is_blocked, tags, azure_url, changed_at_source",
      )
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("is_deleted", false)
      .order("azure_work_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) {
      const type = row.azure_work_item_type;
      items.push({
        azureId: Number(row.azure_work_item_id),
        parentAzureId:
          row.parent_azure_work_item_id === null ? null : Number(row.parent_azure_work_item_id),
        type,
        title: row.title,
        state: row.state,
        stateCategory: row.state_category as StateCategory,
        countsTowardScope: row.counts_toward_scope,
        estimate: row.estimate === null ? null : Number(row.estimate),
        remainingWork: row.remaining_work === null ? null : Number(row.remaining_work),
        iterationPath: row.iteration_path,
        closedDate: row.closed_date,
        teamId: row.team_id,
        backlogLevel:
          levelByType.size > 0
            ? (levelByType.get(type.toLowerCase()) ?? null)
            : (LEVEL_BY_ALIAS[row.alias ?? ""] ?? null),
        assignee: row.assigned_to_member_id
          ? (memberName.get(row.assigned_to_member_id) ?? null)
          : null,
        boardColumn: row.board_column,
        isBlocked: row.is_blocked,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        azureUrl: row.azure_url,
        changedAt: row.changed_at_source,
      });
    }
    if ((data ?? []).length < PAGE) break;
  }

  const { rows, stats } = buildHierarchy(items);
  return {
    projectName: target.azureProjectName,
    rows,
    stats,
    levelsFromAzure: levelByType.size > 0,
  };
}
