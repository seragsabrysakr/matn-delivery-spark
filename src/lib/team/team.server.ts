/**
 * Server-only Team page assembly.
 *
 * Reads only synchronized rows for one validated team iteration and projects
 * them into a privacy-safe contract: no email, no Azure descriptor, no auth id,
 * no raw custom fields, no provider payloads ever leave this module.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import type { TenantContext, AppRole } from "@/lib/azure/authz.server";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import {
  buildWorkItemRows,
  calculationBasis,
  computeDistribution,
  computeMemberRows,
  computeSummary,
  type TeamAccessLevel,
  type TeamDataState,
  type TeamPageContract,
  type TeamCalculationBasis,
  type TeamDistribution,
  type TeamMemberFact,
  type TeamMemberRow,
  type TeamStateCategory,
  type TeamSummary,
  type TeamWorkItemFact,
  type TeamWorkItemRow,
} from "./team-rules";

export type { TeamPageContract, TeamDataState };

const DETAIL_ROLES: readonly AppRole[] = [
  "platform_admin",
  "tenant_admin",
  "delivery_manager",
  "team_lead",
  "qa_release_owner",
];

/** Role-driven visibility. Executive viewers are aggregate-only by design. */
export function resolveAccessLevel(context: TenantContext): TeamAccessLevel {
  if (context.roles.some((r) => DETAIL_ROLES.includes(r))) return "memberDetail";
  if (context.roles.includes("executive_viewer")) return "aggregate";
  return "selfOnly";
}

/** Only a plain https URL is considered a safe synchronized avatar. */
export const safeAvatar = (url: string | null | undefined): string | null =>
  typeof url === "string" && url.startsWith("https://") ? url : null;

async function loadFacts(target: ResolvedTeamIteration): Promise<TeamWorkItemFact[]> {
  const { data, error } = await supabaseAdmin
    .from("az_work_items")
    .select(
      "id, azure_work_item_id, title, alias, azure_work_item_type, state, state_category, is_blocked, estimate, estimate_unit, assigned_to_member_id, counts_toward_scope, state_change_date, changed_at_source, azure_url",
    )
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
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
    stateCategory: row.state_category as TeamStateCategory,
    estimate: row.estimate === null ? null : Number(row.estimate),
    estimateUnit: row.estimate_unit ?? null,
    assignedToMemberId: row.assigned_to_member_id,
    isBlocked: row.is_blocked,
    countsTowardScope: row.counts_toward_scope,
    stateChangeDate: row.state_change_date,
    changedAtSource: row.changed_at_source,
    azureUrl: row.azure_url,
  }));
}

/**
 * Team membership plus anyone who actually holds sprint work, so member rows
 * and the unassigned bucket always reconcile with the aggregate totals.
 */
async function loadMembers(
  target: ResolvedTeamIteration,
  facts: readonly TeamWorkItemFact[],
): Promise<TeamMemberFact[]> {
  const memberships = await supabaseAdmin
    .from("core_team_memberships")
    .select("member_id")
    .eq("tenant_id", target.tenantId)
    .eq("team_id", target.teamId)
    .eq("is_active", true);
  if (memberships.error) throw new AzureDevOpsError("unknown");

  const ids = new Set<string>((memberships.data ?? []).map((r) => r.member_id));
  for (const f of facts) if (f.assignedToMemberId) ids.add(f.assignedToMemberId);
  if (ids.size === 0) return [];

  const [members, capacity] = await Promise.all([
    supabaseAdmin
      .from("core_members")
      .select("id, display_name, image_url")
      .eq("tenant_id", target.tenantId)
      .in("id", [...ids]),
    supabaseAdmin
      .from("core_member_capacity")
      .select("member_id, net_capacity_hours")
      .eq("tenant_id", target.tenantId)
      .eq("team_iteration_id", target.teamIterationId)
      .eq("is_deleted", false),
  ]);
  if (members.error) throw new AzureDevOpsError("unknown");

  const capacityByMember = new Map(
    (capacity.data ?? []).map((row) => [
      row.member_id,
      row.net_capacity_hours === null ? null : Number(row.net_capacity_hours),
    ]),
  );

  return (members.data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarUrl: safeAvatar(row.image_url),
    capacityHours: capacityByMember.get(row.id) ?? null,
  }));
}

const HOUR_MS = 3_600_000;

export function resolveDataState(
  lastSyncAt: string | null,
  itemCount: number,
  nowIso: string,
): TeamDataState {
  if (itemCount === 0) return "notSynced";
  if (!lastSyncAt) return "partial";
  const age = Date.parse(nowIso) - Date.parse(lastSyncAt);
  if (!Number.isFinite(age)) return "partial";
  return age > 24 * HOUR_MS ? "stale" : "current";
}

export async function buildTeamPage(
  tenant: TenantContext,
  target: ResolvedTeamIteration,
): Promise<TeamPageContract> {
  const accessLevel = resolveAccessLevel(tenant);
  const nowIso = new Date().toISOString();

  const facts = await loadFacts(target);
  const memberFacts = await loadMembers(target, facts);

  const summary = computeSummary(facts, memberFacts);
  const allMemberRows = computeMemberRows(facts, memberFacts, nowIso);
  const allWorkItemRows = buildWorkItemRows(facts, memberFacts, nowIso);
  const distribution = computeDistribution(facts);

  const [names, lastSync] = await Promise.all([
    loadContextNames(target),
    supabaseAdmin
      .from("az_work_items")
      .select("last_synced_at")
      .eq("tenant_id", target.tenantId)
      .eq("iteration_id", target.iterationId)
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let members: readonly TeamMemberRow[] = allMemberRows;
  let workItems: readonly TeamWorkItemRow[] = allWorkItemRows;

  if (accessLevel === "aggregate") {
    members = [];
    workItems = [];
  } else if (accessLevel === "selfOnly") {
    const selfMemberId = await resolveSelfMemberId(tenant);
    members = selfMemberId ? allMemberRows.filter((m) => m.memberId === selfMemberId) : [];
    workItems = selfMemberId
      ? allWorkItemRows.filter((w) => w.assignedMemberId === selfMemberId)
      : [];
  }

  const lastWorkItemSyncAt = lastSync.data?.last_synced_at ?? null;

  return {
    context: {
      ...names,
      sprintStartDate: target.startDate,
      sprintFinishDate: target.finishDate,
      lastWorkItemSyncAt,
      mode: "real",
      dataState: resolveDataState(lastWorkItemSyncAt, facts.length, nowIso),
      completeness: { hasWorkItems: facts.length > 0, hasMembers: memberFacts.length > 0 },
    },
    accessLevel,
    summary,
    members,
    workItems,
    distribution,
    basis: calculationBasis,
  };
}

/** Identity comes from the existing core_users.member_id link, never from email. */
async function resolveSelfMemberId(tenant: TenantContext): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("core_users")
    .select("member_id")
    .eq("tenant_id", tenant.tenantId)
    .eq("id", tenant.coreUserId)
    .maybeSingle();
  return data?.member_id ?? null;
}

async function loadContextNames(target: ResolvedTeamIteration): Promise<{
  organizationName: { en: string; ar: string };
  projectName: { en: string; ar: string };
  teamName: { en: string; ar: string };
  sprintName: { en: string; ar: string };
}> {
  const [org, project, team] = await Promise.all([
    supabaseAdmin
      .from("core_organizations")
      .select("name_en, name_ar")
      .eq("tenant_id", target.tenantId)
      .eq("id", target.organizationId)
      .maybeSingle(),
    supabaseAdmin
      .from("core_projects")
      .select("name_en, name_ar")
      .eq("tenant_id", target.tenantId)
      .eq("id", target.projectId)
      .maybeSingle(),
    supabaseAdmin
      .from("core_teams")
      .select("name_en, name_ar")
      .eq("tenant_id", target.tenantId)
      .eq("id", target.teamId)
      .maybeSingle(),
  ]);

  return {
    organizationName: { en: org.data?.name_en ?? "—", ar: org.data?.name_ar ?? "—" },
    projectName: { en: project.data?.name_en ?? "—", ar: project.data?.name_ar ?? "—" },
    teamName: { en: team.data?.name_en ?? "—", ar: team.data?.name_ar ?? "—" },
    sprintName: { en: target.iterationNameEn, ar: target.iterationNameAr },
  };
}
