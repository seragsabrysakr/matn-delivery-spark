/**
 * Server-only delivery schedule reads and platform-owned writes (ADR-021).
 * Writes are limited to delivery managers and admins, audited, and go
 * through the service role; committed dates change only through
 * dlv_set_committed_date(), which logs the change with its reason.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { writeAudit, type TenantContext } from "@/lib/azure/authz.server";
import { AzureDevOpsError } from "@/lib/azure/errors";
import { cairoToday } from "@/lib/calendar/cairo";
import type { ResolvedTeamIteration } from "@/lib/workspace/context.server";
import { deliveryStatus, type DeliveryStatus, type StatusResult } from "./deliverable-rules";
import {
  DELIVERY_MAPPING_MODES,
  normalizeMappingValue,
  type DeliveryMappingMode,
} from "./delivery-wiql";

const MANAGE_ROLES = ["platform_admin", "tenant_admin", "delivery_manager"] as const;

export const canManageDelivery = (tenant: TenantContext): boolean =>
  tenant.roles.some((role) => (MANAGE_ROLES as readonly string[]).includes(role));

function assertCanManage(tenant: TenantContext): void {
  if (!canManageDelivery(tenant)) throw new AzureDevOpsError("forbidden");
}

export interface DeliverableView {
  readonly id: string;
  readonly azureWorkItemId: number;
  readonly azureUrl: string | null;
  readonly title: string;
  readonly workItemType: string | null;
  readonly owner: string | null;
  readonly progressPercent: number | null;
  readonly progressBasis: "points" | "count" | null;
  readonly scopeItems: number;
  readonly completedItems: number;
  readonly contributingSprints: readonly string[];
  readonly forecastDate: string | null;
  readonly forecastLow: string | null;
  readonly forecastHigh: string | null;
  readonly forecastReason: string | null;
  readonly committedDate: string | null;
  readonly baselineDate: string | null;
  readonly actualDate: string | null;
  readonly clientVisible: boolean;
  readonly notes: string | null;
  readonly status: DeliveryStatus;
  readonly statusReason: StatusResult["reason"];
  readonly daysLate: number | null;
  readonly computedAt: string | null;
}

export interface DateChangeView {
  readonly id: string;
  readonly deliverableId: string;
  readonly deliverableTitle: string;
  readonly oldDate: string | null;
  readonly newDate: string;
  readonly reason: string;
  readonly changedBy: string | null;
  readonly changedAt: string;
}

export interface DeliverySchedulePayload {
  readonly projectName: string;
  readonly mapping: { readonly mode: DeliveryMappingMode; readonly value: string } | null;
  readonly workItemTypes: readonly string[];
  readonly canEdit: boolean;
  readonly deliverables: readonly DeliverableView[];
  readonly changes: readonly DateChangeView[];
  readonly lastRefresh: { readonly finishedAt: string | null; readonly status: string } | null;
}

const STATUS_ORDER: Record<DeliveryStatus, number> = {
  late: 0,
  at_risk: 1,
  no_committed_date: 2,
  on_track: 3,
  delivered: 4,
};

export async function buildDeliverySchedule(
  tenant: TenantContext,
  target: ResolvedTeamIteration,
): Promise<DeliverySchedulePayload> {
  return { ...(await loadDeliverySchedule(target)), canEdit: canManageDelivery(tenant) };
}

/** The schedule without the viewer's edit right; the scheduler reads it too (ADR-030). */
export async function loadDeliverySchedule(
  target: ResolvedTeamIteration,
): Promise<Omit<DeliverySchedulePayload, "canEdit">> {
  const [mapping, types, deliverables, changes, lastRun] = await Promise.all([
    supabaseAdmin
      .from("dlv_project_mappings")
      .select("mode, value, is_active")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .maybeSingle(),
    supabaseAdmin
      .from("az_work_item_types")
      .select("name")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("is_deleted", false)
      .eq("is_disabled", false)
      .order("name"),
    supabaseAdmin
      .from("dlv_deliverables")
      .select("*")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .eq("is_deleted", false),
    supabaseAdmin
      .from("dlv_date_changes")
      .select("id, deliverable_id, old_date, new_date, reason, changed_by, changed_at")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .order("changed_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("ops_sync_runs")
      .select("status, finished_at")
      .eq("tenant_id", target.tenantId)
      .eq("project_id", target.projectId)
      .contains("entity_kinds", ["deliverables"])
      .order("started_at", { ascending: false })
      .limit(1),
  ]);
  if (deliverables.error || changes.error) throw new AzureDevOpsError("unknown");

  const rows = deliverables.data ?? [];
  const memberIds = [...new Set(rows.map((r) => r.owner_member_id).filter(Boolean))] as string[];
  const itemIds = [...new Set(rows.map((r) => r.work_item_id).filter(Boolean))] as string[];
  const userIds = [...new Set((changes.data ?? []).map((c) => c.changed_by))];
  const [members, items, users] = await Promise.all([
    memberIds.length
      ? supabaseAdmin
          .from("core_members")
          .select("id, display_name")
          .eq("tenant_id", target.tenantId)
          .in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    itemIds.length
      ? supabaseAdmin
          .from("az_work_items")
          .select("id, azure_url")
          .eq("tenant_id", target.tenantId)
          .in("id", itemIds)
      : Promise.resolve({ data: [] as { id: string; azure_url: string | null }[] }),
    userIds.length
      ? supabaseAdmin
          .from("core_users")
          .select("id, display_name")
          .eq("tenant_id", target.tenantId)
          .in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);
  const memberName = new Map((members.data ?? []).map((m) => [m.id, m.display_name]));
  const urlOf = new Map((items.data ?? []).map((i) => [i.id, i.azure_url]));
  const userName = new Map((users.data ?? []).map((u) => [u.id, u.display_name]));
  const today = cairoToday();

  const views: DeliverableView[] = rows.map((row) => {
    const status = deliveryStatus({
      actualDate: row.actual_date,
      committedDate: row.committed_date,
      forecastDate: row.forecast_date,
      today,
    });
    return {
      id: row.id,
      azureWorkItemId: Number(row.azure_work_item_id),
      azureUrl: row.work_item_id ? (urlOf.get(row.work_item_id) ?? null) : null,
      title: row.title,
      workItemType: row.work_item_type,
      owner: row.owner_member_id ? (memberName.get(row.owner_member_id) ?? null) : null,
      progressPercent: row.progress_percent === null ? null : Number(row.progress_percent),
      progressBasis: row.progress_basis as DeliverableView["progressBasis"],
      scopeItems: row.scope_items,
      completedItems: row.completed_items,
      contributingSprints: row.contributing_sprints ?? [],
      forecastDate: row.forecast_date,
      forecastLow: row.forecast_low,
      forecastHigh: row.forecast_high,
      forecastReason: row.forecast_reason,
      committedDate: row.committed_date,
      baselineDate: row.baseline_date,
      actualDate: row.actual_date,
      clientVisible: row.client_visible,
      notes: row.notes,
      status: status.status,
      statusReason: status.reason,
      daysLate: status.daysLate,
      computedAt: row.computed_at,
    };
  });
  views.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.committedDate ?? a.forecastDate ?? "9999").localeCompare(
        b.committedDate ?? b.forecastDate ?? "9999",
      ) ||
      a.azureWorkItemId - b.azureWorkItemId,
  );
  const titleOf = new Map(views.map((v) => [v.id, v.title]));

  const run = (lastRun.data ?? [])[0];
  return {
    projectName: target.azureProjectName,
    mapping:
      mapping.data && mapping.data.is_active
        ? { mode: mapping.data.mode as DeliveryMappingMode, value: mapping.data.value }
        : null,
    workItemTypes: (types.data ?? []).map((t) => t.name),
    deliverables: views,
    changes: (changes.data ?? []).map((c) => ({
      id: c.id,
      deliverableId: c.deliverable_id,
      deliverableTitle: titleOf.get(c.deliverable_id) ?? "",
      oldDate: c.old_date,
      newDate: c.new_date,
      reason: c.reason,
      changedBy: userName.get(c.changed_by) ?? null,
      changedAt: c.changed_at,
    })),
    lastRefresh: run ? { finishedAt: run.finished_at, status: run.status } : null,
  };
}

export async function saveDeliveryMapping(
  tenant: TenantContext,
  target: ResolvedTeamIteration,
  input: { mode: string; value: string },
): Promise<void> {
  assertCanManage(tenant);
  if (!(DELIVERY_MAPPING_MODES as readonly string[]).includes(input.mode))
    throw new AzureDevOpsError("invalid_configuration");
  const mode = input.mode as DeliveryMappingMode;
  const value = normalizeMappingValue(mode, input.value);
  const { error } = await supabaseAdmin.from("dlv_project_mappings").upsert(
    {
      tenant_id: target.tenantId,
      project_id: target.projectId,
      mode,
      value,
      is_active: true,
      updated_by: tenant.coreUserId,
    },
    { onConflict: "tenant_id,project_id" },
  );
  if (error) throw new AzureDevOpsError("unknown");
  await writeAudit({
    tenantId: tenant.tenantId,
    actorUserId: tenant.coreUserId,
    action: "delivery.mapping.save",
    entityType: "dlv_project_mappings",
    entityId: null,
    outcome: "success",
    metadata: { projectId: target.projectId, mode },
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

async function requireDeliverable(target: ResolvedTeamIteration, deliverableId: string) {
  const { data } = await supabaseAdmin
    .from("dlv_deliverables")
    .select("id")
    .eq("tenant_id", target.tenantId)
    .eq("project_id", target.projectId)
    .eq("id", deliverableId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!data) throw new AzureDevOpsError("forbidden");
}

export async function setCommittedDate(
  tenant: TenantContext,
  target: ResolvedTeamIteration,
  input: { deliverableId: string; date: string; reason: string },
): Promise<void> {
  assertCanManage(tenant);
  const reason = input.reason.trim();
  if (!DATE_ONLY.test(input.date) || Number.isNaN(Date.parse(input.date)))
    throw new AzureDevOpsError("invalid_configuration");
  if (reason.length < 3 || reason.length > 1000)
    throw new AzureDevOpsError("invalid_configuration");
  await requireDeliverable(target, input.deliverableId);
  const { error } = await supabaseAdmin.rpc("dlv_set_committed_date", {
    p_tenant_id: target.tenantId,
    p_deliverable_id: input.deliverableId,
    p_new_date: input.date,
    p_reason: reason,
    p_actor: tenant.coreUserId,
  });
  if (error) throw new AzureDevOpsError("unknown");
  await writeAudit({
    tenantId: tenant.tenantId,
    actorUserId: tenant.coreUserId,
    action: "delivery.committed_date.set",
    entityType: "dlv_deliverables",
    entityId: input.deliverableId,
    outcome: "success",
    metadata: { date: input.date },
  });
}

export async function updateDeliverableDetails(
  tenant: TenantContext,
  target: ResolvedTeamIteration,
  input: {
    deliverableId: string;
    clientVisible?: boolean | undefined;
    notes?: string | null | undefined;
  },
): Promise<void> {
  assertCanManage(tenant);
  await requireDeliverable(target, input.deliverableId);
  const patch: { client_visible?: boolean; notes?: string | null } = {};
  if (typeof input.clientVisible === "boolean") patch.client_visible = input.clientVisible;
  if (input.notes !== undefined) {
    const notes = input.notes?.trim() ?? "";
    if (notes.length > 4000) throw new AzureDevOpsError("invalid_configuration");
    patch.notes = notes.length > 0 ? notes : null;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabaseAdmin
    .from("dlv_deliverables")
    .update(patch)
    .eq("tenant_id", target.tenantId)
    .eq("id", input.deliverableId);
  if (error) throw new AzureDevOpsError("unknown");
  await writeAudit({
    tenantId: tenant.tenantId,
    actorUserId: tenant.coreUserId,
    action: "delivery.deliverable.update",
    entityType: "dlv_deliverables",
    entityId: input.deliverableId,
    outcome: "success",
    metadata: { fields: Object.keys(patch) },
  });
}
