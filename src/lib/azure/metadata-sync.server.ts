/**
 * Server-only synchronization of Azure DevOps process and board metadata
 * (ADR-013): work item types with their states and Azure state category, and
 * each team's boards with their columns in Azure order.
 *
 * Read-only (GET only). Idempotent natural-key upserts; rows missing from a
 * complete pass are tombstoned, never deleted; an incomplete pass never
 * tombstones.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AzureDevOpsClient } from "./client.server";
import {
  buildAzureStateIndex,
  isMetadataStale,
  normalizeBoardColumns,
  normalizeTypeStates,
  type AzureStateIndex,
  type NormalizedBoardColumn,
} from "./metadata-rules";
import type { StateCategorySource } from "./process-mapping";
import type { AzureWorkItemStateColor } from "@/types/azure";
import type { StateCategory } from "@/types/domain/work-item";

export interface MetadataSyncResult {
  readonly complete: boolean;
  readonly discovered: number;
  readonly written: number;
  readonly tombstoned: number;
  readonly warnings: readonly string[];
}

interface ProjectScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly azureProjectId: string;
}

interface TeamScope extends ProjectScope {
  readonly teamId: string;
  readonly azureTeamId: string;
}

const tombstone = { source_status: "deleted" as const, is_deleted: true };

/** Work item types and their states for one project. */
export async function syncProjectProcessMetadata(
  scope: ProjectScope,
  client: AzureDevOpsClient,
  now: () => Date = () => new Date(),
): Promise<MetadataSyncResult> {
  const warnings: string[] = [];
  const seenIso = now().toISOString();
  let complete = true;
  let written = 0;
  let tombstoned = 0;

  const types = await client.listWorkItemTypes(scope.azureProjectId);

  for (const type of types) {
    if (!type?.name) continue;
    let states: readonly AzureWorkItemStateColor[] = type.states ?? [];
    if (states.length === 0) {
      try {
        states = await client.listWorkItemTypeStates(scope.azureProjectId, type.name);
      } catch {
        complete = false;
        warnings.push(`states_incomplete:${type.name}`);
        continue;
      }
    }

    const { data: typeRow, error: typeError } = await supabaseAdmin
      .from("az_work_item_types")
      .upsert(
        {
          tenant_id: scope.tenantId,
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          name: type.name,
          reference_name: type.referenceName ?? null,
          description: type.description ?? null,
          color: type.color ?? null,
          icon_url: type.icon?.url ?? null,
          is_disabled: type.isDisabled === true,
          source_status: "active",
          is_deleted: false,
          deleted_at_source: null,
          last_seen_at: seenIso,
          last_synced_at: seenIso,
        },
        { onConflict: "tenant_id,project_id,name" },
      )
      .select("id")
      .single();
    if (typeError || !typeRow) {
      complete = false;
      warnings.push(`type_write_failed:${type.name}`);
      continue;
    }
    written += 1;

    const normalized = normalizeTypeStates(states);
    if (normalized.length > 0) {
      const { error } = await supabaseAdmin.from("az_work_item_type_states").upsert(
        normalized.map((state) => ({
          tenant_id: scope.tenantId,
          project_id: scope.projectId,
          work_item_type_id: typeRow.id,
          state_name: state.stateName,
          azure_category: state.azureCategory,
          state_category: state.stateCategory,
          color: state.color,
          sort_order: state.sortOrder,
          source_status: "active" as const,
          is_deleted: false,
          deleted_at_source: null,
          last_seen_at: seenIso,
          last_synced_at: seenIso,
        })),
        { onConflict: "tenant_id,work_item_type_id,state_name" },
      );
      if (error) {
        complete = false;
        warnings.push(`states_write_failed:${type.name}`);
        continue;
      }
      written += normalized.length;
    }

    const { data: goneStates } = await supabaseAdmin
      .from("az_work_item_type_states")
      .update({ ...tombstone, deleted_at_source: seenIso })
      .eq("tenant_id", scope.tenantId)
      .eq("work_item_type_id", typeRow.id)
      .eq("is_deleted", false)
      .lt("last_seen_at", seenIso)
      .select("id");
    tombstoned += goneStates?.length ?? 0;
  }

  if (complete) {
    const { data: goneTypes } = await supabaseAdmin
      .from("az_work_item_types")
      .update({ ...tombstone, deleted_at_source: seenIso })
      .eq("tenant_id", scope.tenantId)
      .eq("project_id", scope.projectId)
      .eq("is_deleted", false)
      .lt("last_seen_at", seenIso)
      .select("id");
    tombstoned += goneTypes?.length ?? 0;
  }

  return { complete, discovered: types.length, written, tombstoned, warnings };
}

/** Boards and board columns for one team. */
export async function syncTeamBoardMetadata(
  scope: TeamScope,
  client: AzureDevOpsClient,
  now: () => Date = () => new Date(),
): Promise<MetadataSyncResult> {
  const warnings: string[] = [];
  const seenIso = now().toISOString();
  let complete = true;
  let written = 0;
  let tombstoned = 0;

  const boards = await client.listTeamBoards(scope.azureProjectId, scope.azureTeamId);

  for (const board of boards) {
    if (!board?.id || !board.name) continue;
    let columns: NormalizedBoardColumn[];
    try {
      columns = normalizeBoardColumns(
        await client.listBoardColumns(scope.azureProjectId, scope.azureTeamId, board.id),
      );
    } catch {
      complete = false;
      warnings.push(`columns_incomplete:${board.name}`);
      continue;
    }

    const { data: boardRow, error: boardError } = await supabaseAdmin
      .from("az_team_boards")
      .upsert(
        {
          tenant_id: scope.tenantId,
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          team_id: scope.teamId,
          azure_board_id: board.id,
          name: board.name,
          source_status: "active",
          is_deleted: false,
          deleted_at_source: null,
          last_seen_at: seenIso,
          last_synced_at: seenIso,
        },
        { onConflict: "tenant_id,team_id,azure_board_id" },
      )
      .select("id")
      .single();
    if (boardError || !boardRow) {
      complete = false;
      warnings.push(`board_write_failed:${board.name}`);
      continue;
    }
    written += 1;

    if (columns.length > 0) {
      const { error } = await supabaseAdmin.from("az_board_columns").upsert(
        columns.map((column) => ({
          tenant_id: scope.tenantId,
          project_id: scope.projectId,
          team_id: scope.teamId,
          board_id: boardRow.id,
          azure_column_id: column.azureColumnId,
          name: column.name,
          column_order: column.columnOrder,
          column_type: column.columnType,
          item_limit: column.itemLimit,
          is_split: column.isSplit,
          description: column.description,
          state_mappings: column.stateMappings,
          source_status: "active" as const,
          is_deleted: false,
          deleted_at_source: null,
          last_seen_at: seenIso,
          last_synced_at: seenIso,
        })),
        { onConflict: "tenant_id,board_id,azure_column_id" },
      );
      if (error) {
        complete = false;
        warnings.push(`columns_write_failed:${board.name}`);
        continue;
      }
      written += columns.length;
    }

    const { data: goneColumns } = await supabaseAdmin
      .from("az_board_columns")
      .update({ ...tombstone, deleted_at_source: seenIso })
      .eq("tenant_id", scope.tenantId)
      .eq("board_id", boardRow.id)
      .eq("is_deleted", false)
      .lt("last_seen_at", seenIso)
      .select("id");
    tombstoned += goneColumns?.length ?? 0;
  }

  if (complete) {
    const { data: goneBoards } = await supabaseAdmin
      .from("az_team_boards")
      .update({ ...tombstone, deleted_at_source: seenIso })
      .eq("tenant_id", scope.tenantId)
      .eq("team_id", scope.teamId)
      .eq("is_deleted", false)
      .lt("last_seen_at", seenIso)
      .select("id");
    tombstoned += goneBoards?.length ?? 0;
  }

  return { complete, discovered: boards.length, written, tombstoned, warnings };
}

async function latestTypesSync(tenantId: string, projectId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("az_work_item_types")
    .select("last_synced_at")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_synced_at ?? null;
}

async function latestBoardsSync(tenantId: string, teamId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("az_team_boards")
    .select("last_synced_at")
    .eq("tenant_id", tenantId)
    .eq("team_id", teamId)
    .eq("is_deleted", false)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_synced_at ?? null;
}

/**
 * Refreshes stale process and board metadata before a work item sync. A
 * failure here never fails the sync: states then resolve through the
 * fallback path, which is itself reported as a data-quality issue.
 */
export async function ensureMetadataFresh(
  scope: TeamScope,
  client: AzureDevOpsClient,
  nowMs: number = Date.now(),
): Promise<readonly string[]> {
  const warnings: string[] = [];
  const [typesAt, boardsAt] = await Promise.all([
    latestTypesSync(scope.tenantId, scope.projectId),
    latestBoardsSync(scope.tenantId, scope.teamId),
  ]);

  if (isMetadataStale(typesAt, nowMs)) {
    try {
      warnings.push(...(await syncProjectProcessMetadata(scope, client)).warnings);
    } catch {
      warnings.push("process_metadata_unavailable");
    }
  }
  if (isMetadataStale(boardsAt, nowMs)) {
    try {
      warnings.push(...(await syncTeamBoardMetadata(scope, client)).warnings);
    } catch {
      warnings.push("board_metadata_unavailable");
    }
  }
  return warnings;
}

/** The project's synchronized state categories, or null when none exist yet. */
export async function loadAzureStateIndex(
  tenantId: string,
  projectId: string,
): Promise<AzureStateIndex | null> {
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
  if (types.error || states.error || (states.data ?? []).length === 0) return null;

  const typeName = new Map((types.data ?? []).map((row) => [row.id, row.name]));
  return buildAzureStateIndex(
    (states.data ?? []).flatMap((row) => {
      const name = typeName.get(row.work_item_type_id);
      return name
        ? [{ workItemType: name, stateName: row.state_name, stateCategory: row.state_category }]
        : [];
    }),
  );
}

export interface StateResolutionGap {
  readonly azureType: string;
  readonly state: string;
  readonly source: Extract<StateCategorySource, "fallback" | "none">;
  readonly category: StateCategory;
}

/**
 * Records every state that could not be resolved from tenant configuration
 * or Azure metadata. Idempotent on the issue's natural key.
 */
export async function recordStateResolutionGaps(
  tenantId: string,
  projectId: string,
  gaps: readonly StateResolutionGap[],
): Promise<void> {
  if (gaps.length === 0) return;
  const nowIso = new Date().toISOString();
  const unique = new Map(gaps.map((gap) => [`${gap.azureType}\u0000${gap.state}`, gap]));
  await supabaseAdmin.from("ops_data_quality_issues").upsert(
    [...unique.values()].map((gap) => ({
      tenant_id: tenantId,
      project_id: projectId,
      rule_id: gap.source === "fallback" ? "state_category_fallback" : "state_category_unknown",
      entity_kind: "project",
      entity_id: projectId,
      field: `${gap.azureType} / ${gap.state}`,
      severity: gap.source === "fallback" ? ("low" as const) : ("medium" as const),
      message_en:
        gap.source === "fallback"
          ? `State "${gap.state}" of "${gap.azureType}" is not in the synchronized Azure metadata; the built-in fallback mapped it to "${gap.category}".`
          : `State "${gap.state}" of "${gap.azureType}" has no known category; it is counted as unknown.`,
      message_ar:
        gap.source === "fallback"
          ? `الحالة "${gap.state}" لنوع "${gap.azureType}" غير موجودة في بيانات Azure المتزامنة؛ تم تصنيفها احتياطياً كـ "${gap.category}".`
          : `الحالة "${gap.state}" لنوع "${gap.azureType}" بدون تصنيف معروف؛ تُحتسب كغير معروفة.`,
      details: { azure_type: gap.azureType, state: gap.state, category: gap.category },
      last_seen_at: nowIso,
    })),
    { onConflict: "tenant_id,rule_id,entity_kind,entity_id,field" },
  );
}
