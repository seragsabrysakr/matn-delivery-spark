/**
 * Server-only sprint board and cross-team stuck work (ADR-025). Read-only
 * over synchronized data; nothing here calls Azure DevOps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TenantContext } from "@/lib/azure/authz.server";
import { cairoToday } from "@/lib/calendar/cairo";
import { computeStuckItems } from "@/lib/overview/overview-rules";
import { loadBoards, loadFacts } from "@/lib/overview/overview.server";
import { defaultStuckSettings, type AgeBasis, type StuckReason } from "@/lib/overview/stuck-rules";
import { pickScheduledSprints } from "@/lib/scheduler/scheduler-rules";
import { requireTeamIteration, type ResolvedTeamIteration } from "@/lib/workspace/context.server";
import { buildSprintBoard, type SprintBoardView } from "./board-rules";

async function memberNames(tenantId: string, organizationId: string) {
  const { data } = await supabaseAdmin
    .from("core_members")
    .select("id, display_name")
    .eq("tenant_id", tenantId)
    .eq("organization_id", organizationId);
  return new Map((data ?? []).map((m) => [m.id, m.display_name]));
}

const settingsFor = (target: ResolvedTeamIteration) =>
  defaultStuckSettings({ workingWeekdays: target.workingWeekdays, timeZone: target.timeZone });

export interface SprintBoardPayload {
  readonly sprintName: string;
  readonly thresholdDays: number;
  readonly view: SprintBoardView;
}

export async function buildSprintBoardPayload(
  target: ResolvedTeamIteration,
): Promise<SprintBoardPayload> {
  const [facts, boards, names] = await Promise.all([
    loadFacts(target),
    loadBoards(target),
    memberNames(target.tenantId, target.organizationId),
  ]);
  const settings = settingsFor(target);
  return {
    sprintName: target.iterationNameEn,
    thresholdDays: settings.thresholdWorkingDays,
    view: buildSprintBoard({
      facts,
      boards,
      memberNames: names,
      nowIso: new Date().toISOString(),
      settings,
    }),
  };
}

export interface StuckRow {
  readonly teamIterationId: string;
  readonly projectName: string;
  readonly teamName: string;
  readonly sprintName: string;
  readonly azureId: number;
  readonly title: string;
  readonly type: string;
  readonly state: string;
  readonly boardColumn: string | null;
  readonly assignee: string | null;
  readonly daysInColumn: number | null;
  readonly ageBasis: AgeBasis | null;
  readonly reasons: readonly StuckReason[];
  readonly azureUrl: string | null;
}

export interface StuckPayload {
  readonly thresholdDays: number;
  readonly sprints: number;
  readonly rows: readonly StuckRow[];
}

/**
 * Stuck work across every team the user can see, in each team's current
 * sprint (its latest started one, per ADR-020), oldest first.
 */
export async function buildStuckAcrossTeams(tenant: TenantContext): Promise<StuckPayload> {
  const { data, error } = await supabaseAdmin
    .from("core_team_iterations")
    .select("id, tenant_id, team_id, core_iterations!inner(start_date, finish_date)")
    .eq("tenant_id", tenant.tenantId)
    .eq("is_deleted", false);
  if (error) throw error;
  const sprints = pickScheduledSprints(
    (data ?? []).map((row) => {
      const iteration = row.core_iterations as unknown as {
        start_date: string | null;
        finish_date: string | null;
      };
      return {
        tenantId: row.tenant_id,
        teamId: row.team_id,
        teamIterationId: row.id,
        startDate: iteration.start_date,
        finishDate: iteration.finish_date,
      };
    }),
    cairoToday(),
  );

  const { data: teams } = await supabaseAdmin
    .from("core_teams")
    .select("id, name_en")
    .eq("tenant_id", tenant.tenantId);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name_en]));

  const rows: StuckRow[] = [];
  let visible = 0;
  const nowIso = new Date().toISOString();
  for (const sprint of sprints) {
    let target: ResolvedTeamIteration;
    try {
      target = await requireTeamIteration(tenant, sprint.teamIterationId);
    } catch {
      continue; // outside the user's scope
    }
    visible += 1;
    const [facts, boards, names] = await Promise.all([
      loadFacts(target),
      loadBoards(target),
      memberNames(target.tenantId, target.organizationId),
    ]);
    for (const { fact, assessment } of computeStuckItems(
      facts,
      boards,
      nowIso,
      settingsFor(target),
    )) {
      rows.push({
        teamIterationId: target.teamIterationId,
        projectName: target.azureProjectName,
        teamName: teamName.get(target.teamId) ?? "",
        sprintName: target.iterationNameEn,
        azureId: fact.azureWorkItemId,
        title: fact.title,
        type: fact.azureType,
        state: fact.state,
        boardColumn: fact.boardColumn,
        assignee: fact.assignedToMemberId ? (names.get(fact.assignedToMemberId) ?? null) : null,
        daysInColumn: assessment.workingDaysInColumn,
        ageBasis: assessment.ageBasis,
        reasons: assessment.reasons,
        azureUrl: fact.azureUrl,
      });
    }
  }
  rows.sort((a, b) => (b.daysInColumn ?? -1) - (a.daysInColumn ?? -1) || a.azureId - b.azureId);
  return {
    thresholdDays: defaultStuckSettings().thresholdWorkingDays,
    sprints: visible,
    rows,
  };
}
