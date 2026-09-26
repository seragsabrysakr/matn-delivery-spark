/**
 * Server-only Backlog page (ADR-026): the selected sprint's team's open scope
 * items outside its current sprint. Read-only over synchronized data; nothing
 * here calls Azure DevOps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import { localDateOf } from "@/lib/people/people-rules";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { StateCategory } from "@/types/domain/work-item";
import {
  buildBacklog,
  READINESS_CHECKS,
  STALE_AFTER_DAYS,
  type BacklogFlag,
  type BacklogItemInput,
  type BacklogRow,
  type BacklogStats,
} from "./backlog-page-rules";

const PAGE = 1_000;

export interface BacklogPayload {
  readonly teamName: string;
  readonly rows: readonly BacklogRow[];
  readonly stats: BacklogStats;
  readonly staleAfterDays: number;
  readonly readinessChecks: readonly BacklogFlag[];
}

export async function buildBacklogPayload(target: ResolvedTeamIteration): Promise<BacklogPayload> {
  const [iterations, members, team] = await Promise.all([
    supabaseAdmin
      .from("core_iterations")
      .select("id, name_en, start_date, finish_date")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("is_deleted", false),
    supabaseAdmin
      .from("core_members")
      .select("id, display_name")
      .eq("tenant_id", target.tenantId)
      .eq("organization_id", target.organizationId),
    supabaseAdmin
      .from("core_teams")
      .select("name_en")
      .eq("tenant_id", target.tenantId)
      .eq("id", target.teamId)
      .maybeSingle(),
  ]);
  const sprintById = new Map(
    (iterations.data ?? []).map((i) => [
      i.id,
      { name: i.name_en, startDate: i.start_date, finishDate: i.finish_date },
    ]),
  );
  const memberName = new Map((members.data ?? []).map((m) => [m.id, m.display_name]));

  const items: BacklogItemInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("az_work_items")
      .select(
        "azure_work_item_id, parent_azure_work_item_id, azure_work_item_type, title, state, state_category, counts_toward_scope, estimate, assigned_to_member_id, priority, tags, azure_url, created_at_source, changed_at_source, iteration_id",
      )
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("team_id", target.teamId)
      .eq("is_deleted", false)
      .eq("counts_toward_scope", true)
      .not("state_category", "in", "(completed,removed)")
      .order("azure_work_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) {
      items.push({
        azureId: Number(row.azure_work_item_id),
        parentAzureId:
          row.parent_azure_work_item_id === null ? null : Number(row.parent_azure_work_item_id),
        type: row.azure_work_item_type,
        title: row.title,
        state: row.state,
        stateCategory: row.state_category as StateCategory,
        countsTowardScope: row.counts_toward_scope,
        estimate: row.estimate === null ? null : Number(row.estimate),
        assignee: row.assigned_to_member_id
          ? (memberName.get(row.assigned_to_member_id) ?? null)
          : null,
        priority: row.priority,
        tags: Array.isArray(row.tags) ? row.tags : [],
        azureUrl: row.azure_url,
        createdAt: row.created_at_source,
        changedAt: row.changed_at_source,
        sprint: row.iteration_id ? (sprintById.get(row.iteration_id) ?? null) : null,
      });
    }
    if ((data ?? []).length < PAGE) break;
  }

  const nowIso = new Date().toISOString();
  const today = localDateOf(nowIso, target.timeZone) ?? nowIso.slice(0, 10);
  const { rows, stats } = buildBacklog(items, today, nowIso);
  return {
    teamName: team.data?.name_en ?? "",
    rows,
    stats,
    staleAfterDays: STALE_AFTER_DAYS,
    readinessChecks: READINESS_CHECKS,
  };
}
