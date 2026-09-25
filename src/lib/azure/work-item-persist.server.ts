/**
 * Shared persistence for work items read from Azure DevOps, used by both the
 * current-sprint sync and the project backlog sync.
 *
 * Natural identity is (tenant_id, organization_id, azure_work_item_id); a
 * freshness-only touch is counted as `unchanged`, never as an update.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "./errors";
import { boardColumnEnteredAt } from "./metadata-rules";
import {
  loadAzureStateIndex,
  recordStateResolutionGaps,
  type StateResolutionGap,
} from "./metadata-sync.server";
import {
  resolveProcessMapping,
  type ProcessMappingRow,
  type ProcessTemplateKind,
  type ResolvedProcessMapping,
} from "./process-mapping";
import {
  diffWorkItem,
  mapAzureWorkItem,
  type AzureIdentityLike,
  type MapWorkItemContext,
} from "./workitem-map";

export interface WorkItemReference {
  readonly mapping: ResolvedProcessMapping;
  readonly resolveMember: (ref: AzureIdentityLike | null | undefined) => string | null;
}

export interface WorkItemScope {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly processMappingId: string | null;
  readonly processTemplateKind: ProcessTemplateKind;
}

/** Process mapping (with synced Azure states) and the member resolver for a project. */
export async function loadWorkItemReference(scope: WorkItemScope): Promise<WorkItemReference> {
  const [mappingRow, members, azureStates] = await Promise.all([
    scope.processMappingId
      ? supabaseAdmin
          .from("core_process_mappings")
          .select(
            "work_item_type_aliases, state_category_map, done_states, active_states, blocked_fields, estimate_fields, severity_field, bug_handling_mode",
          )
          .eq("tenant_id", scope.tenantId)
          .eq("id", scope.processMappingId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("core_members")
      .select("id, azure_descriptor, azure_unique_name")
      .eq("tenant_id", scope.tenantId)
      .eq("organization_id", scope.organizationId),
    loadAzureStateIndex(scope.tenantId, scope.projectId),
  ]);

  const memberByDescriptor = new Map<string, string>();
  const memberByUniqueName = new Map<string, string>();
  for (const member of members.data ?? []) {
    if (member.azure_descriptor) memberByDescriptor.set(String(member.azure_descriptor), member.id);
    if (member.azure_unique_name)
      memberByUniqueName.set(String(member.azure_unique_name).toLowerCase(), member.id);
  }

  return {
    mapping: resolveProcessMapping(
      (mappingRow.data as ProcessMappingRow | null) ?? null,
      scope.processTemplateKind,
      azureStates,
    ),
    resolveMember: (ref) => {
      if (!ref) return null;
      if (ref.descriptor && memberByDescriptor.has(ref.descriptor))
        return memberByDescriptor.get(ref.descriptor)!;
      if (ref.uniqueName) return memberByUniqueName.get(ref.uniqueName.toLowerCase()) ?? null;
      return null;
    },
  };
}

export interface RawWorkItem {
  readonly id: number;
  readonly rev?: number;
  readonly fields: Record<string, unknown>;
}

export interface PersistBatchResult {
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly failed: number;
  /** Latest `System.ChangedDate` among the persisted items, if any. */
  readonly maxChangedAt: string | null;
}

/**
 * Upserts one batch of raw Azure work items. `contextFor` supplies the
 * per-item team / iteration placement and receives the stored row, if any.
 */
export async function persistWorkItemBatch(input: {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly raws: readonly RawWorkItem[];
  readonly reference: WorkItemReference;
  readonly contextFor: (
    raw: RawWorkItem,
    prior: Readonly<Record<string, unknown>> | undefined,
  ) => MapWorkItemContext;
}): Promise<PersistBatchResult> {
  const ids = input.raws.map((raw) => raw.id);
  if (ids.length === 0)
    return { inserted: 0, updated: 0, unchanged: 0, failed: 0, maxChangedAt: null };

  const existing = await supabaseAdmin
    .from("az_work_items")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("organization_id", input.organizationId)
    .in("azure_work_item_id", ids);
  if (existing.error) throw new AzureDevOpsError("unknown");
  const existingById = new Map(
    (existing.data ?? []).map((row) => [
      Number(row.azure_work_item_id),
      row as Record<string, unknown>,
    ]),
  );

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let maxChangedAt: string | null = null;
  const seenAt = new Date().toISOString();
  const gaps: StateResolutionGap[] = [];

  for (const raw of input.raws) {
    const prior = existingById.get(raw.id);
    const mapped = mapAzureWorkItem(raw, input.reference.mapping, input.contextFor(raw, prior));

    if (mapped.stateCategorySource === "fallback" || mapped.stateCategorySource === "none") {
      gaps.push({
        azureType: mapped.payload.azure_work_item_type,
        state: mapped.payload.state,
        source: mapped.stateCategorySource,
        category: mapped.payload.state_category,
      });
    }
    if (!maxChangedAt || Date.parse(mapped.payload.changed_at_source) > Date.parse(maxChangedAt)) {
      maxChangedAt = mapped.payload.changed_at_source;
    }

    const columnEnteredAt = boardColumnEnteredAt(
      prior
        ? {
            boardColumn: prior["board_column"] as string | null,
            enteredAt: prior["board_column_entered_at"] as string | null,
          }
        : null,
      {
        boardColumn: mapped.payload.board_column,
        changedAtSource: mapped.payload.changed_at_source,
      },
    );
    const blockedSince = mapped.payload.is_blocked
      ? ((prior?.["blocked_since"] as string | null) ?? mapped.payload.state_change_date ?? seenAt)
      : null;

    if (!prior) {
      const { error } = await supabaseAdmin.from("az_work_items").insert({
        tenant_id: input.tenantId,
        organization_id: input.organizationId,
        azure_work_item_id: mapped.azureWorkItemId,
        ...mapped.payload,
        blocked_since: blockedSince,
        board_column_entered_at: columnEnteredAt,
        last_seen_at: seenAt,
        last_synced_at: seenAt,
      });
      if (error) failed += 1;
      else inserted += 1;
      continue;
    }

    const diff = diffWorkItem({ ...prior, blocked_since: prior["blocked_since"] }, mapped.payload);
    const blockedChanged = (prior["blocked_since"] ?? null) !== blockedSince;
    const columnEntryChanged = (prior["board_column_entered_at"] ?? null) !== columnEnteredAt;

    if (diff.kind === "unchanged" && !blockedChanged && !columnEntryChanged) {
      // Freshness only: never counted as an update.
      await supabaseAdmin
        .from("az_work_items")
        .update({ last_seen_at: seenAt, last_synced_at: seenAt })
        .eq("id", prior["id"] as string);
      unchanged += 1;
      continue;
    }

    const { error } = await supabaseAdmin
      .from("az_work_items")
      .update({
        ...(diff.kind === "update" ? diff.patch : {}),
        blocked_since: blockedSince,
        board_column_entered_at: columnEnteredAt,
        last_seen_at: seenAt,
        last_synced_at: seenAt,
      })
      .eq("id", prior["id"] as string);
    if (error) failed += 1;
    else updated += 1;
  }

  await recordStateResolutionGaps(input.tenantId, input.projectId, gaps);
  return { inserted, updated, unchanged, failed, maxChangedAt };
}
