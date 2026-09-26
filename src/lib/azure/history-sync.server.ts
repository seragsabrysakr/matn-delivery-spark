/**
 * Resumable work item history synchronization (ADR-017).
 *
 * For every synchronized work item of the project whose Azure revision is
 * ahead of its ingested history, reads only the missing revisions
 * (`GET _apis/wit/workItems/{id}/revisions`), stores them append-only, and
 * derives state transitions, sprint scope changes and the exact moment the
 * item entered its current board column.
 *
 * Read-only against Azure DevOps. Every advance is time-bounded and
 * checkpointed into `ops_sync_runs.details`; history rows are insert-only
 * (`ON CONFLICT DO NOTHING`), so a resumed or repeated run never duplicates.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { AzureDevOpsClient } from "./client.server";
import { AzureDevOpsError, toAzureFailure, type AzureFailure } from "./errors";
import {
  deriveColumnEntry,
  deriveScopeChanges,
  deriveTransitions,
  type RevisionRecord,
} from "./revision-rules";
import { ensureConnection } from "./sync.server";
import { WORK_ITEM_ADVANCE_BUDGET_MS, WORK_ITEM_REQUEST_TIMEOUT_MS } from "./wiql";
import { loadWorkItemReference } from "./work-item-persist.server";
import { mapRawRevision } from "./workitem-map";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import type { StateCategory } from "@/types/domain/work-item";

const ENTITY_KIND = "work_item_history";
/** Upper bound of items queued per run; the next run continues the rest. */
export const MAX_HISTORY_ITEMS_PER_RUN = 2_000;
const PAGE = 1_000;

export type HistorySyncPhase = "discover" | "read" | "done";

interface PendingItem {
  readonly id: string;
  readonly azureId: number;
  readonly azureRev: number;
  readonly syncedRev: number;
  readonly boardColumn: string | null;
}

export interface HistorySyncCursor {
  readonly phase: HistorySyncPhase;
  readonly projectId: string;
  readonly pending: readonly PendingItem[];
  readonly next: number;
  /** Items still behind after this run's ceiling; picked up next run. */
  readonly remaining: number;
  readonly items: number;
  readonly revisions: number;
  readonly transitions: number;
  readonly scopeChanges: number;
  readonly columnEntries: number;
  readonly failed: number;
}

export interface HistorySyncStatus {
  readonly runId: string;
  readonly status: "queued" | "running" | "succeeded" | "partial" | "failed";
  readonly cursor: HistorySyncCursor;
  readonly failure: AzureFailure | null;
}

const emptyCursor = (projectId: string): HistorySyncCursor => ({
  phase: "discover",
  projectId,
  pending: [],
  next: 0,
  remaining: 0,
  items: 0,
  revisions: 0,
  transitions: 0,
  scopeChanges: 0,
  columnEntries: 0,
  failed: 0,
});

const readCursor = (details: unknown, projectId: string): HistorySyncCursor => {
  const raw = (details as { cursor?: Partial<HistorySyncCursor> } | null)?.cursor;
  if (!raw || raw.projectId !== projectId) return emptyCursor(projectId);
  return { ...emptyCursor(projectId), ...raw, projectId };
};

async function checkpoint(
  runId: string,
  cursor: HistorySyncCursor,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin
    .from("ops_sync_runs")
    .update({
      details: { cursor } as unknown as Json,
      items_read: cursor.revisions,
      items_written: cursor.revisions + cursor.transitions + cursor.scopeChanges,
      error_count: cursor.failed,
      ...patch,
    })
    .eq("id", runId);
}

/** Creates or rejoins the single active history run for the target's project. */
export async function startHistorySync(
  target: ResolvedTeamIteration,
  actorUserId: string,
): Promise<HistorySyncStatus> {
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
      status: existing.status as HistorySyncStatus["status"],
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

/** Items of the project whose Azure revision is ahead of the ingested history. */
async function findHistoryGaps(
  tenantId: string,
  projectId: string,
): Promise<{ pending: PendingItem[]; total: number }> {
  const gaps: PendingItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("az_work_items")
      .select("id, azure_work_item_id, azure_rev, revisions_synced_rev, board_column")
      .eq("tenant_id", tenantId)
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("azure_work_item_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new AzureDevOpsError("unknown");
    for (const row of data ?? []) {
      const synced = row.revisions_synced_rev ?? 0;
      if (row.azure_rev > synced) {
        gaps.push({
          id: row.id,
          azureId: Number(row.azure_work_item_id),
          azureRev: row.azure_rev,
          syncedRev: synced,
          boardColumn: row.board_column,
        });
      }
    }
    if ((data ?? []).length < PAGE) break;
  }
  return { pending: gaps.slice(0, MAX_HISTORY_ITEMS_PER_RUN), total: gaps.length };
}

async function loadIterationIdsByPath(tenantId: string, projectId: string) {
  const { data } = await supabaseAdmin
    .from("core_iterations")
    .select("id, azure_iteration_path")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("is_deleted", false);
  return new Map((data ?? []).map((row) => [row.azure_iteration_path.toLowerCase(), row.id]));
}

async function loadStoredRevisions(
  tenantId: string,
  workItemId: string,
): Promise<RevisionRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("az_work_item_revisions")
    .select(
      "rev, revised_at, revised_by_member_id, state, state_category, iteration_path, area_path, estimate, assigned_to_member_id, fields",
    )
    .eq("tenant_id", tenantId)
    .eq("work_item_id", workItemId)
    .order("rev", { ascending: true });
  if (error) throw new AzureDevOpsError("unknown");
  return (data ?? []).map((row) => {
    const fields = (row.fields ?? {}) as Record<string, unknown>;
    return {
      rev: row.rev,
      revisedAt: row.revised_at,
      revisedByMemberId: row.revised_by_member_id,
      state: row.state,
      stateCategory: row.state_category as StateCategory,
      iterationPath: row.iteration_path,
      areaPath: row.area_path,
      estimate: row.estimate === null ? null : Number(row.estimate),
      assignedToMemberId: row.assigned_to_member_id,
      boardColumn: typeof fields["boardColumn"] === "string" ? fields["boardColumn"] : null,
    };
  });
}

/** One bounded, checkpointed slice. Callers keep invoking until `phase === "done"`. */
export async function advanceHistorySync(
  runId: string,
  target: ResolvedTeamIteration,
  options: { readonly budgetMs?: number; readonly client?: AzureDevOpsClient } = {},
): Promise<HistorySyncStatus> {
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
      status: runRow.data.status as HistorySyncStatus["status"],
      cursor,
      failure: null,
    };
  }

  const client =
    options.client ??
    AzureDevOpsClient.fromEnvironment({ timeoutMs: WORK_ITEM_REQUEST_TIMEOUT_MS });

  try {
    if (cursor.phase === "discover") {
      const { pending, total } = await findHistoryGaps(target.tenantId, target.projectId);
      cursor = {
        ...cursor,
        pending,
        remaining: Math.max(0, total - pending.length),
        phase: pending.length > 0 ? "read" : "done",
      };
      await checkpoint(runId, cursor);
    }

    if (cursor.phase === "read") {
      const [reference, iterationIdByPath] = await Promise.all([
        loadWorkItemReference(target),
        loadIterationIdsByPath(target.tenantId, target.projectId),
      ]);

      while (cursor.next < cursor.pending.length && Date.now() < deadline) {
        const item = cursor.pending[cursor.next]!;
        const result = await ingestItemHistory(
          target,
          client,
          item,
          reference,
          iterationIdByPath,
        ).catch(() => null);
        cursor = {
          ...cursor,
          next: cursor.next + 1,
          items: cursor.items + (result ? 1 : 0),
          failed: cursor.failed + (result ? 0 : 1),
          revisions: cursor.revisions + (result?.revisions ?? 0),
          transitions: cursor.transitions + (result?.transitions ?? 0),
          scopeChanges: cursor.scopeChanges + (result?.scopeChanges ?? 0),
          columnEntries: cursor.columnEntries + (result?.columnEntry ? 1 : 0),
        };
        if (cursor.next % 10 === 0) await checkpoint(runId, cursor);
      }
      if (cursor.next >= cursor.pending.length) cursor = { ...cursor, phase: "done" };
      await checkpoint(runId, cursor);
    }

    if (cursor.phase === "done") {
      const status = cursor.failed > 0 || cursor.remaining > 0 ? "partial" : "succeeded";
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

async function ingestItemHistory(
  target: ResolvedTeamIteration,
  client: AzureDevOpsClient,
  item: PendingItem,
  reference: Awaited<ReturnType<typeof loadWorkItemReference>>,
  iterationIdByPath: ReadonlyMap<string, string>,
): Promise<{
  revisions: number;
  transitions: number;
  scopeChanges: number;
  columnEntry: boolean;
}> {
  const raws = await client.listWorkItemRevisions(
    target.azureProjectId,
    item.azureId,
    item.syncedRev,
  );
  const mapped = raws
    .map((raw) => mapRawRevision(raw, reference.mapping, reference.resolveMember))
    .filter((revision): revision is NonNullable<typeof revision> => revision !== null);

  if (mapped.length > 0) {
    const { error } = await supabaseAdmin.from("az_work_item_revisions").upsert(
      mapped.map((revision) => ({
        tenant_id: target.tenantId,
        project_id: target.projectId,
        work_item_id: item.id,
        azure_work_item_id: item.azureId,
        rev: revision.rev,
        revised_at: revision.revisedAt,
        revised_by_member_id: revision.revisedByMemberId,
        state: revision.state,
        state_category: revision.stateCategory,
        iteration_path: revision.iterationPath,
        area_path: revision.areaPath,
        estimate: revision.estimate,
        remaining_work: revision.remainingWork,
        completed_work: revision.completedWork,
        is_blocked: revision.isBlocked,
        assigned_to_member_id: revision.assignedToMemberId,
        fields: revision.fields as unknown as Json,
      })),
      { onConflict: "tenant_id,work_item_id,rev", ignoreDuplicates: true },
    );
    if (error) throw new AzureDevOpsError("unknown");
  }

  // Derive from the whole stored history, so durations span earlier runs.
  const history = await loadStoredRevisions(target.tenantId, item.id);
  const transitions = deriveTransitions(history);
  const scopeChanges = deriveScopeChanges(history, iterationIdByPath);

  if (transitions.length > 0) {
    const { error } = await supabaseAdmin.from("az_work_item_transitions").upsert(
      transitions.map((t) => ({
        tenant_id: target.tenantId,
        project_id: target.projectId,
        work_item_id: item.id,
        occurred_at: t.occurredAt,
        from_state: t.fromState,
        to_state: t.toState,
        from_state_category: t.fromStateCategory,
        to_state_category: t.toStateCategory,
        duration_seconds: t.durationSeconds,
        changed_by_member_id: t.changedByMemberId,
        source_rev: t.sourceRev,
      })),
      { onConflict: "tenant_id,work_item_id,occurred_at,to_state", ignoreDuplicates: true },
    );
    if (error) throw new AzureDevOpsError("unknown");
  }

  if (scopeChanges.length > 0) {
    const { error } = await supabaseAdmin.from("az_work_item_scope_changes").upsert(
      scopeChanges.map((c) => ({
        tenant_id: target.tenantId,
        project_id: target.projectId,
        work_item_id: item.id,
        iteration_id: c.iterationId,
        occurred_at: c.occurredAt,
        change_type: c.changeType,
        estimate_delta: c.estimateDelta,
        source_rev: c.sourceRev,
      })),
      {
        onConflict: "tenant_id,work_item_id,iteration_id,occurred_at,change_type",
        ignoreDuplicates: true,
      },
    );
    if (error) throw new AzureDevOpsError("unknown");
  }

  const latestRev = Math.max(item.azureRev, ...history.map((r) => r.rev));
  const entry = deriveColumnEntry(history, latestRev);
  const entryMatches =
    entry !== null &&
    (item.boardColumn ?? "").trim().toLowerCase() === entry.column.trim().toLowerCase();
  const syncedRev = history.length > 0 ? Math.max(...history.map((r) => r.rev)) : item.syncedRev;

  const { error } = await supabaseAdmin
    .from("az_work_items")
    .update({
      revisions_synced_rev: syncedRev,
      ...(entryMatches ? { board_column_entered_at: entry.enteredAt } : {}),
    })
    .eq("tenant_id", target.tenantId)
    .eq("id", item.id);
  if (error) throw new AzureDevOpsError("unknown");

  return {
    revisions: mapped.length,
    transitions: transitions.length,
    scopeChanges: scopeChanges.length,
    columnEntry: entryMatches,
  };
}
