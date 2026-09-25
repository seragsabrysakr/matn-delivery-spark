/**
 * Server-only real Overview assembly.
 *
 * Reads only synchronized rows, applies the deterministic rules, and persists
 * one immutable daily snapshot per Cairo calendar day so trend and scope-change
 * indicators have a real baseline instead of a guess.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import { cairoToday, sprintCalendar } from "@/lib/calendar/cairo";
import {
  buildOverview,
  computeScopeCompletion,
  type BoardFact,
  type MemberFact,
  type OverviewResult,
  type RealWorkItemFact,
  type SnapshotHistoryPoint,
} from "./overview-rules";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";

export interface RealOverviewPayload extends OverviewResult {
  readonly teamIterationId: string;
  readonly iterationName: { readonly en: string; readonly ar: string };
  readonly sprint: {
    readonly startDate: string | null;
    readonly finishDate: string | null;
    readonly currentWorkingDay: number | null;
    readonly totalWorkingDays: number | null;
  };
  readonly workItemCount: number;
}

async function loadFacts(target: ResolvedTeamIteration): Promise<RealWorkItemFact[]> {
  const { data, error } = await supabaseAdmin
    .from("az_work_items")
    .select(
      "id, azure_work_item_id, title, alias, azure_work_item_type, state, state_category, is_blocked, blocked_since, estimate, assigned_to_member_id, counts_toward_scope, state_change_date, changed_at_source, azure_url, board_column, board_column_entered_at",
    )
    .eq("tenant_id", target.tenantId)
    .eq("iteration_id", target.iterationId)
    .eq("is_deleted", false)
    .limit(5000);
  if (error) throw new AzureDevOpsError("unknown");

  return (data ?? []).map((row) => ({
    id: row.id,
    azureWorkItemId: Number(row.azure_work_item_id),
    title: row.title,
    alias: row.alias,
    azureType: row.azure_work_item_type,
    state: row.state,
    stateCategory: row.state_category,
    isBlocked: row.is_blocked,
    blockedSince: row.blocked_since,
    estimate: row.estimate === null ? null : Number(row.estimate),
    assignedToMemberId: row.assigned_to_member_id,
    countsTowardScope: row.counts_toward_scope,
    stateChangeDate: row.state_change_date,
    changedAtSource: row.changed_at_source,
    azureUrl: row.azure_url,
    boardColumn: row.board_column,
    boardColumnEnteredAt: row.board_column_entered_at,
  }));
}

/** The team's synchronized Azure boards with their columns in Azure order. */
async function loadBoards(target: ResolvedTeamIteration): Promise<BoardFact[]> {
  const [boards, columns] = await Promise.all([
    supabaseAdmin
      .from("az_team_boards")
      .select("id, name")
      .eq("tenant_id", target.tenantId)
      .eq("team_id", target.teamId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("az_board_columns")
      .select("id, board_id, name, column_order, column_type, item_limit, state_mappings")
      .eq("tenant_id", target.tenantId)
      .eq("team_id", target.teamId)
      .eq("is_deleted", false)
      .order("column_order", { ascending: true }),
  ]);
  if (boards.error || columns.error) return [];

  return (boards.data ?? []).map((board) => ({
    id: board.id,
    name: board.name,
    columns: (columns.data ?? [])
      .filter((column) => column.board_id === board.id)
      .map((column) => ({
        id: column.id,
        name: column.name,
        columnType:
          column.column_type === "incoming" ||
          column.column_type === "inProgress" ||
          column.column_type === "outgoing"
            ? column.column_type
            : "unknown",
        itemLimit: column.item_limit,
        stateMappings:
          column.state_mappings &&
          typeof column.state_mappings === "object" &&
          !Array.isArray(column.state_mappings)
            ? (Object.fromEntries(
                Object.entries(column.state_mappings).filter(([, v]) => typeof v === "string"),
              ) as Record<string, string>)
            : {},
      })),
  }));
}

async function loadMembers(target: ResolvedTeamIteration): Promise<MemberFact[]> {
  const memberships = await supabaseAdmin
    .from("core_team_memberships")
    .select("member_id")
    .eq("tenant_id", target.tenantId)
    .eq("team_id", target.teamId)
    .eq("is_active", true);
  const memberIds = (memberships.data ?? []).map((row) => row.member_id);
  if (memberIds.length === 0) return [];

  const [members, capacity] = await Promise.all([
    supabaseAdmin.from("core_members").select("id, display_name").in("id", memberIds),
    supabaseAdmin
      .from("core_member_capacity")
      .select("member_id, net_capacity_hours")
      .eq("tenant_id", target.tenantId)
      .eq("team_iteration_id", target.teamIterationId),
  ]);

  const capacityByMember = new Map(
    (capacity.data ?? []).map((row) => [
      row.member_id,
      row.net_capacity_hours === null ? null : Number(row.net_capacity_hours),
    ]),
  );

  return (members.data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    capacityHours: capacityByMember.get(row.id) ?? null,
  }));
}

async function loadHistory(target: ResolvedTeamIteration): Promise<SnapshotHistoryPoint[]> {
  const { data } = await supabaseAdmin
    .from("an_daily_iteration_snapshots")
    .select("snapshot_date, working_day_index, metrics, item_counts")
    .eq("tenant_id", target.tenantId)
    .eq("team_iteration_id", target.teamIterationId)
    .order("snapshot_date", { ascending: true });

  return (data ?? []).map((row) => {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    const counts = (row.item_counts ?? {}) as Record<string, unknown>;
    return {
      snapshotDate: row.snapshot_date,
      workingDay: row.working_day_index ?? 0,
      completedPercent: Number(metrics["scope_completion_percent"] ?? 0),
      scopeTotal: Number(counts["scope_total"] ?? 0),
    };
  });
}

/** Idempotent: one snapshot per (team iteration, Cairo date); never rewrites a finalized row. */
export async function persistDailySnapshot(
  target: ResolvedTeamIteration,
  facts: readonly RealWorkItemFact[],
): Promise<void> {
  const today = cairoToday();
  const calendar = sprintCalendar(
    target.startDate,
    target.finishDate,
    today,
    target.workingWeekdays,
  );
  if (!calendar) return;

  const scope = computeScopeCompletion(facts);
  const blocked = facts.filter((f) => f.isBlocked).length;

  const existing = await supabaseAdmin
    .from("an_daily_iteration_snapshots")
    .select("id, finalized_at")
    .eq("tenant_id", target.tenantId)
    .eq("team_iteration_id", target.teamIterationId)
    .eq("snapshot_date", today)
    .maybeSingle();

  if (existing.data?.finalized_at) return;

  const payload = {
    tenant_id: target.tenantId,
    project_id: target.projectId,
    team_iteration_id: target.teamIterationId,
    iteration_id: target.iterationId,
    team_id: target.teamId,
    snapshot_date: today,
    time_zone: target.timeZone,
    working_day_index: calendar.currentWorkingDay,
    total_working_days: calendar.totalWorkingDays,
    blocked_count: blocked,
    item_counts: {
      scope_total: scope.total,
      scope_completed: scope.completed,
      total: facts.length,
    },
    metrics: {
      scope_completion_percent: scope.percent ?? 0,
      expected_completion_percent: calendar.expectedCompletionPercent,
      basis: scope.basis,
    },
  };

  if (existing.data) {
    await supabaseAdmin
      .from("an_daily_iteration_snapshots")
      .update(payload)
      .eq("id", existing.data.id);
    return;
  }
  await supabaseAdmin.from("an_daily_iteration_snapshots").insert(payload);
}

export async function buildRealOverview(
  target: ResolvedTeamIteration,
): Promise<RealOverviewPayload> {
  const [facts, members, boards] = await Promise.all([
    loadFacts(target),
    loadMembers(target),
    loadBoards(target),
  ]);
  await persistDailySnapshot(target, facts);
  const history = await loadHistory(target);

  const today = cairoToday();
  const calendar = sprintCalendar(
    target.startDate,
    target.finishDate,
    today,
    target.workingWeekdays,
  );

  const lastSync = await supabaseAdmin
    .from("az_work_items")
    .select("last_synced_at")
    .eq("tenant_id", target.tenantId)
    .eq("iteration_id", target.iterationId)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = buildOverview({
    facts,
    members,
    calendar,
    history,
    boards,
    lastSyncedAt: lastSync.data?.last_synced_at ?? null,
    nowIso: new Date().toISOString(),
    iterationId: target.teamIterationId,
  });

  return {
    ...result,
    teamIterationId: target.teamIterationId,
    iterationName: { en: target.iterationNameEn, ar: target.iterationNameAr },
    sprint: {
      startDate: target.startDate,
      finishDate: target.finishDate,
      currentWorkingDay: calendar?.currentWorkingDay ?? null,
      totalWorkingDays: calendar?.totalWorkingDays ?? null,
    },
    workItemCount: facts.length,
  };
}
