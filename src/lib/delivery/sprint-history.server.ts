/**
 * Server-only sprint history for one team (ADR-018): every dated sprint of
 * the team, reconstructed from synchronized Azure revision history.
 * Read-only; nothing here calls Azure DevOps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { StateCategory } from "@/types/domain/work-item";
import {
  averageVelocity,
  computeSprintHistory,
  type HistoryPoint,
  type ItemHistory,
  type SprintHistoryRow,
  type SprintWindow,
} from "./sprint-history-rules";

const PAGE = 1_000;
const ID_CHUNK = 100;

export interface SprintHistoryPayload {
  readonly timeZone: string;
  readonly rows: readonly SprintHistoryRow[];
  readonly averageVelocity: { readonly mean: number; readonly sprints: number } | null;
  /** Scope items considered, and how many have a complete revision history. */
  readonly coverage: { readonly items: number; readonly complete: number };
}

async function loadTeamSprints(target: ResolvedTeamIteration): Promise<SprintWindow[]> {
  const { data: links, error } = await supabaseAdmin
    .from("core_team_iterations")
    .select("iteration_id")
    .eq("tenant_id", target.tenantId)
    .eq("team_id", target.teamId)
    .eq("is_deleted", false);
  if (error) throw new AzureDevOpsError("unknown");
  const ids = (links ?? []).map((row) => row.iteration_id);
  if (ids.length === 0) return [];

  const { data, error: iterationError } = await supabaseAdmin
    .from("core_iterations")
    .select("id, name_en, azure_iteration_path, start_date, finish_date")
    .eq("tenant_id", target.tenantId)
    .in("id", ids)
    .eq("is_deleted", false);
  if (iterationError) throw new AzureDevOpsError("unknown");
  return (data ?? [])
    .filter((row) => row.start_date && row.finish_date)
    .map((row) => ({
      iterationId: row.id,
      name: row.name_en,
      path: row.azure_iteration_path,
      startDate: row.start_date!,
      finishDate: row.finish_date!,
    }));
}

async function loadItemHistories(
  target: ResolvedTeamIteration,
  paths: readonly string[],
): Promise<ItemHistory[]> {
  // Every item that was ever in one of these sprints, per its own history.
  const itemIds = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("az_work_item_revisions")
      .select("work_item_id")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .in("iteration_path", [...paths])
      .order("work_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) itemIds.add(row.work_item_id);
    if ((data ?? []).length < PAGE) break;
  }

  const ids = [...itemIds];
  const histories: ItemHistory[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const [items, revisions] = await Promise.all([
      supabaseAdmin
        .from("az_work_items")
        .select(
          "id, azure_work_item_id, title, counts_toward_scope, azure_rev, revisions_synced_rev",
        )
        .eq("tenant_id", target.tenantId)
        .in("id", chunk),
      loadRevisions(target.tenantId, chunk),
    ]);
    if (items.error) throw new AzureDevOpsError("unknown");
    for (const row of items.data ?? []) {
      const own = revisions.get(row.id) ?? [];
      histories.push({
        workItemId: row.id,
        azureWorkItemId: Number(row.azure_work_item_id),
        title: row.title,
        countsTowardScope: row.counts_toward_scope,
        historyComplete:
          own.some((r) => r.rev === 1) && (row.revisions_synced_rev ?? 0) >= row.azure_rev,
        revisions: own,
      });
    }
  }
  return histories;
}

async function loadRevisions(
  tenantId: string,
  workItemIds: readonly string[],
): Promise<Map<string, HistoryPoint[]>> {
  const byItem = new Map<string, HistoryPoint[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("az_work_item_revisions")
      .select("work_item_id, rev, revised_at, iteration_path, state_category, estimate")
      .eq("tenant_id", tenantId)
      .in("work_item_id", [...workItemIds])
      .order("work_item_id", { ascending: true })
      .order("rev", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) {
      const list = byItem.get(row.work_item_id) ?? [];
      list.push({
        rev: row.rev,
        revisedAt: row.revised_at,
        iterationPath: row.iteration_path,
        stateCategory: row.state_category as StateCategory,
        estimate: row.estimate === null ? null : Number(row.estimate),
      });
      byItem.set(row.work_item_id, list);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return byItem;
}

export async function buildSprintHistory(
  target: ResolvedTeamIteration,
  nowMs: number = Date.now(),
): Promise<SprintHistoryPayload> {
  const sprints = await loadTeamSprints(target);
  const items =
    sprints.length > 0
      ? await loadItemHistories(
          target,
          sprints.map((s) => s.path),
        )
      : [];
  const rows = sprints
    .map((sprint) =>
      computeSprintHistory(items, sprint, target.timeZone, nowMs, target.workingWeekdays),
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const scope = items.filter((item) => item.countsTowardScope);
  return {
    timeZone: target.timeZone,
    rows,
    averageVelocity: averageVelocity(rows),
    coverage: {
      items: scope.length,
      complete: scope.filter((item) => item.historyComplete).length,
    },
  };
}
