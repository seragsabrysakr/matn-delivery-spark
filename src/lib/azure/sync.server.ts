/**
 * Server-only foundation synchronization: organization, projects, teams,
 * iterations, team iterations, members and memberships.
 *
 * Guarantees:
 *  - idempotent: re-running produces the same rows (natural-key upserts)
 *  - resumable: one lock + one run row per organization, expired locks reclaimed
 *  - partial-safe: a domain that fails is reported incomplete, never silently empty
 *  - deletion-safe: items missing from a *complete* pass are tombstoned, never hard-deleted
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsClient, mapWithConcurrency } from "./client.server";
import { AzureDevOpsError, toAzureFailure } from "./errors";
import {
  emptyCounts,
  SYNC_DOMAINS,
  type DomainCounts,
  type SyncDomain,
  type SyncRunReport,
} from "./contracts";
import type { Database } from "@/integrations/supabase/types";
import type { AzureProject, AzureTeam } from "@/types/azure";
import { dateOnly, iterationPhase, memberKey, templateFromName } from "./sync-rules";

const LOCK_TTL_MINUTES = 30;
const PROJECT_CONCURRENCY = 4;
const TEAM_CONCURRENCY = 4;

interface MutableCounts {
  discovered: number;
  inserted: number;
  updated: number;
  unchanged: number;
  missing: number;
  failed: number;
  complete: boolean;
  freshnessAt: string | null;
}

const newCounts = (): MutableCounts => ({ ...emptyCounts() });

const freeze = (c: MutableCounts): DomainCounts => ({ ...c });

export interface FoundationSyncInput {
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly organizationName: string;
  readonly client: AzureDevOpsClient;
  readonly now?: () => Date;
}

/** Ensures the organization row exists and returns its internal id. */
export async function ensureOrganization(
  tenantId: string,
  organizationName: string,
  nowIso: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("core_organizations")
    .upsert(
      {
        tenant_id: tenantId,
        azure_organization_name: organizationName,
        base_url: `https://dev.azure.com/${organizationName}`,
        name_en: organizationName,
        name_ar: organizationName,
        source_status: "active",
        is_deleted: false,
        last_seen_at: nowIso,
        last_synced_at: nowIso,
      },
      { onConflict: "tenant_id,azure_organization_name" },
    )
    .select("id")
    .single();
  if (error || !data) throw new AzureDevOpsError("unknown");
  return data.id;
}

export async function ensureConnection(tenantId: string, organizationId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("ops_sync_connections")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await supabaseAdmin
    .from("ops_sync_connections")
    .insert({
      tenant_id: tenantId,
      organization_id: organizationId,
      auth_mode: "pat",
      secret_ref: "AZURE_DEVOPS_PAT",
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !created) throw new AzureDevOpsError("unknown");
  return created.id;
}

/** Releases stale locks, then takes the single active lock for this org. */
async function acquireLock(
  tenantId: string,
  organizationId: string,
  runId: string,
  now: Date,
): Promise<{ acquired: boolean; activeRunId: string | null }> {
  await supabaseAdmin
    .from("ops_sync_locks")
    .update({ released_at: now.toISOString() })
    .eq("tenant_id", tenantId)
    .eq("organization_id", organizationId)
    .is("released_at", null)
    .lt("expires_at", now.toISOString());

  const { error } = await supabaseAdmin.from("ops_sync_locks").insert({
    tenant_id: tenantId,
    organization_id: organizationId,
    run_id: runId,
    acquired_at: now.toISOString(),
    expires_at: new Date(now.getTime() + LOCK_TTL_MINUTES * 60_000).toISOString(),
    holder: "foundation_sync",
  });

  if (!error) return { acquired: true, activeRunId: runId };

  const { data: active } = await supabaseAdmin
    .from("ops_sync_locks")
    .select("run_id")
    .eq("tenant_id", tenantId)
    .eq("organization_id", organizationId)
    .is("released_at", null)
    .limit(1)
    .maybeSingle();
  return { acquired: false, activeRunId: active?.run_id ?? null };
}

async function releaseLock(tenantId: string, runId: string, nowIso: string): Promise<void> {
  await supabaseAdmin
    .from("ops_sync_locks")
    .update({ released_at: nowIso })
    .eq("tenant_id", tenantId)
    .eq("run_id", runId)
    .is("released_at", null);
}

/** Tombstones rows that were not seen during a *complete* pass. */
async function tombstoneMissing(
  table:
    "core_projects" | "core_teams" | "core_iterations" | "core_team_iterations" | "core_members",
  tenantId: string,
  scope: Readonly<Record<string, string>>,
  cutoffIso: string,
): Promise<number> {
  let query = supabaseAdmin
    .from(table)
    .update({ source_status: "deleted", is_deleted: true, deleted_at_source: cutoffIso })
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .lt("last_seen_at", cutoffIso);
  for (const [column, value] of Object.entries(scope)) query = query.eq(column, value);
  const { data } = await query.select("id");
  return data?.length ?? 0;
}

export async function runFoundationSync(input: FoundationSyncInput): Promise<SyncRunReport> {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const startedIso = startedAt.toISOString();
  const runId = crypto.randomUUID();
  const warnings: string[] = [];
  const domains: Record<SyncDomain, MutableCounts> = {
    organization: newCounts(),
    projects: newCounts(),
    teams: newCounts(),
    iterations: newCounts(),
    teamIterations: newCounts(),
    members: newCounts(),
    teamMemberships: newCounts(),
  };

  const buildReport = (
    status: SyncRunReport["status"],
    error: SyncRunReport["error"],
    completedAt: string | null,
  ): SyncRunReport => {
    const totals = newCounts();
    const partial: SyncDomain[] = [];
    for (const domain of SYNC_DOMAINS) {
      const c = domains[domain];
      totals.discovered += c.discovered;
      totals.inserted += c.inserted;
      totals.updated += c.updated;
      totals.unchanged += c.unchanged;
      totals.missing += c.missing;
      totals.failed += c.failed;
      if (!c.complete) partial.push(domain);
    }
    totals.complete = partial.length === 0;
    totals.freshnessAt = completedAt;
    const nextSafeAction: SyncRunReport["nextSafeAction"] =
      error?.code === "invalid_credentials" || error?.code === "not_configured"
        ? "fix_credentials"
        : error?.code === "insufficient_permissions" || error?.code === "forbidden"
          ? "contact_admin"
          : error?.code === "throttled" ||
              error?.code === "unavailable" ||
              error?.code === "timeout"
            ? "wait_and_retry"
            : status === "succeeded"
              ? "none"
              : "retry_sync";
    return {
      runId,
      status,
      startedAt: startedIso,
      completedAt,
      organization: input.organizationName,
      totals: freeze(totals),
      domains: {
        organization: freeze(domains.organization),
        projects: freeze(domains.projects),
        teams: freeze(domains.teams),
        iterations: freeze(domains.iterations),
        teamIterations: freeze(domains.teamIterations),
        members: freeze(domains.members),
        teamMemberships: freeze(domains.teamMemberships),
      },
      warnings: [...warnings],
      partialDomains: partial,
      nextSafeAction,
      error,
    };
  };

  let organizationId: string;
  let connectionId: string;
  try {
    organizationId = await ensureOrganization(input.tenantId, input.organizationName, startedIso);
    connectionId = await ensureConnection(input.tenantId, organizationId);
    domains.organization.discovered = 1;
    domains.organization.updated = 1;
    domains.organization.complete = true;
    domains.organization.freshnessAt = startedIso;
  } catch (error) {
    return buildReport("failed", toAzureFailure(error), now().toISOString());
  }

  const lock = await acquireLock(input.tenantId, organizationId, runId, startedAt);
  if (!lock.acquired) {
    warnings.push("another_run_active");
    return buildReport(
      "skipped",
      new AzureDevOpsError("conflict").toFailure(),
      now().toISOString(),
    );
  }

  await supabaseAdmin.from("ops_sync_runs").insert({
    id: runId,
    tenant_id: input.tenantId,
    connection_id: connectionId,
    organization_id: organizationId,
    trigger_kind: "manual",
    status: "running",
    entity_kinds: [...SYNC_DOMAINS],
    started_at: startedIso,
    correlation_id: runId,
    idempotency_key: `foundation:${organizationId}:${startedIso}`,
  });

  const projectIdByAzureId = new Map<string, string>();
  const memberIdByDescriptor = new Map<string, string>();

  try {
    // ---- projects -----------------------------------------------------
    let azureProjects: AzureProject[] = [];
    try {
      azureProjects = await input.client.listProjects();
      domains.projects.discovered = azureProjects.length;
      const seenIso = now().toISOString();
      for (const project of azureProjects) {
        const { data, error } = await supabaseAdmin
          .from("core_projects")
          .upsert(
            {
              tenant_id: input.tenantId,
              organization_id: organizationId,
              azure_project_id: project.id,
              azure_project_name: project.name,
              name_en: project.name,
              name_ar: project.name,
              description: project.description ?? null,
              process_template_kind: templateFromName(project.name),
              visibility: project.visibility ?? null,
              state: project.state ?? null,
              source_status: "active",
              is_deleted: false,
              last_seen_at: seenIso,
              last_synced_at: seenIso,
            },
            { onConflict: "tenant_id,organization_id,azure_project_id" },
          )
          .select("id, created_at")
          .single();
        if (error || !data) {
          domains.projects.failed += 1;
          continue;
        }
        projectIdByAzureId.set(project.id, data.id);
        if (data.created_at >= startedIso) domains.projects.inserted += 1;
        else domains.projects.updated += 1;
      }
      domains.projects.complete = domains.projects.failed === 0;
      domains.projects.freshnessAt = seenIso;
      if (domains.projects.complete) {
        domains.projects.missing = await tombstoneMissing(
          "core_projects",
          input.tenantId,
          { organization_id: organizationId },
          seenIso,
        );
      }
    } catch (error) {
      domains.projects.failed += 1;
      warnings.push("projects_incomplete");
      throw error;
    }

    // ---- teams, iterations, members per project ------------------------
    await mapWithConcurrency(
      [...projectIdByAzureId.entries()],
      PROJECT_CONCURRENCY,
      async ([azureProjectId, projectId]) => {
        let teams: AzureTeam[] = [];
        try {
          teams = await input.client.listTeams(azureProjectId);
        } catch {
          domains.teams.failed += 1;
          warnings.push(`teams_incomplete:${azureProjectId}`);
          return;
        }
        domains.teams.discovered += teams.length;
        const teamSeenIso = now().toISOString();

        const teamIdByAzureId = new Map<string, string>();
        for (const team of teams) {
          const fieldValues = await input.client.getTeamFieldValues(azureProjectId, team.id);
          const settings = await input.client.getTeamSettings(azureProjectId, team.id);
          const { data, error } = await supabaseAdmin
            .from("core_teams")
            .upsert(
              {
                tenant_id: input.tenantId,
                organization_id: organizationId,
                project_id: projectId,
                azure_team_id: team.id,
                azure_team_name: team.name,
                name_en: team.name,
                name_ar: team.name,
                description: team.description ?? null,
                area_paths: fieldValues ? fieldValues.values.map((v) => v.value) : [],
                default_iteration_path: settings?.defaultIteration?.path ?? null,
                source_status: "active",
                is_deleted: false,
                last_seen_at: teamSeenIso,
                last_synced_at: teamSeenIso,
              },
              { onConflict: "tenant_id,project_id,azure_team_id" },
            )
            .select("id, created_at")
            .single();
          if (error || !data) {
            domains.teams.failed += 1;
            continue;
          }
          teamIdByAzureId.set(team.id, data.id);
          if (data.created_at >= startedIso) domains.teams.inserted += 1;
          else domains.teams.updated += 1;
        }
        if (domains.teams.failed === 0) {
          domains.teams.missing += await tombstoneMissing(
            "core_teams",
            input.tenantId,
            { project_id: projectId },
            teamSeenIso,
          );
        }

        await mapWithConcurrency(
          [...teamIdByAzureId.entries()],
          TEAM_CONCURRENCY,
          async ([azureTeamId, teamId]) => {
            // iterations + team iterations
            try {
              const iterations = await input.client.listTeamIterations(azureProjectId, azureTeamId);
              domains.iterations.discovered += iterations.length;
              const iterationSeenIso = now().toISOString();
              for (const iteration of iterations) {
                const phase = iterationPhase(iteration, now());
                const { data, error } = await supabaseAdmin
                  .from("core_iterations")
                  .upsert(
                    {
                      tenant_id: input.tenantId,
                      organization_id: organizationId,
                      project_id: projectId,
                      azure_iteration_id: iteration.id,
                      azure_iteration_path: iteration.path,
                      name_en: iteration.name,
                      name_ar: iteration.name,
                      start_date: dateOnly(iteration.attributes?.startDate),
                      finish_date: dateOnly(iteration.attributes?.finishDate),
                      phase,
                      source_status: "active",
                      is_deleted: false,
                      last_seen_at: iterationSeenIso,
                      last_synced_at: iterationSeenIso,
                    },
                    { onConflict: "tenant_id,project_id,azure_iteration_id" },
                  )
                  .select("id, created_at")
                  .single();
                if (error || !data) {
                  domains.iterations.failed += 1;
                  continue;
                }
                if (data.created_at >= startedIso) domains.iterations.inserted += 1;
                else domains.iterations.updated += 1;

                domains.teamIterations.discovered += 1;
                const { data: link, error: linkError } = await supabaseAdmin
                  .from("core_team_iterations")
                  .upsert(
                    {
                      tenant_id: input.tenantId,
                      organization_id: organizationId,
                      project_id: projectId,
                      team_id: teamId,
                      iteration_id: data.id,
                      phase,
                      source_status: "active",
                      is_deleted: false,
                      last_seen_at: iterationSeenIso,
                      last_synced_at: iterationSeenIso,
                    },
                    { onConflict: "tenant_id,team_id,iteration_id" },
                  )
                  .select("id, created_at")
                  .single();
                if (linkError || !link) {
                  domains.teamIterations.failed += 1;
                  continue;
                }
                if (link.created_at >= startedIso) domains.teamIterations.inserted += 1;
                else domains.teamIterations.updated += 1;
              }
              domains.iterations.freshnessAt = iterationSeenIso;
              domains.teamIterations.freshnessAt = iterationSeenIso;
            } catch {
              domains.iterations.failed += 1;
              warnings.push(`iterations_incomplete:${azureTeamId}`);
            }

            // members + memberships
            try {
              const members = await input.client.listTeamMembers(azureProjectId, azureTeamId);
              const memberSeenIso = now().toISOString();
              domains.members.discovered += members.length;
              const memberIds: string[] = [];
              for (const entry of members) {
                const identity = entry.identity;
                const descriptor = memberKey(identity);
                if (!descriptor) {
                  domains.members.failed += 1;
                  continue;
                }
                const { data, error } = await supabaseAdmin
                  .from("core_members")
                  .upsert(
                    {
                      tenant_id: input.tenantId,
                      organization_id: organizationId,
                      azure_descriptor: descriptor,
                      azure_unique_name: identity.uniqueName ?? null,
                      display_name: identity.displayName ?? descriptor,
                      email: identity.uniqueName?.includes("@") ? identity.uniqueName : null,
                      image_url: identity.imageUrl ?? null,
                      is_active: true,
                      source_status: "active",
                      is_deleted: false,
                      last_seen_at: memberSeenIso,
                      last_synced_at: memberSeenIso,
                    },
                    { onConflict: "tenant_id,organization_id,azure_descriptor" },
                  )
                  .select("id, created_at")
                  .single();
                if (error || !data) {
                  domains.members.failed += 1;
                  continue;
                }
                memberIdByDescriptor.set(descriptor, data.id);
                memberIds.push(data.id);
                if (data.created_at >= startedIso) domains.members.inserted += 1;
                else domains.members.updated += 1;
              }
              domains.members.freshnessAt = memberSeenIso;

              // memberships: read-then-insert keeps the nullable natural key stable
              const { data: existing } = await supabaseAdmin
                .from("core_team_memberships")
                .select("id, member_id")
                .eq("tenant_id", input.tenantId)
                .eq("team_id", teamId);
              const existingByMember = new Map(
                (existing ?? []).map((row) => [row.member_id, row.id]),
              );
              domains.teamMemberships.discovered += memberIds.length;
              for (const memberId of memberIds) {
                const existingId = existingByMember.get(memberId);
                if (existingId) {
                  await supabaseAdmin
                    .from("core_team_memberships")
                    .update({
                      is_active: true,
                      left_at: null,
                      source_status: "active",
                      is_deleted: false,
                      last_seen_at: memberSeenIso,
                    })
                    .eq("tenant_id", input.tenantId)
                    .eq("id", existingId);
                  domains.teamMemberships.updated += 1;
                } else {
                  const { error } = await supabaseAdmin.from("core_team_memberships").insert({
                    tenant_id: input.tenantId,
                    project_id: projectId,
                    team_id: teamId,
                    member_id: memberId,
                    role: "member",
                    is_active: true,
                    source_status: "active",
                    is_deleted: false,
                    last_seen_at: memberSeenIso,
                  });
                  if (error) domains.teamMemberships.failed += 1;
                  else domains.teamMemberships.inserted += 1;
                }
              }
              // members that left the team are closed, never deleted
              const activeSet = new Set(memberIds);
              for (const [memberId, membershipId] of existingByMember) {
                if (activeSet.has(memberId)) continue;
                await supabaseAdmin
                  .from("core_team_memberships")
                  .update({
                    is_active: false,
                    left_at: memberSeenIso,
                    source_status: "deleted",
                    is_deleted: true,
                  })
                  .eq("tenant_id", input.tenantId)
                  .eq("id", membershipId)
                  .eq("is_deleted", false);
                domains.teamMemberships.missing += 1;
              }
              domains.teamMemberships.freshnessAt = memberSeenIso;
            } catch {
              domains.members.failed += 1;
              warnings.push(`members_incomplete:${azureTeamId}`);
            }
          },
        );
      },
    );

    domains.teams.complete = domains.teams.failed === 0;
    domains.iterations.complete = domains.iterations.failed === 0;
    domains.teamIterations.complete = domains.teamIterations.failed === 0;
    domains.members.complete = domains.members.failed === 0;
    domains.teamMemberships.complete = domains.teamMemberships.failed === 0;

    const completedAt = now().toISOString();
    const partial = SYNC_DOMAINS.some((domain) => !domains[domain].complete);
    const report = buildReport(partial ? "partial" : "succeeded", null, completedAt);

    await supabaseAdmin
      .from("ops_sync_runs")
      .update({
        status: report.status,
        finished_at: completedAt,
        finalized_at: completedAt,
        items_read: report.totals.discovered,
        items_written: report.totals.inserted + report.totals.updated,
        error_count: report.totals.failed,
        details:
          report as unknown as Database["public"]["Tables"]["ops_sync_runs"]["Row"]["details"],
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", runId);

    await supabaseAdmin
      .from("ops_sync_connections")
      .update({
        status: partial ? "error" : "connected",
        status_message: partial ? "partial_sync" : null,
        last_verified_at: completedAt,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", connectionId);

    return report;
  } catch (error) {
    const failedAt = now().toISOString();
    const report = buildReport("failed", toAzureFailure(error), failedAt);
    await supabaseAdmin
      .from("ops_sync_runs")
      .update({
        status: "failed",
        finished_at: failedAt,
        finalized_at: failedAt,
        error_count: report.totals.failed + 1,
        details:
          report as unknown as Database["public"]["Tables"]["ops_sync_runs"]["Row"]["details"],
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", runId);
    return report;
  } finally {
    await releaseLock(input.tenantId, runId, now().toISOString());
  }
}
