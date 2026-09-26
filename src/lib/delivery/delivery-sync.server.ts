/**
 * Resumable delivery-schedule synchronization (ADR-021).
 *
 * For one project with a delivery mapping:
 *   discover — find the deliverable roots in Azure (type / tag / area WIQL, or
 *              the saved query by GET), then every descendant with a
 *              recursive hierarchy link query;
 *   read     — re-read all of them with the work-items batch reader and
 *              persist them like the backlog sync does (same team and bug
 *              rules), so the tree is complete even for closed work;
 *   compute  — roll up progress, contributing sprints, actual date and
 *              forecast per deliverable into dlv_deliverables.
 * Read-only against Azure; every advance is time-bounded and checkpointed.
 * Platform-owned fields (committed/baseline date, client visibility, notes)
 * are never touched by the sync.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AzureDevOpsClient } from "@/lib/azure/client.server";
import { AzureDevOpsError, toAzureFailure, type AzureFailure } from "@/lib/azure/errors";
import { resolveOwningTeam } from "@/lib/azure/backlog-rules";
import { loadIterationIdsByPath, resolveTeamAreas } from "@/lib/azure/backlog-sync.server";
import { effectiveBugHandling } from "@/lib/azure/process-mapping";
import { ensureConnection } from "@/lib/azure/sync.server";
import {
  buildWorkItemsBatchBody,
  chunkIds,
  WORK_ITEM_ADVANCE_BUDGET_MS,
  WORK_ITEM_REQUEST_TIMEOUT_MS,
} from "@/lib/azure/wiql";
import {
  loadWorkItemReference,
  persistWorkItemBatch,
  type RawWorkItem,
} from "@/lib/azure/work-item-persist.server";
import { cairoToday } from "@/lib/calendar/cairo";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { StateCategory } from "@/types/domain/work-item";
import {
  actualDeliveryDate,
  contributingSprints,
  deliverableScope,
  descendantsOf,
  forecastDelivery,
  rollUpProgress,
  type HierarchyItem,
} from "./deliverable-rules";
import {
  buildDescendantsWiql,
  buildRootsWiql,
  capIds,
  idsFromLinks,
  rootsFromResult,
  topLevelOnly,
  type DeliveryMappingMode,
  type WiqlResult,
} from "./delivery-wiql";

const ENTITY_KIND = "deliverables";
const BATCH_SIZE = 200;
/** Link queries take the roots in chunks to keep each WIQL statement bounded. */
const ROOT_CHUNK = 200;
const PAGE = 1_000;

export type DeliverySyncPhase = "discover" | "read" | "compute" | "done";

export interface DeliverySyncCursor {
  readonly phase: DeliverySyncPhase;
  readonly projectId: string;
  readonly mode: DeliveryMappingMode | null;
  readonly roots: number[];
  readonly ids: number[];
  readonly nextBatch: number;
  readonly truncated: boolean;
  readonly read: number;
  readonly failed: number;
  readonly deliverables: number;
  readonly retired: number;
  /** Set when the project has no active delivery mapping. */
  readonly notConfigured: boolean;
}

export interface DeliverySyncStatus {
  readonly runId: string;
  readonly status: "queued" | "running" | "succeeded" | "partial" | "failed";
  readonly cursor: DeliverySyncCursor;
  readonly failure: AzureFailure | null;
}

const emptyCursor = (projectId: string): DeliverySyncCursor => ({
  phase: "discover",
  projectId,
  mode: null,
  roots: [],
  ids: [],
  nextBatch: 0,
  truncated: false,
  read: 0,
  failed: 0,
  deliverables: 0,
  retired: 0,
  notConfigured: false,
});

const readCursor = (details: unknown, projectId: string): DeliverySyncCursor => {
  const raw = (details as { cursor?: Partial<DeliverySyncCursor> } | null)?.cursor;
  if (!raw || raw.projectId !== projectId) return emptyCursor(projectId);
  return { ...emptyCursor(projectId), ...raw, projectId };
};

async function checkpoint(
  runId: string,
  cursor: DeliverySyncCursor,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("ops_sync_runs")
    .update({
      details: { cursor } as unknown as Json,
      items_read: cursor.read,
      items_written: cursor.deliverables,
      error_count: cursor.failed,
      ...patch,
    })
    .eq("id", runId);
}

export async function loadDeliveryMapping(
  tenantId: string,
  projectId: string,
): Promise<{ mode: DeliveryMappingMode; value: string } | null> {
  const { data } = await supabaseAdmin
    .from("dlv_project_mappings")
    .select("mode, value, is_active")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return { mode: data.mode as DeliveryMappingMode, value: data.value };
}

/** Creates or rejoins the single active delivery run for the target's project. */
export async function startDeliverySync(
  target: ResolvedTeamIteration,
  actorUserId: string,
  trigger: "manual" | "scheduled" = "manual",
): Promise<DeliverySyncStatus> {
  const active = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, details")
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
    .contains("entity_kinds", [ENTITY_KIND])
    .in("status", ["queued", "running"])
    .order("started_at", { ascending: false })
    .limit(1);
  const existing = (active.data ?? [])[0];
  if (existing) {
    return {
      runId: existing.id,
      status: existing.status as DeliverySyncStatus["status"],
      cursor: readCursor(existing.details, target.projectId),
      failure: null,
    };
  }
  const connectionId = await ensureConnection(target.tenantId, target.organizationId);
  const cursor = emptyCursor(target.projectId);
  const { data, error } = await supabaseAdmin
    .from("ops_sync_runs")
    .insert({
      tenant_id: target.tenantId,
      connection_id: connectionId,
      organization_id: target.organizationId,
      project_id: target.projectId,
      trigger_kind: trigger,
      status: "running",
      entity_kinds: [ENTITY_KIND],
      started_at: new Date().toISOString(),
      details: { cursor, actor_user_id: actorUserId } as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !data) throw new AzureDevOpsError("unknown");
  return { runId: data.id, status: "running", cursor, failure: null };
}

async function discoverRoots(
  target: ResolvedTeamIteration,
  client: AzureDevOpsClient,
  mapping: { mode: DeliveryMappingMode; value: string },
): Promise<number[]> {
  const result =
    mapping.mode === "saved_query"
      ? await client.runSavedQuery<WiqlResult>(target.azureProjectId, mapping.value)
      : await client.postAllowlisted<WiqlResult>("wiql", target.azureProjectId, {
          query: buildRootsWiql({
            mode: mapping.mode,
            value: mapping.value,
            projectName: target.azureProjectName,
          }),
        });
  return rootsFromResult(result);
}

async function discoverTree(
  target: ResolvedTeamIteration,
  client: AzureDevOpsClient,
  roots: readonly number[],
): Promise<number[]> {
  const ids = new Set<number>(roots);
  for (let i = 0; i < roots.length; i += ROOT_CHUNK) {
    const result = await client.postAllowlisted<WiqlResult>("wiql", target.azureProjectId, {
      query: buildDescendantsWiql(roots.slice(i, i + ROOT_CHUNK)),
    });
    for (const id of idsFromLinks(result)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/** One bounded, checkpointed slice. Callers keep invoking until `phase === "done"`. */
export async function advanceDeliverySync(
  runId: string,
  target: ResolvedTeamIteration,
  options: { readonly budgetMs?: number; readonly client?: AzureDevOpsClient } = {},
): Promise<DeliverySyncStatus> {
  const deadline = Date.now() + (options.budgetMs ?? WORK_ITEM_ADVANCE_BUDGET_MS);
  const runRow = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, details")
    .eq("tenant_id", target.tenantId)
    .eq("id", runId)
    .maybeSingle();
  if (runRow.error || !runRow.data) throw new AzureDevOpsError("forbidden");

  let cursor = readCursor(runRow.data.details, target.projectId);
  if (cursor.phase === "done") {
    return {
      runId,
      status: runRow.data.status as DeliverySyncStatus["status"],
      cursor,
      failure: null,
    };
  }
  const client =
    options.client ??
    AzureDevOpsClient.fromEnvironment({ timeoutMs: WORK_ITEM_REQUEST_TIMEOUT_MS });

  try {
    if (cursor.phase === "discover") {
      const mapping = await loadDeliveryMapping(target.tenantId, target.projectId);
      if (!mapping) {
        cursor = { ...cursor, phase: "done", notConfigured: true };
      } else {
        const roots = await discoverRoots(target, client, mapping);
        const tree = roots.length > 0 ? await discoverTree(target, client, roots) : [];
        const capped = capIds(tree);
        cursor = {
          ...cursor,
          mode: mapping.mode,
          roots,
          ids: capped.ids,
          truncated: capped.truncated,
          phase: capped.ids.length > 0 ? "read" : "compute",
        };
      }
      await checkpoint(runId, cursor);
    }

    if (cursor.phase === "read") {
      const batches = chunkIds(cursor.ids, BATCH_SIZE);
      const [reference, iterationIdByPath, teamAreas] = await Promise.all([
        loadWorkItemReference(target),
        loadIterationIdsByPath(target.tenantId, target.projectId),
        resolveTeamAreas(target, client),
      ]);
      while (cursor.nextBatch < batches.length && Date.now() < deadline) {
        const batch = batches[cursor.nextBatch]!;
        const response = await client.postAllowlisted<{ value?: (RawWorkItem | null)[] }>(
          "workItemsBatch",
          target.azureProjectId,
          buildWorkItemsBatchBody(batch, [], { omitMissing: true }),
        );
        const raws = (response.value ?? []).filter((raw): raw is RawWorkItem => Boolean(raw));
        const result = await persistWorkItemBatch({
          tenantId: target.tenantId,
          organizationId: target.organizationId,
          projectId: target.projectId,
          raws,
          reference,
          contextFor: (raw, prior) => {
            const areaPath = String(raw.fields["System.AreaPath"] ?? "");
            const iterationPath = String(raw.fields["System.IterationPath"] ?? "");
            const priorTeam = (prior?.["team_id"] as string | null | undefined) ?? null;
            const teamId = resolveOwningTeam(areaPath, teamAreas.areas, priorTeam) ?? priorTeam;
            return {
              projectId: target.projectId,
              teamId,
              bugHandlingMode: effectiveBugHandling(
                reference.mapping,
                teamId ? teamAreas.teamBugHandling[teamId] : undefined,
              ),
              iterationId: iterationIdByPath.get(iterationPath.toLowerCase()) ?? null,
              teamIterationId: null,
              resolveMember: reference.resolveMember,
              organizationBaseUrl: target.organizationBaseUrl,
              azureProjectName: target.azureProjectName,
            };
          },
        });
        cursor = {
          ...cursor,
          nextBatch: cursor.nextBatch + 1,
          read: cursor.read + raws.length,
          failed: cursor.failed + result.failed,
        };
        await checkpoint(runId, cursor);
      }
      if (cursor.nextBatch >= batches.length) cursor = { ...cursor, phase: "compute" };
      await checkpoint(runId, cursor);
    }

    if (cursor.phase === "compute" && Date.now() < deadline) {
      const { deliverables, retired } = await computeDeliverables(target, cursor);
      cursor = { ...cursor, phase: "done", deliverables, retired };
    }

    if (cursor.phase === "done") {
      const status =
        cursor.failed > 0 || cursor.truncated || cursor.notConfigured ? "partial" : "succeeded";
      const finishedAt = new Date().toISOString();
      await checkpoint(runId, cursor, {
        status,
        finished_at: finishedAt,
        finalized_at: finishedAt,
      });
      return { runId, status, cursor, failure: null };
    }
    await checkpoint(runId, cursor);
    return { runId, status: "running", cursor, failure: null };
  } catch (error) {
    const failure = toAzureFailure(error);
    await checkpoint(runId, cursor, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_count: cursor.failed + 1,
    });
    return { runId, status: "failed", cursor, failure };
  }
}

interface StoredItem extends HierarchyItem {
  readonly id: string;
  readonly assignedToMemberId: string | null;
}

async function loadTree(tenantId: string, projectId: string, ids: readonly number[]) {
  const items: StoredItem[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("az_work_items")
      .select(
        "id, azure_work_item_id, parent_azure_work_item_id, azure_work_item_type, title, counts_toward_scope, state_category, estimate, iteration_path, closed_date, team_id, assigned_to_member_id, is_deleted",
      )
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .in("azure_work_item_id", ids.slice(i, i + PAGE));
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) {
      if (row.is_deleted) continue;
      items.push({
        id: row.id,
        azureId: Number(row.azure_work_item_id),
        parentAzureId:
          row.parent_azure_work_item_id === null ? null : Number(row.parent_azure_work_item_id),
        type: row.azure_work_item_type,
        title: row.title,
        countsTowardScope: row.counts_toward_scope,
        stateCategory: row.state_category as StateCategory,
        estimate: row.estimate === null ? null : Number(row.estimate),
        iterationPath: row.iteration_path,
        closedDate: row.closed_date,
        teamId: row.team_id,
        assignedToMemberId: row.assigned_to_member_id,
      });
    }
  }
  return items;
}

/**
 * The project's sprint calendar: every dated sprint of any of its teams, one
 * per iteration path, oldest first. Area ownership and sprint membership do
 * not always line up (a team can deliver in another team's sprint), so the
 * forecast uses the project-wide cadence.
 */
async function loadSprints(tenantId: string, projectId: string) {
  const { data, error } = await supabaseAdmin
    .from("core_iterations")
    .select("azure_iteration_path, start_date, finish_date")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .not("start_date", "is", null)
    .not("finish_date", "is", null)
    .order("start_date", { ascending: true });
  if (error) throw new AzureDevOpsError("unknown");
  const byPath = new Map<string, { path: string; startDate: string; finishDate: string }>();
  for (const row of data ?? []) {
    const key = row.azure_iteration_path.toLowerCase();
    if (!byPath.has(key))
      byPath.set(key, {
        path: row.azure_iteration_path,
        startDate: row.start_date!,
        finishDate: row.finish_date!,
      });
  }
  const sprints = [...byPath.values()];
  return {
    projectSprints: sprints.map((s) => ({ startDate: s.startDate, finishDate: s.finishDate })),
    orderedPaths: sprints.map((s) => s.path),
  };
}

async function computeDeliverables(
  target: ResolvedTeamIteration,
  cursor: DeliverySyncCursor,
): Promise<{ deliverables: number; retired: number }> {
  const items = await loadTree(target.tenantId, target.projectId, cursor.ids);
  const byId = new Map(items.map((i) => [i.azureId, i]));
  const candidateRoots =
    cursor.mode === "area_path"
      ? topLevelOnly(cursor.roots, new Map(items.map((i) => [i.azureId, i.parentAzureId])))
      : cursor.roots;
  const { projectSprints, orderedPaths } = await loadSprints(target.tenantId, target.projectId);
  const today = cairoToday();
  const nowIso = new Date().toISOString();

  const rows = [];
  for (const rootId of candidateRoots) {
    const root = byId.get(rootId);
    if (!root || root.stateCategory === "removed") continue;
    const tree = descendantsOf(rootId, items);
    const scope = deliverableScope(root, tree);
    const progress = rollUpProgress(scope);
    const completions = scope
      .filter((s) => s.stateCategory === "completed" && s.closedDate)
      .map((s) => ({
        date: s.closedDate!,
        amount: progress.basis === "points" ? (s.estimate ?? 0) : 1,
      }));
    const forecast =
      progress.basis === null
        ? { date: null, low: null, high: null, reason: "no_scope" as const }
        : forecastDelivery({
            remaining:
              progress.basis === "points" ? progress.remainingPoints : progress.remainingItems,
            completions,
            sprints: projectSprints,
            today,
          });
    const actual = actualDeliveryDate(root, scope);
    rows.push({
      tenant_id: target.tenantId,
      project_id: target.projectId,
      azure_work_item_id: rootId,
      work_item_id: root.id,
      source_ref: `azure:${rootId}`,
      title: root.title,
      work_item_type: root.type,
      owner_member_id: root.assignedToMemberId,
      progress_percent: progress.percent,
      progress_basis: progress.basis,
      scope_items: progress.scopeItems,
      completed_items: progress.completedItems,
      remaining_points: progress.remainingPoints,
      contributing_sprints: contributingSprints([root, ...tree], orderedPaths),
      forecast_date: actual ? null : forecast.date,
      forecast_low: actual ? null : forecast.low,
      forecast_high: actual ? null : forecast.high,
      forecast_reason: actual ? null : forecast.reason,
      actual_date: actual,
      computed_at: nowIso,
      source_status: "active" as const,
      is_deleted: false,
      deleted_at_source: null,
      last_seen_at: nowIso,
    });
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabaseAdmin
      .from("dlv_deliverables")
      .upsert(rows.slice(i, i + BATCH_SIZE), {
        onConflict: "tenant_id,project_id,azure_work_item_id",
      });
    if (error) throw new AzureDevOpsError("unknown");
  }

  // Deliverables no longer found by the mapping become tombstones; never
  // after a truncated discovery, which cannot prove absence.
  let retired = 0;
  if (!cursor.truncated) {
    const keep = new Set(rows.map((r) => r.azure_work_item_id));
    const { data: existing } = await supabaseAdmin
      .from("dlv_deliverables")
      .select("id, azure_work_item_id")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("is_deleted", false);
    const gone = (existing ?? [])
      .filter((row) => !keep.has(Number(row.azure_work_item_id)))
      .map((row) => row.id);
    if (gone.length > 0) {
      await supabaseAdmin
        .from("dlv_deliverables")
        .update({ source_status: "deleted", is_deleted: true, deleted_at_source: nowIso })
        .eq("tenant_id", target.tenantId)
        .in("id", gone);
      retired = gone.length;
    }
  }
  return { deliverables: rows.length, retired };
}
