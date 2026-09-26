/**
 * Server-only portfolio (ADR-028): every team the user can see, with its
 * current sprint — the latest started one, late until the next starts — and
 * where it stands. Read-only over synchronized data; nothing here calls Azure.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import type { TenantContext } from "@/lib/azure/authz.server";
import { cairoToday } from "@/lib/calendar/cairo";
import { computeStuckItems } from "@/lib/overview/overview-rules";
import { loadBoards, loadFacts, loadMembers } from "@/lib/overview/overview.server";
import { summarizeSprint } from "@/lib/overview/sprint-summary-rules";
import { defaultStuckSettings } from "@/lib/overview/stuck-rules";
import {
  latestStartedSprints,
  sprintPhase,
  type SprintPhase,
} from "@/lib/scheduler/scheduler-rules";
import { requireTeamIteration, type ResolvedTeamIteration } from "@/lib/workspace/context.server";
import { portfolioStatus, sortPortfolio, type PortfolioStatus } from "./portfolio-rules";

export interface PortfolioRow {
  readonly teamIterationId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly teamId: string;
  readonly projectName: string;
  readonly teamName: string;
  /** "Project · Team", used for ordering and display. */
  readonly name: string;
  readonly sprintName: string;
  readonly startDate: string | null;
  readonly finishDate: string | null;
  readonly phase: SprintPhase;
  readonly status: PortfolioStatus;
  readonly workingDaysLeft: number | null;
  readonly workingDaysSinceEnd: number | null;
  readonly expectedPercent: number | null;
  readonly stories: {
    readonly done: number;
    readonly total: number;
    readonly percent: number | null;
  };
  readonly tasks: {
    readonly done: number;
    readonly total: number;
    readonly percent: number | null;
  };
  readonly stuck: number;
  readonly storiesBehindTasks: number;
}

export interface PortfolioPayload {
  readonly rows: readonly PortfolioRow[];
}

const EMPTY = { done: 0, total: 0, percent: null };

export async function buildPortfolio(tenant: TenantContext): Promise<PortfolioPayload> {
  const { data, error } = await supabaseAdmin
    .from("core_team_iterations")
    .select("id, tenant_id, team_id, core_iterations!inner(start_date, finish_date)")
    .eq("tenant_id", tenant.tenantId)
    .eq("is_deleted", false);
  if (error) throw new AzureDevOpsError("unknown");
  const today = cairoToday();
  const current = latestStartedSprints(
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
    today,
  );

  const [teams, projects] = await Promise.all([
    supabaseAdmin.from("core_teams").select("id, name_en").eq("tenant_id", tenant.tenantId),
    supabaseAdmin.from("core_projects").select("id, name_en").eq("tenant_id", tenant.tenantId),
  ]);
  const teamName = new Map((teams.data ?? []).map((t) => [t.id, t.name_en]));
  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name_en]));

  const rows = await Promise.all(
    current.map(async (sprint): Promise<PortfolioRow | null> => {
      let target: ResolvedTeamIteration;
      try {
        target = await requireTeamIteration(tenant, sprint.teamIterationId);
      } catch {
        return null; // outside the user's scope
      }
      // It is the team's latest started sprint, so no later one has started.
      const phase = sprintPhase({
        startDate: target.startDate,
        finishDate: target.finishDate,
        today,
        laterSprintStarted: false,
      });
      const project = projectName.get(target.projectId) ?? target.azureProjectName;
      const team = teamName.get(target.teamId) ?? "";
      const base = {
        teamIterationId: target.teamIterationId,
        organizationId: target.organizationId,
        projectId: target.projectId,
        teamId: target.teamId,
        projectName: project,
        teamName: team,
        name: `${project} · ${team}`,
        sprintName: target.iterationNameEn,
        startDate: target.startDate,
        finishDate: target.finishDate,
        phase,
      };
      if (phase === "inactive") {
        return {
          ...base,
          status: "idle",
          workingDaysLeft: null,
          workingDaysSinceEnd: null,
          expectedPercent: null,
          stories: EMPTY,
          tasks: EMPTY,
          stuck: 0,
          storiesBehindTasks: 0,
        };
      }

      const settings = defaultStuckSettings({
        workingWeekdays: target.workingWeekdays,
        timeZone: target.timeZone,
      });
      const [facts, boards, members] = await Promise.all([
        loadFacts(target),
        loadBoards(target),
        loadMembers(target),
      ]);
      const summary = summarizeSprint({
        facts,
        startDate: target.startDate,
        finishDate: target.finishDate,
        today,
        workingWeekdays: target.workingWeekdays,
        laterSprintStarted: false,
        members,
      });
      const stuck = computeStuckItems(facts, boards, new Date().toISOString(), settings).length;
      return {
        ...base,
        status: portfolioStatus({
          phase,
          storiesPercent: summary.stories.percent,
          expectedPercent: summary.expectedPercent,
          stuck,
          storiesBehindTasks: summary.storiesBehindTasks.length,
        }),
        workingDaysLeft: summary.workingDaysLeft,
        workingDaysSinceEnd: summary.workingDaysSinceEnd,
        expectedPercent: summary.expectedPercent,
        stories: {
          done: summary.stories.done,
          total: summary.stories.total,
          percent: summary.stories.percent,
        },
        tasks: {
          done: summary.tasks.done,
          total: summary.tasks.total,
          percent: summary.tasks.percent,
        },
        stuck,
        storiesBehindTasks: summary.storiesBehindTasks.length,
      };
    }),
  );

  return { rows: sortPortfolio(rows.filter((r): r is PortfolioRow => r !== null)) };
}
