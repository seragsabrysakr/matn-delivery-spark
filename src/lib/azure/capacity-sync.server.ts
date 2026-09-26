/**
 * Server-only sprint capacity sync (ADR-019). Read-only against Azure DevOps:
 * GET capacities and team days off for one team-sprint, then upsert
 * `core_member_capacity` and the team-sprint calendar. Members Azure no
 * longer lists are tombstoned, never deleted.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { AzureTeamSettings } from "@/types/azure";
import type { AzureDevOpsClient } from "./client.server";
import {
  computeMemberCapacity,
  matchMember,
  normalizeDateRanges,
  weekdaysFromAzure,
} from "./capacity-rules";

export interface CapacitySyncResult {
  /** Members Azure lists on the sprint's capacity page. */
  readonly members: number;
  /** Of those, members with hours per day configured. */
  readonly configured: number;
  /** Listed members not yet synchronized into `core_members`. */
  readonly unmatched: number;
  readonly teamDaysOff: number;
}

export async function syncTeamIterationCapacity(
  target: ResolvedTeamIteration,
  client: AzureDevOpsClient,
  settings: AzureTeamSettings | null,
): Promise<CapacitySyncResult | null> {
  if (!target.azureTeamId) return null;
  const { data: iteration, error } = await supabaseAdmin
    .from("core_iterations")
    .select("azure_iteration_id, start_date, finish_date")
    .eq("tenant_id", target.tenantId)
    .eq("id", target.iterationId)
    .maybeSingle();
  if (error || !iteration?.azure_iteration_id) return null;

  const [capacities, teamDaysOffRaw] = await Promise.all([
    client.listIterationCapacities(
      target.azureProjectId,
      target.azureTeamId,
      iteration.azure_iteration_id,
    ),
    client.getTeamDaysOff(target.azureProjectId, target.azureTeamId, iteration.azure_iteration_id),
  ]);
  const nowIso = new Date().toISOString();
  const workingWeekdays = weekdaysFromAzure(settings?.workingDays) ?? target.workingWeekdays;
  const teamDaysOff = normalizeDateRanges(teamDaysOffRaw.daysOff);

  await supabaseAdmin
    .from("core_team_iterations")
    .update({
      working_weekdays: workingWeekdays,
      non_working_days: teamDaysOff as unknown as Json,
      last_synced_at: nowIso,
    })
    .eq("tenant_id", target.tenantId)
    .eq("id", target.teamIterationId);

  const { data: members } = await supabaseAdmin
    .from("core_members")
    .select("id, azure_descriptor, azure_unique_name")
    .eq("tenant_id", target.tenantId)
    .eq("organization_id", target.organizationId);
  const known = (members ?? []).map((m) => ({
    id: m.id,
    azureDescriptor: m.azure_descriptor,
    azureUniqueName: m.azure_unique_name,
  }));

  const calendar = {
    startDate: iteration.start_date,
    finishDate: iteration.finish_date,
    workingWeekdays,
    teamDaysOff,
  };
  const rows = new Map<string, ReturnType<typeof computeMemberCapacity>>();
  let unmatched = 0;
  for (const entry of capacities) {
    const memberId = matchMember(entry.teamMember ?? {}, known);
    if (!memberId) {
      unmatched += 1;
      continue;
    }
    rows.set(
      memberId,
      computeMemberCapacity(
        { activities: entry.activities ?? [], daysOff: entry.daysOff ?? [] },
        calendar,
      ),
    );
  }

  if (rows.size > 0) {
    const { error: upsertError } = await supabaseAdmin.from("core_member_capacity").upsert(
      [...rows].map(([memberId, capacity]) => ({
        tenant_id: target.tenantId,
        project_id: target.projectId,
        team_iteration_id: target.teamIterationId,
        member_id: memberId,
        capacity_per_day: capacity.capacityPerDay,
        activity: capacity.activity,
        days_off: capacity.daysOff as unknown as Json,
        net_capacity_hours: capacity.netHours,
        source_status: "active" as const,
        is_deleted: false,
        deleted_at_source: null,
        last_seen_at: nowIso,
        updated_at: nowIso,
      })),
      { onConflict: "tenant_id,team_iteration_id,member_id" },
    );
    if (upsertError) throw upsertError;
  }

  // Members Azure stopped listing for this sprint become tombstones.
  const { data: existing } = await supabaseAdmin
    .from("core_member_capacity")
    .select("id, member_id")
    .eq("tenant_id", target.tenantId)
    .eq("team_iteration_id", target.teamIterationId)
    .eq("is_deleted", false);
  const gone = (existing ?? []).filter((row) => !rows.has(row.member_id)).map((row) => row.id);
  if (gone.length > 0) {
    await supabaseAdmin
      .from("core_member_capacity")
      .update({
        source_status: "deleted",
        is_deleted: true,
        deleted_at_source: nowIso,
        updated_at: nowIso,
      })
      .eq("tenant_id", target.tenantId)
      .in("id", gone);
  }

  return {
    members: capacities.length,
    configured: [...rows.values()].filter((c) => c.capacityPerDay > 0).length,
    unmatched,
    teamDaysOff: teamDaysOff.length,
  };
}
