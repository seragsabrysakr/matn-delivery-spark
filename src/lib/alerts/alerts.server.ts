/**
 * Server-only alerts and daily digest (ADR-030). Called from the scheduler
 * tick: detection at most every DETECTION_INTERVAL_MS, the digest once per
 * working day from DIGEST_HOUR. Reads synchronized data only; the one outbound
 * call is the optional Microsoft Teams webhook (MATN_TEAMS_WEBHOOK_URL, a
 * server secret). Nothing here calls Azure DevOps.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { CAIRO_TIME_ZONE, CAIRO_WORKING_WEEKDAYS, cairoToday } from "@/lib/calendar/cairo";
import { loadDeliverySchedule } from "@/lib/delivery/deliverables.server";
import { computeStuckItems } from "@/lib/overview/overview-rules";
import { loadBoards, loadFacts } from "@/lib/overview/overview.server";
import { summarizeSprint } from "@/lib/overview/sprint-summary-rules";
import { defaultStuckSettings } from "@/lib/overview/stuck-rules";
import { pickScheduledSprints, sprintPhase } from "@/lib/scheduler/scheduler-rules";
import {
  resolveScheduledTeamIteration,
  type ResolvedTeamIteration,
} from "@/lib/workspace/context.server";
import {
  deliverableCandidates,
  DETECTION_INTERVAL_MS,
  diffAlerts,
  digestDue,
  isAllowedTeamsWebhook,
  newSince,
  stuckSubject,
  teamsDigestMessage,
  type AlertCandidate,
  type AlertKind,
  type DigestAlert,
  type DigestContent,
  type DigestSprint,
} from "./alert-rules";

const DEFAULT_APP_URL = "https://matn-delivery-spark.lovable.app";

/** Each team's current sprint (latest started, running or late; ADR-028). */
async function currentSprints(tenantId: string): Promise<ResolvedTeamIteration[]> {
  const { data, error } = await supabaseAdmin
    .from("core_team_iterations")
    .select("id, tenant_id, team_id, core_iterations!inner(start_date, finish_date)")
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false);
  if (error) throw error;
  const picked = pickScheduledSprints(
    (data ?? []).map((row) => {
      const it = row.core_iterations as unknown as {
        start_date: string | null;
        finish_date: string | null;
      };
      return {
        tenantId: row.tenant_id,
        teamId: row.team_id,
        teamIterationId: row.id,
        startDate: it.start_date,
        finishDate: it.finish_date,
      };
    }),
    cairoToday(),
  );
  const targets: ResolvedTeamIteration[] = [];
  for (const sprint of picked) {
    try {
      targets.push(await resolveScheduledTeamIteration(tenantId, sprint.teamIterationId));
    } catch {
      // A sprint whose project or team is gone is skipped, not fatal.
    }
  }
  return targets;
}

async function memberNames(tenantId: string): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from("core_members")
    .select("id, display_name")
    .eq("tenant_id", tenantId);
  return new Map((data ?? []).map((m) => [m.id, m.display_name]));
}

async function lastDetection(tenantId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("ntf_detection_runs")
    .select("ran_at")
    .eq("tenant_id", tenantId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.ran_at ?? null;
}

export interface DetectionResult {
  readonly opened: number;
  readonly resolved: number;
  readonly sprints: number;
  readonly projects: number;
  readonly failures: readonly string[];
}

/**
 * Opens alerts for work that became stuck and deliverables that became late
 * or at risk, and resolves the ones that no longer hold. Null when a
 * detection ran less than DETECTION_INTERVAL_MS ago.
 */
export async function detectAlerts(
  tenantId: string,
  nowMs: number = Date.now(),
): Promise<DetectionResult | null> {
  const last = await lastDetection(tenantId);
  if (last && nowMs - Date.parse(last) < DETECTION_INTERVAL_MS) return null;

  const nowIso = new Date(nowMs).toISOString();
  const targets = await currentSprints(tenantId);
  const names = await memberNames(tenantId);
  const failures: string[] = [];

  const stuck: AlertCandidate[] = [];
  const stuckRead = new Set<string>();
  const stuckFailed = new Set<string>();
  for (const target of targets) {
    try {
      const [facts, boards] = await Promise.all([loadFacts(target), loadBoards(target)]);
      const settings = defaultStuckSettings({
        workingWeekdays: target.workingWeekdays,
        timeZone: target.timeZone,
      });
      for (const { fact, assessment } of computeStuckItems(facts, boards, nowIso, settings)) {
        stuck.push({
          projectId: target.projectId,
          teamIterationId: target.teamIterationId,
          kind: "stuck",
          subjectKey: stuckSubject(fact.azureWorkItemId),
          azureWorkItemId: fact.azureWorkItemId,
          deliverableId: null,
          title: fact.title,
          details: {
            assignee: fact.assignedToMemberId ? (names.get(fact.assignedToMemberId) ?? null) : null,
            reasons: assessment.reasons,
            workingDaysInColumn: assessment.workingDaysInColumn,
            ageBasis: assessment.ageBasis,
            boardColumn: fact.boardColumn,
            state: fact.state,
            azureUrl: fact.azureUrl,
            sprintName: target.iterationNameEn,
          },
        });
      }
      stuckRead.add(target.projectId);
    } catch {
      stuckFailed.add(target.projectId);
      failures.push(`stuck:${target.teamIterationId}`);
    }
  }
  // A project is "read" only when every one of its current sprints was read.
  for (const projectId of stuckFailed) stuckRead.delete(projectId);

  const deliverables: AlertCandidate[] = [];
  const deliverablesRead = new Set<string>();
  const byProject = new Map(targets.map((t) => [t.projectId, t]));
  for (const [projectId, target] of byProject) {
    try {
      const schedule = await loadDeliverySchedule(target);
      if (schedule.mapping) {
        deliverables.push(...deliverableCandidates(projectId, schedule.deliverables));
      }
      deliverablesRead.add(projectId);
    } catch {
      failures.push(`deliverables:${projectId}`);
    }
  }

  const { data: openRows, error } = await supabaseAdmin
    .from("ntf_alerts")
    .select("id, project_id, subject_key, kind")
    .eq("tenant_id", tenantId)
    .is("resolved_at", null);
  if (error) throw error;
  const open = (openRows ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    subjectKey: r.subject_key,
    kind: r.kind as AlertKind,
  }));

  const stuckDiff = diffAlerts({
    open: open.filter((a) => a.kind === "stuck"),
    detected: stuck,
    readProjects: stuckRead,
  });
  const deliverableDiff = diffAlerts({
    open: open.filter((a) => a.kind !== "stuck"),
    detected: deliverables,
    readProjects: deliverablesRead,
  });
  const toOpen = [...stuckDiff.toOpen, ...deliverableDiff.toOpen];
  const toResolve = [...stuckDiff.toResolve, ...deliverableDiff.toResolve];

  if (toOpen.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("ntf_alerts").insert(
      toOpen.map((c) => ({
        tenant_id: tenantId,
        project_id: c.projectId,
        team_iteration_id: c.teamIterationId,
        kind: c.kind,
        subject_key: c.subjectKey,
        azure_work_item_id: c.azureWorkItemId,
        deliverable_id: c.deliverableId,
        title: c.title.slice(0, 1000),
        details: c.details as Json,
        detected_at: nowIso,
      })),
    );
    if (insertError) throw insertError;
  }
  if (toResolve.length > 0) {
    const { error: resolveError } = await supabaseAdmin
      .from("ntf_alerts")
      .update({ resolved_at: nowIso })
      .eq("tenant_id", tenantId)
      .in(
        "id",
        toResolve.map((a) => a.id),
      )
      .is("resolved_at", null);
    if (resolveError) throw resolveError;
  }

  const result: DetectionResult = {
    opened: toOpen.length,
    resolved: toResolve.length,
    sprints: targets.length,
    projects: byProject.size,
    failures,
  };
  await supabaseAdmin.from("ntf_detection_runs").insert({
    tenant_id: tenantId,
    ran_at: nowIso,
    opened: result.opened,
    resolved: result.resolved,
    sprints: result.sprints,
    projects: result.projects,
    failures: [...failures],
  });
  return result;
}

async function digestSprints(targets: readonly ResolvedTeamIteration[]): Promise<DigestSprint[]> {
  const today = cairoToday();
  const { data: teams } = targets.length
    ? await supabaseAdmin
        .from("core_teams")
        .select("id, name_en")
        .in(
          "id",
          targets.map((t) => t.teamId),
        )
    : { data: [] as { id: string; name_en: string }[] };
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name_en]));
  const nowIso = new Date().toISOString();
  const out: DigestSprint[] = [];
  for (const target of targets) {
    const [facts, boards] = await Promise.all([loadFacts(target), loadBoards(target)]);
    const summary = summarizeSprint({
      facts,
      startDate: target.startDate,
      finishDate: target.finishDate,
      today,
      workingWeekdays: target.workingWeekdays,
      laterSprintStarted: false,
      members: [],
    });
    out.push({
      projectName: target.azureProjectName,
      teamName: teamName.get(target.teamId) ?? "",
      sprintName: target.iterationNameEn,
      phase: sprintPhase({
        startDate: target.startDate,
        finishDate: target.finishDate,
        today,
        laterSprintStarted: false,
      }),
      workingDaysLeft: summary.workingDaysLeft,
      workingDaysSinceEnd: summary.workingDaysSinceEnd,
      storiesDone: summary.stories.done,
      storiesTotal: summary.stories.total,
      tasksDone: summary.tasks.done,
      tasksTotal: summary.tasks.total,
      stuck: computeStuckItems(
        facts,
        boards,
        nowIso,
        defaultStuckSettings({
          workingWeekdays: target.workingWeekdays,
          timeZone: target.timeZone,
        }),
      ).length,
    });
  }
  return out;
}

export interface DigestResult {
  readonly date: string;
  readonly teamsStatus: "sent" | "failed" | "not_configured";
}

/**
 * Builds the day's digest once, from DIGEST_HOUR on a working day, and posts
 * it to Teams when a webhook is configured. The row insert is the claim: a
 * second scheduler call the same day finds it and does nothing.
 */
export async function sendDailyDigest(
  tenantId: string,
  nowMs: number = Date.now(),
): Promise<DigestResult | null> {
  const { data: previous } = await supabaseAdmin
    .from("ntf_digests")
    .select("digest_date, created_at")
    .eq("tenant_id", tenantId)
    .order("digest_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const date = digestDue({
    nowIso: new Date(nowMs).toISOString(),
    timeZone: CAIRO_TIME_ZONE,
    workingWeekdays: CAIRO_WORKING_WEEKDAYS,
    lastDigestDate: previous?.digest_date ?? null,
  });
  if (!date) return null;

  const [targets, openAlerts, projects] = await Promise.all([
    currentSprints(tenantId),
    supabaseAdmin
      .from("ntf_alerts")
      .select("kind, project_id, title, azure_work_item_id, details, detected_at")
      .eq("tenant_id", tenantId)
      .is("resolved_at", null)
      .order("detected_at", { ascending: false }),
    supabaseAdmin.from("core_projects").select("id, name_en").eq("tenant_id", tenantId),
  ]);
  const projectName = new Map((projects.data ?? []).map((p) => [p.id, p.name_en]));
  const alerts: DigestAlert[] = (openAlerts.data ?? []).map((a) => {
    const details = (a.details ?? {}) as Record<string, unknown>;
    return {
      kind: a.kind as AlertKind,
      projectName: projectName.get(a.project_id) ?? "",
      title: a.title,
      azureWorkItemId: a.azure_work_item_id === null ? null : Number(a.azure_work_item_id),
      azureUrl: typeof details["azureUrl"] === "string" ? (details["azureUrl"] as string) : null,
      detectedAt: a.detected_at,
      details,
    };
  });
  const count = (kind: AlertKind) => alerts.filter((a) => a.kind === kind).length;
  const content: DigestContent = {
    date,
    sprints: await digestSprints(targets),
    newAlerts: newSince(alerts, previous?.created_at ?? null),
    openCounts: {
      stuck: count("stuck"),
      deliverable_late: count("deliverable_late"),
      deliverable_at_risk: count("deliverable_at_risk"),
    },
  };

  const { data: claimed, error } = await supabaseAdmin
    .from("ntf_digests")
    .insert({
      tenant_id: tenantId,
      digest_date: date,
      time_zone: CAIRO_TIME_ZONE,
      content: content as unknown as Json,
    })
    .select("id")
    .maybeSingle();
  // Another call already claimed today's digest.
  if (error?.code === "23505") return null;
  if (error || !claimed) throw error ?? new Error("digest claim failed");

  const webhook = process.env["MATN_TEAMS_WEBHOOK_URL"];
  let teamsStatus: DigestResult["teamsStatus"] = "not_configured";
  let teamsError: string | null = null;
  if (webhook) {
    if (!isAllowedTeamsWebhook(webhook)) {
      teamsStatus = "failed";
      teamsError = "MATN_TEAMS_WEBHOOK_URL is not a Microsoft Teams webhook address";
    } else {
      try {
        const response = await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            teamsDigestMessage(content, process.env["MATN_APP_URL"] ?? DEFAULT_APP_URL),
          ),
          signal: AbortSignal.timeout(15_000),
        });
        teamsStatus = response.ok ? "sent" : "failed";
        if (!response.ok) teamsError = `HTTP ${response.status}`;
      } catch (sendError) {
        teamsStatus = "failed";
        teamsError = sendError instanceof Error ? sendError.message.slice(0, 500) : "send failed";
      }
    }
  }
  await supabaseAdmin
    .from("ntf_digests")
    .update({
      teams_status: teamsStatus,
      teams_error: teamsError,
      teams_sent_at: teamsStatus === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimed.id);
  return { date, teamsStatus };
}
