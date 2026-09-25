/**
 * Resumable current-sprint work item synchronization.
 *
 * Read-only against Azure DevOps: WIQL to discover the sprint scope, then the
 * work-items batch reader. Every advance is time-bounded and checkpointed into
 * `ops_sync_runs.details`, so a worker timeout resumes exactly where it stopped
 * instead of restarting the sprint.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AzureDevOpsClient } from "./client.server";
import { AzureDevOpsError, toAzureFailure, type AzureFailure } from "./errors";
import {
  buildIterationWiql,
  buildWorkItemsBatchBody,
  chunkIds,
  MAX_WORK_ITEMS_PER_SPRINT,
  WORK_ITEM_ADVANCE_BUDGET_MS,
  WORK_ITEM_REQUEST_TIMEOUT_MS,
} from "./wiql";
import { ensureMetadataFresh } from "./metadata-sync.server";
import { loadWorkItemReference, persistWorkItemBatch } from "./work-item-persist.server";
import { ensureConnection } from "./sync.server";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";

export type WorkItemSyncPhase = "discover" | "read" | "reconcile" | "done";

export interface WorkItemSyncCursor {
  readonly phase: WorkItemSyncPhase;
  readonly teamIterationId: string;
  readonly ids: number[];
  /** Index of the next batch to read. */
  readonly nextBatch: number;
  readonly totalBatches: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly removedFromSprint: number;
  readonly truncated: boolean;
}

export interface WorkItemSyncStatus {
  readonly runId: string;
  readonly status: "queued" | "running" | "succeeded" | "partial" | "failed";
  readonly cursor: WorkItemSyncCursor;
  readonly failure: AzureFailure | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

const BATCH_SIZE = 200;

const emptyCursor = (teamIterationId: string): WorkItemSyncCursor => ({
  phase: "discover",
  teamIterationId,
  ids: [],
  nextBatch: 0,
  totalBatches: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  failed: 0,
  removedFromSprint: 0,
  truncated: false,
});

const readCursor = (details: unknown, teamIterationId: string): WorkItemSyncCursor => {
  const raw = (details as { cursor?: Partial<WorkItemSyncCursor> } | null)?.cursor;
  if (!raw || raw.teamIterationId !== teamIterationId) return emptyCursor(teamIterationId);
  return { ...emptyCursor(teamIterationId), ...raw, teamIterationId };
};

async function checkpoint(
  runId: string,
  cursor: WorkItemSyncCursor,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("ops_sync_runs")
    .update({
      details: { cursor } as unknown as Json,
      items_read: cursor.ids.length,
      items_written: cursor.inserted + cursor.updated,
      error_count: cursor.failed,
      ...patch,
    })
    .eq("id", runId);
}

/** Creates or reuses the single active work-item run for this sprint. */
export async function startWorkItemSync(
  target: ResolvedTeamIteration,
  actorUserId: string,
): Promise<WorkItemSyncStatus> {
  const active = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, details, started_at, finished_at")
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
    .contains("entity_kinds", ["work_items"])
    .in("status", ["queued", "running"])
    .order("started_at", { ascending: false })
    .limit(1);

  const existing = (active.data ?? [])[0];
  if (existing) {
    const cursor = readCursor(existing.details, target.teamIterationId);
    if (cursor.teamIterationId === target.teamIterationId) {
      return {
        runId: existing.id,
        status: existing.status as WorkItemSyncStatus["status"],
        cursor,
        failure: null,
        startedAt: existing.started_at,
        finishedAt: existing.finished_at,
      };
    }
    throw new AzureDevOpsError("conflict");
  }

  const cursor = emptyCursor(target.teamIterationId);
  const connectionId = await ensureConnection(target.tenantId, target.organizationId);
  const { data, error } = await supabaseAdmin
    .from("ops_sync_runs")
    .insert({
      tenant_id: target.tenantId,
      connection_id: connectionId,
      organization_id: target.organizationId,
      project_id: target.projectId,
      trigger_kind: "manual",
      status: "running",
      entity_kinds: ["work_items"],
      started_at: new Date().toISOString(),
      details: { cursor, actor_user_id: actorUserId } as unknown as Json,
    })
    .select("id, started_at")
    .single();
  if (error || !data) throw new AzureDevOpsError("unknown");

  return {
    runId: data.id,
    status: "running",
    cursor,
    failure: null,
    startedAt: data.started_at,
    finishedAt: null,
  };
}

/**
 * Performs one bounded slice of work and checkpoints. Callers keep invoking
 * until `phase === "done"`, which makes the whole sprint sync interruptible.
 */
export async function advanceWorkItemSync(
  runId: string,
  target: ResolvedTeamIteration,
  options: { readonly budgetMs?: number; readonly client?: AzureDevOpsClient } = {},
): Promise<WorkItemSyncStatus> {
  const budgetMs = options.budgetMs ?? WORK_ITEM_ADVANCE_BUDGET_MS;
  const deadline = Date.now() + budgetMs;

  const runRow = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, details, started_at, finished_at")
    .eq("tenant_id", target.tenantId)
    .eq("id", runId)
    .maybeSingle();
  if (runRow.error || !runRow.data) throw new AzureDevOpsError("forbidden");

  let cursor = readCursor(runRow.data.details, target.teamIterationId);
  if (cursor.phase === "done") {
    return {
      runId,
      status: runRow.data.status as WorkItemSyncStatus["status"],
      cursor,
      failure: null,
      startedAt: runRow.data.started_at,
      finishedAt: runRow.data.finished_at,
    };
  }

  const client =
    options.client ??
    AzureDevOpsClient.fromEnvironment({ timeoutMs: WORK_ITEM_REQUEST_TIMEOUT_MS });

  // States and board columns come from Azure, not from code (ADR-013). Refresh
  // them once per run, before the first read, when they are stale.
  if (cursor.phase === "discover" && target.azureTeamId) {
    await ensureMetadataFresh(
      {
        tenantId: target.tenantId,
        organizationId: target.organizationId,
        projectId: target.projectId,
        azureProjectId: target.azureProjectId,
        teamId: target.teamId,
        azureTeamId: target.azureTeamId,
      },
      client,
    );
  }

  const reference = await loadWorkItemReference(target);
  const { mapping } = reference;

  try {
    if (cursor.phase === "discover") {
      const wiql = buildIterationWiql({
        projectName: target.azureProjectName,
        iterationPath: target.iterationPath,
        workItemTypes: mapping.workItemTypes,
      });
      const result = await client.postAllowlisted<{ workItems?: { id: number }[] }>(
        "wiql",
        target.azureProjectId,
        { query: wiql },
      );
      const allIds = (result.workItems ?? []).map((item) => item.id);
      const ids = allIds.slice(0, MAX_WORK_ITEMS_PER_SPRINT);
      cursor = {
        ...cursor,
        phase: ids.length > 0 ? "read" : "reconcile",
        ids,
        totalBatches: chunkIds(ids, BATCH_SIZE).length,
        truncated: allIds.length > ids.length,
      };
      await checkpoint(runId, cursor);
    }

    if (cursor.phase === "read") {
      const batches = chunkIds(cursor.ids, BATCH_SIZE);
      while (cursor.nextBatch < batches.length && Date.now() < deadline) {
        const batch = batches[cursor.nextBatch]!;
        const response = await client.postAllowlisted<{
          value?: { id: number; rev?: number; fields: Record<string, unknown> }[];
        }>("workItemsBatch", target.azureProjectId, buildWorkItemsBatchBody(batch));

        const result = await persistWorkItemBatch({
          tenantId: target.tenantId,
          organizationId: target.organizationId,
          projectId: target.projectId,
          raws: response.value ?? [],
          reference,
          contextFor: () => ({
            projectId: target.projectId,
            teamId: target.teamId,
            iterationId: target.iterationId,
            teamIterationId: target.teamIterationId,
            resolveMember: reference.resolveMember,
            organizationBaseUrl: target.organizationBaseUrl,
            azureProjectName: target.azureProjectName,
          }),
        });
        const { inserted, updated, unchanged, failed } = result;

        cursor = {
          ...cursor,
          nextBatch: cursor.nextBatch + 1,
          inserted: cursor.inserted + inserted,
          updated: cursor.updated + updated,
          unchanged: cursor.unchanged + unchanged,
          failed: cursor.failed + failed,
        };
        await checkpoint(runId, cursor);
      }

      if (cursor.nextBatch >= batches.length) {
        cursor = { ...cursor, phase: "reconcile" };
        await checkpoint(runId, cursor);
      }
    }

    if (cursor.phase === "reconcile" && Date.now() < deadline) {
      // Items previously in this sprint that Azure no longer returns have been
      // moved out of the iteration. They are detached, never deleted.
      const stale = await supabaseAdmin
        .from("az_work_items")
        .select("id, azure_work_item_id")
        .eq("tenant_id", target.tenantId)
        .eq("iteration_id", target.iterationId)
        .eq("is_deleted", false);
      const keep = new Set(cursor.ids);
      const detach = (stale.data ?? []).filter((row) => !keep.has(Number(row.azure_work_item_id)));
      if (detach.length > 0) {
        await supabaseAdmin
          .from("az_work_items")
          .update({ iteration_id: null, counts_toward_scope: false })
          .in(
            "id",
            detach.map((row) => row.id),
          );
      }
      cursor = { ...cursor, phase: "done", removedFromSprint: detach.length };
      const status = cursor.failed > 0 ? "partial" : "succeeded";
      await checkpoint(runId, cursor, {
        status,
        finished_at: new Date().toISOString(),
        finalized_at: new Date().toISOString(),
      });
      return {
        runId,
        status,
        cursor,
        failure: null,
        startedAt: runRow.data.started_at,
        finishedAt: new Date().toISOString(),
      };
    }

    await checkpoint(runId, cursor);
    return {
      runId,
      status: "running",
      cursor,
      failure: null,
      startedAt: runRow.data.started_at,
      finishedAt: null,
    };
  } catch (error) {
    const failure = toAzureFailure(error);
    await checkpoint(runId, cursor, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_count: cursor.failed + 1,
    });
    return {
      runId,
      status: "failed",
      cursor,
      failure,
      startedAt: runRow.data.started_at,
      finishedAt: null,
    };
  }
}

export async function getWorkItemSyncStatus(
  target: ResolvedTeamIteration,
): Promise<WorkItemSyncStatus | null> {
  const { data } = await supabaseAdmin
    .from("ops_sync_runs")
    .select("id, status, details, started_at, finished_at")
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
    .contains("entity_kinds", ["work_items"])
    .order("started_at", { ascending: false })
    .limit(5);

  const row = (data ?? []).find(
    (candidate) =>
      readCursor(candidate.details, target.teamIterationId).ids.length >= 0 &&
      (candidate.details as { cursor?: { teamIterationId?: string } } | null)?.cursor
        ?.teamIterationId === target.teamIterationId,
  );
  if (!row) return null;

  return {
    runId: row.id,
    status: row.status as WorkItemSyncStatus["status"],
    cursor: readCursor(row.details, target.teamIterationId),
    failure: null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
