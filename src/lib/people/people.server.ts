/**
 * Server-only People page (ADR-026). Read-only over synchronized items and
 * revision history; nothing here calls Azure DevOps. Visibility follows the
 * Team page: detail roles see everyone, others only themselves, executive
 * viewers no per-person detail.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import type { TenantContext } from "@/lib/azure/authz.server";
import { loadBoards, loadFacts } from "@/lib/overview/overview.server";
import { defaultStuckSettings } from "@/lib/overview/stuck-rules";
import { resolveAccessLevel, resolveSelfMemberId } from "@/lib/team/team.server";
import type { TeamAccessLevel } from "@/lib/team/team-rules";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import {
  buildPeople,
  NO_UPDATE_WORKING_DAYS,
  type PeopleView,
  type RevisionFact,
  type TransitionFact,
} from "./people-rules";

/** How far back revisions are read to find each person's last change. */
export const ACTIVITY_LOOKBACK_DAYS = 21;
const PAGE = 1_000;
const CHUNK = 200;

export interface PeoplePayload extends PeopleView {
  readonly sprintName: string;
  readonly accessLevel: TeamAccessLevel;
  readonly noUpdateWorkingDays: number;
  readonly lookbackDays: number;
  /** Latest revision stored for the project; activity after it is not known yet. */
  readonly historySyncedTo: string | null;
}

async function pages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new AzureDevOpsError("unknown");
    all.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return all;
  }
}

export async function buildPeoplePayload(
  tenant: TenantContext,
  target: ResolvedTeamIteration,
): Promise<PeoplePayload> {
  const accessLevel = resolveAccessLevel(tenant);
  const settings = defaultStuckSettings({
    workingWeekdays: target.workingWeekdays,
    timeZone: target.timeZone,
  });
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [facts, boards, memberships, latestRevision] = await Promise.all([
    loadFacts(target),
    loadBoards(target),
    supabaseAdmin
      .from("core_team_memberships")
      .select("member_id")
      .eq("tenant_id", target.tenantId)
      .eq("team_id", target.teamId)
      .eq("is_active", true),
    supabaseAdmin
      .from("az_work_item_revisions")
      .select("revised_at")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .order("revised_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let memberIds = new Set((memberships.data ?? []).map((m) => m.member_id));
  for (const f of facts) if (f.assignedToMemberId) memberIds.add(f.assignedToMemberId);
  if (accessLevel === "aggregate") memberIds = new Set();
  else if (accessLevel === "selfOnly") {
    const self = await resolveSelfMemberId(tenant);
    memberIds = self && memberIds.has(self) ? new Set([self]) : new Set();
  }
  const ids = [...memberIds];

  const base: Omit<PeoplePayload, keyof PeopleView> = {
    sprintName: target.iterationNameEn,
    accessLevel,
    noUpdateWorkingDays: NO_UPDATE_WORKING_DAYS,
    lookbackDays: ACTIVITY_LOOKBACK_DAYS,
    historySyncedTo: latestRevision.data?.revised_at ?? null,
  };
  if (ids.length === 0) {
    return { ...base, previousWorkingDay: null, people: [], unassignedOpen: 0 };
  }

  const [members, revisions, transitions] = await Promise.all([
    supabaseAdmin
      .from("core_members")
      .select("id, display_name")
      .eq("tenant_id", target.tenantId)
      .in("id", ids),
    pages((from, to) =>
      supabaseAdmin
        .from("az_work_item_revisions")
        .select("work_item_id, revised_by_member_id, revised_at")
        .eq("tenant_id", target.tenantId)
        .eq("project_id", target.projectId)
        .in("revised_by_member_id", ids)
        .gte("revised_at", since)
        .order("revised_at", { ascending: true })
        .range(from, to),
    ),
    pages((from, to) =>
      supabaseAdmin
        .from("az_work_item_transitions")
        .select("work_item_id, changed_by_member_id, occurred_at, from_state, to_state")
        .eq("tenant_id", target.tenantId)
        .eq("project_id", target.projectId)
        .in("changed_by_member_id", ids)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (members.error) throw new AzureDevOpsError("unknown");

  // Titles and links of the items touched, read in chunks.
  const touched = [...new Set([...revisions, ...transitions].map((r) => r.work_item_id))];
  const itemById = new Map<string, { azureId: number; title: string; azureUrl: string | null }>();
  for (let i = 0; i < touched.length; i += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from("az_work_items")
      .select("id, azure_work_item_id, title, azure_url")
      .eq("tenant_id", target.tenantId)
      .in("id", touched.slice(i, i + CHUNK));
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) {
      itemById.set(row.id, {
        azureId: Number(row.azure_work_item_id),
        title: row.title,
        azureUrl: row.azure_url,
      });
    }
  }

  const revisionFacts: RevisionFact[] = [];
  for (const rev of revisions) {
    const item = itemById.get(rev.work_item_id);
    if (!item || !rev.revised_by_member_id) continue;
    revisionFacts.push({ memberId: rev.revised_by_member_id, ...item, revisedAt: rev.revised_at });
  }
  const transitionFacts: TransitionFact[] = [];
  for (const move of transitions) {
    const item = itemById.get(move.work_item_id);
    if (!item || !move.changed_by_member_id) continue;
    transitionFacts.push({
      memberId: move.changed_by_member_id,
      azureId: item.azureId,
      occurredAt: move.occurred_at,
      fromState: move.from_state,
      toState: move.to_state,
    });
  }

  const view = buildPeople({
    members: (members.data ?? []).map((m) => ({ id: m.id, displayName: m.display_name })),
    facts,
    boards,
    revisions: revisionFacts,
    transitions: transitionFacts,
    nowIso,
    settings,
  });
  // Unassigned work is team-level information; only detail roles see the count.
  return {
    ...base,
    ...view,
    unassignedOpen: accessLevel === "memberDetail" ? view.unassignedOpen : 0,
  };
}
