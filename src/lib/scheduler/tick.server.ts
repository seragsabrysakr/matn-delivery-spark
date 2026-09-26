/**
 * Server-only scheduler tick (ADR-020). Each call performs at most one
 * bounded step for the first current sprint that needs it: advance an active
 * sync run, start a due one, or write the day's snapshot. Syncs run exactly
 * the same code as the manual Sync button, marked `trigger_kind = scheduled`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cairoToday } from "@/lib/calendar/cairo";
import { resolveScheduledTeamIteration } from "@/lib/workspace/context.server";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import { AzureDevOpsClient, hasAzureSecrets } from "@/lib/azure/client.server";
import { normalizeOrganization } from "@/lib/azure/validate.server";
import {
  decideSync,
  pickScheduledSprints,
  SPRINT_SYNC_ORDER,
  type LatestRun,
  type ScheduledSyncKind,
} from "./scheduler-rules";

const SCHEDULER_ACTOR = "scheduler";

const ENTITY_KIND: Readonly<Record<Exclude<ScheduledSyncKind, "foundation">, string>> = {
  sprint: "work_items",
  backlog: "work_items_backlog",
  history: "work_item_history",
};

export interface TickStep {
  readonly tenantId: string;
  readonly teamIterationId: string | null;
  readonly kind: ScheduledSyncKind | "snapshot";
  readonly action: "start" | "advance" | "snapshot";
  readonly runStatus?: string;
  readonly phase?: string;
}

export type TickResult =
  | { readonly status: "idle"; readonly sprints: number; readonly failed: readonly TickStep[] }
  | { readonly status: "working"; readonly step: TickStep };

interface ScheduledSprint {
  readonly tenantId: string;
  readonly teamIterationId: string;
}

async function loadScheduledSprints(): Promise<ScheduledSprint[]> {
  const { data, error } = await supabaseAdmin
    .from("core_team_iterations")
    .select("id, tenant_id, team_id, core_iterations!inner(start_date, finish_date)")
    .eq("selected_for_sync", true)
    .eq("is_deleted", false);
  if (error) throw error;
  return pickScheduledSprints(
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
}

/** Tenants with a synchronized Azure organization. */
async function loadScheduledTenants(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("core_organizations")
    .select("tenant_id")
    .eq("is_deleted", false);
  return [...new Set((data ?? []).map((row) => row.tenant_id))].sort();
}

async function latestFoundationRun(tenantId: string): Promise<LatestRun | null> {
  const { data } = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, started_at, finished_at")
    .eq("tenant_id", tenantId)
    .contains("entity_kinds", ["organization"])
    .order("started_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0];
  return row
    ? { id: row.id, status: row.status, startedAt: row.started_at, finishedAt: row.finished_at }
    : null;
}

/** Projects, teams, iterations and members, so new sprints appear on their own. */
async function foundationStep(tenantId: string, nowMs: number): Promise<TickStep | null> {
  const organizationName = normalizeOrganization(process.env["AZURE_DEVOPS_ORGANIZATION"]);
  if (!hasAzureSecrets() || !organizationName) return null;
  const decision = decideSync(await latestFoundationRun(tenantId), "foundation", nowMs);
  if (decision.action === "wait") return null;
  const { startFoundationJob, advanceFoundationJob } = await import("@/lib/azure/job.server");
  const runId =
    decision.action === "advance"
      ? decision.runId
      : (
          await startFoundationJob({
            tenantId,
            actorUserId: null,
            organizationName,
            trigger: "scheduled",
          })
        ).state.runId;
  const state = await advanceFoundationJob(tenantId, runId, AzureDevOpsClient.fromEnvironment());
  return {
    tenantId,
    teamIterationId: null,
    kind: "foundation",
    action: decision.action,
    runStatus: state.status,
  };
}

async function latestRun(
  target: ResolvedTeamIteration,
  kind: Exclude<ScheduledSyncKind, "foundation">,
): Promise<LatestRun | null> {
  const { data } = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, started_at, finished_at, details")
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
    .contains("entity_kinds", [ENTITY_KIND[kind]])
    .order("started_at", { ascending: false })
    .limit(kind === "sprint" ? 20 : 1);
  const rows = (data ?? []).filter((row) => {
    if (kind !== "sprint") return true;
    const cursor = (row.details as { cursor?: { teamIterationId?: string } } | null)?.cursor;
    return cursor?.teamIterationId === target.teamIterationId;
  });
  const row = rows[0];
  return row
    ? { id: row.id, status: row.status, startedAt: row.started_at, finishedAt: row.finished_at }
    : null;
}

type RunStatus = { runId: string; status: string; cursor: { phase: string } };

async function startRun(
  target: ResolvedTeamIteration,
  kind: Exclude<ScheduledSyncKind, "foundation">,
) {
  if (kind === "sprint") {
    const { startWorkItemSync } = await import("@/lib/azure/work-item-sync.server");
    return (await startWorkItemSync(target, SCHEDULER_ACTOR, "scheduled")) as RunStatus;
  }
  if (kind === "backlog") {
    const { startBacklogSync } = await import("@/lib/azure/backlog-sync.server");
    return (await startBacklogSync(target, SCHEDULER_ACTOR, "scheduled")) as RunStatus;
  }
  const { startHistorySync } = await import("@/lib/azure/history-sync.server");
  return (await startHistorySync(target, SCHEDULER_ACTOR, "scheduled")) as RunStatus;
}

async function advanceRun(
  target: ResolvedTeamIteration,
  kind: Exclude<ScheduledSyncKind, "foundation">,
  runId: string,
): Promise<RunStatus> {
  if (kind === "sprint") {
    const { advanceWorkItemSync } = await import("@/lib/azure/work-item-sync.server");
    return (await advanceWorkItemSync(runId, target)) as RunStatus;
  }
  if (kind === "backlog") {
    const { advanceBacklogSync } = await import("@/lib/azure/backlog-sync.server");
    return (await advanceBacklogSync(runId, target)) as RunStatus;
  }
  const { advanceHistorySync } = await import("@/lib/azure/history-sync.server");
  return (await advanceHistorySync(runId, target)) as RunStatus;
}

async function hasSnapshotToday(target: ResolvedTeamIteration): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("an_daily_iteration_snapshots")
    .select("id")
    .eq("tenant_id", target.tenantId)
    .eq("team_iteration_id", target.teamIterationId)
    .eq("snapshot_date", cairoToday())
    .maybeSingle();
  return Boolean(data);
}

/** Performs at most one bounded step. Call repeatedly until it reports idle. */
export async function runSchedulerTick(nowMs: number = Date.now()): Promise<TickResult> {
  const failed: TickStep[] = [];
  for (const tenantId of await loadScheduledTenants()) {
    try {
      const step = await foundationStep(tenantId, nowMs);
      if (step) return { status: "working", step };
    } catch {
      failed.push({ tenantId, teamIterationId: null, kind: "foundation", action: "advance" });
    }
  }

  const sprints = await loadScheduledSprints();
  // At most one decision per sync scope per tick.
  const projectsDone = new Set<string>();

  for (const sprint of sprints) {
    const target = await resolveScheduledTeamIteration(sprint.tenantId, sprint.teamIterationId);
    if (!target.azureTeamId) continue;

    for (const kind of SPRINT_SYNC_ORDER) {
      // Sprint syncs are per team sprint; backlog and history per project.
      const scopeKey =
        kind === "sprint"
          ? `${kind}:${target.teamIterationId}`
          : `${kind}:${target.tenantId}:${target.projectId}`;
      if (projectsDone.has(scopeKey)) continue;
      projectsDone.add(scopeKey);
      if (kind === "foundation") continue;
      const decision = decideSync(await latestRun(target, kind), kind, nowMs);
      if (decision.action === "wait") continue;
      const step = {
        tenantId: target.tenantId,
        teamIterationId: target.teamIterationId,
        kind,
        action: decision.action,
      };
      try {
        const runId =
          decision.action === "advance" ? decision.runId : (await startRun(target, kind)).runId;
        const status = await advanceRun(target, kind, runId);
        return {
          status: "working",
          step: { ...step, runStatus: status.status, phase: status.cursor.phase },
        };
      } catch {
        // One failing sync never blocks the others; its run stays resumable.
        failed.push(step);
        break;
      }
    }

    if (!(await hasSnapshotToday(target))) {
      const { buildRealOverview } = await import("@/lib/overview/overview.server");
      await buildRealOverview(target);
      return {
        status: "working",
        step: {
          tenantId: target.tenantId,
          teamIterationId: target.teamIterationId,
          kind: "snapshot",
          action: "snapshot",
        },
      };
    }
  }
  return { status: "idle", sprints: sprints.length, failed };
}
