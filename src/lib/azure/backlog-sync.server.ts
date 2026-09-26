/**
 * Resumable project backlog synchronization (ADR-014).
 *
 * Reads every open work item in the areas the project's teams own, regardless
 * of iteration, and links each to its owning team and iteration. The first
 * run is a full pass; later runs are incremental on `System.ChangedDate`,
 * with a full reconcile at most once a day that re-reads, by id, every stored
 * open item Azure no longer returned (moved out of scope, closed or deleted).
 *
 * Read-only against Azure DevOps (WIQL + work-items batch). Every advance is
 * time-bounded and checkpointed into `ops_sync_runs.details`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AzureDevOpsClient } from "./client.server";
import { AzureDevOpsError, toAzureFailure, type AzureFailure } from "./errors";
import {
  BACKLOG_CURSOR_KIND,
  buildBacklogWiql,
  decideBacklogMode,
  incrementalSince,
  laterOf,
  openStatesByType,
  parseBacklogRuleVersion,
  parseBacklogToken,
  resolveOwningTeam,
  serializeBacklogToken,
  type BacklogMode,
  type TeamArea,
} from "./backlog-rules";
import { ensureProcessMetadataFresh } from "./metadata-sync.server";
import {
  bugHandlingFromAzure,
  effectiveBugHandling,
  type BugHandlingMode,
} from "./process-mapping";
import { ensureConnection } from "./sync.server";
import { WORK_ITEM_RULE_VERSION } from "./workitem-map";
import {
  buildWorkItemsBatchBody,
  chunkIds,
  MAX_BATCH_IDS,
  MAX_WORK_ITEMS_PER_SPRINT,
  WORK_ITEM_ADVANCE_BUDGET_MS,
  WORK_ITEM_REQUEST_TIMEOUT_MS,
} from "./wiql";
import {
  loadWorkItemReference,
  persistWorkItemBatch,
  type RawWorkItem,
} from "./work-item-persist.server";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { StateCategory } from "@/types/domain/work-item";

/** Same visible ceiling as the sprint sync; reaching it marks the run truncated. */
export const MAX_BACKLOG_ITEMS = MAX_WORK_ITEMS_PER_SPRINT;
const ENTITY_KIND = "work_items_backlog";

export type BacklogSyncPhase = "discover" | "read" | "reconcile" | "refresh" | "done";

export interface BacklogSyncCursor {
  readonly phase: BacklogSyncPhase;
  readonly projectId: string;
  readonly mode: BacklogMode;
  /**
   * The work item rules changed since the last full refresh: the reconcile
   * re-reads every stored item of the project (open and closed), not only
   * the open ones, so no row keeps the old interpretation.
   */
  readonly refreshAll: boolean;
  readonly areas: readonly TeamArea[];
  /** Each team's bug handling from its Azure settings, by internal team id. */
  readonly teamBugHandling: Readonly<Record<string, BugHandlingMode>>;
  readonly ids: number[];
  readonly nextBatch: number;
  /** Stored open items Azure did not return in a full pass; re-read by id. */
  readonly staleIds: number[];
  readonly nextStaleBatch: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly failed: number;
  /** Re-read ids Azure no longer returns (deleted or no longer accessible). */
  readonly unavailable: number;
  readonly truncated: boolean;
  readonly skippedTypes: readonly string[];
  readonly warnings: readonly string[];
  readonly maxChangedAt: string | null;
}

export interface BacklogSyncStatus {
  readonly runId: string;
  readonly status: "queued" | "running" | "succeeded" | "partial" | "failed";
  readonly cursor: BacklogSyncCursor;
  readonly failure: AzureFailure | null;
}

const emptyCursor = (projectId: string, mode: BacklogMode = "full"): BacklogSyncCursor => ({
  phase: "discover",
  projectId,
  mode,
  refreshAll: false,
  areas: [],
  teamBugHandling: {},
  ids: [],
  nextBatch: 0,
  staleIds: [],
  nextStaleBatch: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
  unavailable: 0,
  truncated: false,
  skippedTypes: [],
  warnings: [],
  maxChangedAt: null,
});

const readCursor = (details: unknown, projectId: string): BacklogSyncCursor => {
  const raw = (details as { cursor?: Partial<BacklogSyncCursor> } | null)?.cursor;
  if (!raw || raw.projectId !== projectId) return emptyCursor(projectId);
  return { ...emptyCursor(projectId), ...raw, projectId };
};

async function checkpoint(
  runId: string,
  cursor: BacklogSyncCursor,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("ops_sync_runs")
    .update({
      details: { cursor } as unknown as Json,
      items_read: cursor.ids.length + cursor.staleIds.length,
      items_written: cursor.inserted + cursor.updated,
      error_count: cursor.failed,
      ...patch,
    })
    .eq("id", runId);
}

interface CursorRow {
  readonly id: string;
  readonly watermarkAt: string | null;
  readonly lastFullReconcileAt: string | null;
  readonly ruleVersion: number | null;
}

async function readWatermark(tenantId: string, connectionId: string, projectId: string) {
  const { data } = await supabaseAdmin
    .from("ops_sync_cursors")
    .select("id, watermark_at, watermark_token")
    .eq("tenant_id", tenantId)
    .eq("connection_id", connectionId)
    .eq("entity_kind", BACKLOG_CURSOR_KIND)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    watermarkAt: data.watermark_at,
    lastFullReconcileAt: parseBacklogToken(data.watermark_token),
    ruleVersion: parseBacklogRuleVersion(data.watermark_token),
  } satisfies CursorRow;
}

/** Creates or rejoins the single active backlog run for the target's project. */
export async function startBacklogSync(
  target: ResolvedTeamIteration,
  actorUserId: string,
): Promise<BacklogSyncStatus> {
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
      status: existing.status as BacklogSyncStatus["status"],
      cursor: readCursor(existing.details, target.projectId),
      failure: null,
    };
  }

  const connectionId = await ensureConnection(target.tenantId, target.organizationId);
  const watermark = await readWatermark(target.tenantId, connectionId, target.projectId);
  const refreshAll = watermark?.ruleVersion !== WORK_ITEM_RULE_VERSION;
  const cursor = {
    ...emptyCursor(
      target.projectId,
      refreshAll ? "full" : decideBacklogMode(watermark, Date.now()),
    ),
    refreshAll,
  };
  const { data, error } = await supabaseAdmin
    .from("ops_sync_runs")
    .insert({
      tenant_id: target.tenantId,
      connection_id: connectionId,
      organization_id: target.organizationId,
      project_id: target.projectId,
      trigger_kind: "manual",
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

/** Team areas from Azure's team field values; falls back to the synced list. */
async function resolveTeamAreas(
  target: ResolvedTeamIteration,
  client: AzureDevOpsClient,
): Promise<{
  areas: TeamArea[];
  teamBugHandling: Record<string, BugHandlingMode>;
  warnings: string[];
}> {
  const { data: teams } = await supabaseAdmin
    .from("core_teams")
    .select("id, azure_team_id, azure_team_name, area_paths")
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
    .eq("is_deleted", false);

  const areas: TeamArea[] = [];
  const teamBugHandling: Record<string, BugHandlingMode> = {};
  const warnings: string[] = [];
  for (const team of teams ?? []) {
    const settings = await client.getTeamSettings(target.azureProjectId, team.azure_team_id);
    const bugHandling = bugHandlingFromAzure(settings?.bugsBehavior);
    if (bugHandling) teamBugHandling[team.id] = bugHandling;
    const values = await client.getTeamFieldValues(target.azureProjectId, team.azure_team_id);
    if (values && values.field?.referenceName !== "System.AreaPath") {
      // A team keyed on a custom field has no area-based backlog to read.
      warnings.push(`team_field_not_area_path:${team.azure_team_name}`);
      continue;
    }
    if (values) {
      for (const value of values.values ?? []) {
        if (value.value)
          areas.push({
            teamId: team.id,
            path: value.value,
            includeChildren: value.includeChildren,
          });
      }
      continue;
    }
    warnings.push(`team_areas_from_cache:${team.azure_team_name}`);
    for (const path of team.area_paths ?? []) {
      if (path) areas.push({ teamId: team.id, path, includeChildren: true });
    }
  }
  return { areas, teamBugHandling, warnings };
}

async function loadOpenStates(tenantId: string, projectId: string) {
  const [types, states] = await Promise.all([
    supabaseAdmin
      .from("az_work_item_types")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .eq("is_deleted", false),
    supabaseAdmin
      .from("az_work_item_type_states")
      .select("work_item_type_id, state_name, state_category")
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .eq("is_deleted", false),
  ]);
  const typeName = new Map((types.data ?? []).map((row) => [row.id, row.name]));
  const openStates = openStatesByType(
    (states.data ?? []).flatMap((row) => {
      const name = typeName.get(row.work_item_type_id);
      return name
        ? [
            {
              workItemType: name,
              stateName: row.state_name,
              stateCategory: row.state_category as StateCategory,
            },
          ]
        : [];
    }),
  );
  return {
    openStates,
    projectTypes: new Set((types.data ?? []).map((row) => row.name.toLowerCase())),
  };
}

async function loadIterationIdsByPath(
  tenantId: string,
  projectId: string,
): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from("core_iterations")
    .select("id, azure_iteration_path")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("is_deleted", false);
  return new Map((data ?? []).map((row) => [row.azure_iteration_path.toLowerCase(), row.id]));
}

/** One bounded, checkpointed slice. Callers keep invoking until `phase === "done"`. */
export async function advanceBacklogSync(
  runId: string,
  target: ResolvedTeamIteration,
  options: { readonly budgetMs?: number; readonly client?: AzureDevOpsClient } = {},
): Promise<BacklogSyncStatus> {
  const deadline = Date.now() + (options.budgetMs ?? WORK_ITEM_ADVANCE_BUDGET_MS);

  const runRow = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, details, connection_id")
    .eq("tenant_id", target.tenantId)
    .eq("id", runId)
    .maybeSingle();
  if (runRow.error || !runRow.data) throw new AzureDevOpsError("forbidden");

  let cursor = readCursor(runRow.data.details, target.projectId);
  if (cursor.phase === "done") {
    return {
      runId,
      status: runRow.data.status as BacklogSyncStatus["status"],
      cursor,
      failure: null,
    };
  }

  const client =
    options.client ??
    AzureDevOpsClient.fromEnvironment({ timeoutMs: WORK_ITEM_REQUEST_TIMEOUT_MS });

  try {
    if (cursor.phase === "discover") {
      const warnings = [
        ...(await ensureProcessMetadataFresh(
          {
            tenantId: target.tenantId,
            organizationId: target.organizationId,
            projectId: target.projectId,
            azureProjectId: target.azureProjectId,
          },
          client,
        )),
      ];
      const reference = await loadWorkItemReference(target);
      const {
        areas,
        teamBugHandling,
        warnings: areaWarnings,
      } = await resolveTeamAreas(target, client);
      warnings.push(...areaWarnings);

      const watermark = await readWatermark(
        target.tenantId,
        runRow.data.connection_id,
        target.projectId,
      );
      const mode: BacklogMode =
        cursor.mode === "incremental" && watermark?.watermarkAt ? "incremental" : "full";
      const { openStates, projectTypes } = await loadOpenStates(target.tenantId, target.projectId);
      // Mapping types that do not exist in this project's process are not queried.
      const workItemTypes =
        projectTypes.size > 0
          ? reference.mapping.workItemTypes.filter((type) => projectTypes.has(type.toLowerCase()))
          : reference.mapping.workItemTypes;
      if (projectTypes.size === 0) warnings.push("process_metadata_missing");
      const wiql = buildBacklogWiql({
        projectName: target.azureProjectName,
        areas,
        workItemTypes,
        mode,
        openStates: mode === "full" ? openStates : undefined,
        changedSince:
          mode === "incremental" && watermark?.watermarkAt
            ? incrementalSince(watermark.watermarkAt)
            : undefined,
      });
      if (!wiql) warnings.push(areas.length === 0 ? "no_team_areas" : "no_backlog_query");
      if (wiql && wiql.skippedTypes.length > 0) warnings.push("types_without_state_metadata");

      let ids: number[] = [];
      let truncated = false;
      if (wiql && wiql.query) {
        const result = await client.postAllowlisted<{ workItems?: { id: number }[] }>(
          "wiql",
          target.azureProjectId,
          { query: wiql.query },
          { query: { timePrecision: "true", $top: MAX_BACKLOG_ITEMS + 1 } },
        );
        const all = (result.workItems ?? []).map((item) => item.id);
        truncated = all.length > MAX_BACKLOG_ITEMS;
        ids = all.slice(0, MAX_BACKLOG_ITEMS);
      }

      cursor = {
        ...cursor,
        mode,
        areas,
        teamBugHandling,
        ids,
        truncated,
        skippedTypes: wiql?.skippedTypes ?? [],
        warnings,
        phase: ids.length > 0 ? "read" : mode === "full" && wiql?.query ? "reconcile" : "done",
      };
      await checkpoint(runId, cursor);
    }

    // Loaded lazily: only phases that write items need the mapping.
    let context: Awaited<ReturnType<typeof loadContext>> | null = null;
    const ensureContext = async () => (context ??= await loadContext(target));

    const readBatches = async (
      phaseIds: readonly number[],
      next: () => number,
      advance: (n: number, patch: Partial<BacklogSyncCursor>) => void,
      omitMissing: boolean,
    ): Promise<boolean> => {
      const batches = chunkIds(phaseIds, MAX_BATCH_IDS);
      while (next() < batches.length && Date.now() < deadline) {
        const batch = batches[next()]!;
        const { reference, iterationIdByPath } = await ensureContext();
        const response = await client.postAllowlisted<{ value?: (RawWorkItem | null)[] }>(
          "workItemsBatch",
          target.azureProjectId,
          buildWorkItemsBatchBody(batch, [], { omitMissing }),
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
            const teamId = resolveOwningTeam(areaPath, cursor.areas, priorTeam) ?? priorTeam;
            return {
              projectId: target.projectId,
              teamId,
              bugHandlingMode: effectiveBugHandling(
                reference.mapping,
                teamId ? cursor.teamBugHandling[teamId] : undefined,
              ),
              iterationId: iterationIdByPath.get(iterationPath.toLowerCase()) ?? null,
              teamIterationId: null,
              resolveMember: reference.resolveMember,
              organizationBaseUrl: target.organizationBaseUrl,
              azureProjectName: target.azureProjectName,
            };
          },
        });
        advance(batch.length, {
          inserted: cursor.inserted + result.inserted,
          updated: cursor.updated + result.updated,
          unchanged: cursor.unchanged + result.unchanged,
          failed: cursor.failed + result.failed,
          unavailable: cursor.unavailable + (batch.length - raws.length),
          maxChangedAt: laterOf(cursor.maxChangedAt, result.maxChangedAt),
        });
        await checkpoint(runId, cursor);
      }
      return next() >= batches.length;
    };

    if (cursor.phase === "read") {
      const finished = await readBatches(
        cursor.ids,
        () => cursor.nextBatch,
        (_, patch) => {
          cursor = { ...cursor, ...patch, nextBatch: cursor.nextBatch + 1 };
        },
        false,
      );
      if (finished) {
        // Reconcile only after a complete full pass: a truncated one would
        // misreport every item past the ceiling as out of scope.
        cursor = {
          ...cursor,
          phase: cursor.mode === "full" && !cursor.truncated ? "reconcile" : "done",
        };
        await checkpoint(runId, cursor);
      }
    }

    if (cursor.phase === "reconcile" && Date.now() < deadline) {
      // Stored items the full pass did not return: the open ones, or every
      // stored item of the project after a work item rule change.
      const storedIds: number[] = [];
      for (let from = 0; storedIds.length <= MAX_BACKLOG_ITEMS; from += 1_000) {
        let query = supabaseAdmin
          .from("az_work_items")
          .select("azure_work_item_id")
          .eq("tenant_id", target.tenantId)
          .eq("project_id", target.projectId)
          .eq("is_deleted", false);
        if (!cursor.refreshAll) query = query.not("state_category", "in", "(completed,removed)");
        const { data, error } = await query
          .order("azure_work_item_id", { ascending: true })
          .range(from, from + 999);
        if (error) throw new AzureDevOpsError("unknown");
        storedIds.push(...(data ?? []).map((row) => Number(row.azure_work_item_id)));
        if ((data ?? []).length < 1_000) break;
      }
      const returned = new Set(cursor.ids);
      const stale = storedIds.filter((id) => !returned.has(id));
      cursor = {
        ...cursor,
        staleIds: stale.slice(0, MAX_BACKLOG_ITEMS),
        truncated: cursor.truncated || stale.length > MAX_BACKLOG_ITEMS,
        phase: stale.length > 0 ? "refresh" : "done",
      };
      await checkpoint(runId, cursor);
    }

    if (cursor.phase === "refresh") {
      const finished = await readBatches(
        cursor.staleIds,
        () => cursor.nextStaleBatch,
        (_, patch) => {
          cursor = { ...cursor, ...patch, nextStaleBatch: cursor.nextStaleBatch + 1 };
        },
        true,
      );
      if (finished) {
        cursor = { ...cursor, phase: "done" };
        await checkpoint(runId, cursor);
      }
    }

    if (cursor.phase === "done") {
      const status =
        cursor.failed > 0 || cursor.truncated || cursor.skippedTypes.length > 0
          ? "partial"
          : "succeeded";
      // The watermark only moves after a failure-free, untruncated pass.
      if (status === "succeeded") {
        await saveWatermark(target, runRow.data.connection_id, runId, cursor);
      }
      const finishedAt = new Date().toISOString();
      await checkpoint(runId, cursor, {
        status,
        finished_at: finishedAt,
        finalized_at: finishedAt,
      });
      return { runId, status, cursor, failure: null };
    }

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

async function loadContext(target: ResolvedTeamIteration) {
  const [reference, iterationIdByPath] = await Promise.all([
    loadWorkItemReference(target),
    loadIterationIdsByPath(target.tenantId, target.projectId),
  ]);
  return { reference, iterationIdByPath };
}

async function saveWatermark(
  target: ResolvedTeamIteration,
  connectionId: string,
  runId: string,
  cursor: BacklogSyncCursor,
): Promise<void> {
  const prior = await readWatermark(target.tenantId, connectionId, target.projectId);
  const watermarkAt = laterOf(prior?.watermarkAt ?? null, cursor.maxChangedAt);
  const lastFull =
    cursor.mode === "full" ? new Date().toISOString() : (prior?.lastFullReconcileAt ?? null);
  // Nothing observed yet: keep the run a full pass next time.
  if (!watermarkAt || !lastFull) return;
  await supabaseAdmin.from("ops_sync_cursors").upsert(
    {
      tenant_id: target.tenantId,
      connection_id: connectionId,
      entity_kind: BACKLOG_CURSOR_KIND,
      project_id: target.projectId,
      watermark_at: watermarkAt,
      watermark_token: serializeBacklogToken(lastFull, WORK_ITEM_RULE_VERSION),
      last_run_id: runId,
    },
    { onConflict: "tenant_id,connection_id,entity_kind,project_id" },
  );
}
