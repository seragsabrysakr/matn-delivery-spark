/**
 * Pure Azure work item -> `az_work_items` mapping and reconciliation.
 *
 * Natural identity is (tenant_id, organization_id, azure_work_item_id).
 * Identity/ownership columns are never part of an update payload, so the
 * internal UUID and the owning tenant/organization survive every re-sync.
 */
import type { Database, Json } from "@/integrations/supabase/types";
import type { StateCategory, WorkItemAlias } from "@/types/domain/work-item";
import { aliasFor, stateCategoryFor, type ResolvedProcessMapping } from "./process-mapping";

type SeverityEnum = Database["public"]["Enums"]["severity_level"];

export type AzureFields = Readonly<Record<string, unknown>>;

export interface AzureIdentityLike {
  readonly descriptor?: string;
  readonly uniqueName?: string;
  readonly displayName?: string;
}

/** Mutable columns only — never tenant_id, organization_id or azure_work_item_id. */
export interface WorkItemMutablePayload {
  readonly project_id: string;
  readonly team_id: string | null;
  readonly iteration_id: string | null;
  readonly azure_rev: number;
  readonly title: string;
  readonly description: string | null;
  readonly azure_work_item_type: string;
  readonly alias: WorkItemAlias;
  readonly state: string;
  readonly state_category: StateCategory;
  readonly reason: string | null;
  readonly area_path: string;
  readonly iteration_path: string;
  readonly tags: string[];
  readonly assigned_to_member_id: string | null;
  readonly created_by_member_id: string | null;
  readonly changed_by_member_id: string | null;
  readonly created_at_source: string;
  readonly changed_at_source: string;
  readonly activated_date: string | null;
  readonly resolved_date: string | null;
  readonly closed_date: string | null;
  readonly state_change_date: string | null;
  readonly priority: number | null;
  readonly severity: SeverityEnum | null;
  readonly azure_severity_raw: string | null;
  readonly estimate: number | null;
  readonly estimate_unit: string | null;
  readonly estimate_source_field: string | null;
  readonly remaining_work: number | null;
  readonly completed_work: number | null;
  readonly original_estimate: number | null;
  readonly is_blocked: boolean;
  readonly blocked_source_field: string | null;
  readonly parent_azure_work_item_id: number | null;
  readonly is_leaf: boolean;
  readonly counts_toward_scope: boolean;
  readonly azure_url: string | null;
  readonly custom_fields: Json;
  readonly source_status: Database["public"]["Enums"]["source_status"];
  readonly is_deleted: boolean;
}

export interface MappedWorkItem {
  readonly azureWorkItemId: number;
  readonly payload: WorkItemMutablePayload;
  /** Not persisted; used by the risk rules before ids are resolved. */
  readonly dueDate: string | null;
}

export interface MapWorkItemContext {
  readonly projectId: string;
  readonly teamId: string | null;
  readonly iterationId: string | null;
  readonly teamIterationId: string | null;
  readonly resolveMember: (ref: AzureIdentityLike | null | undefined) => string | null;
  readonly organizationBaseUrl: string;
  readonly azureProjectName: string;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const SEVERITY_MAP: Record<string, SeverityEnum> = {
  "1 - critical": "critical",
  "2 - high": "high",
  "3 - medium": "medium",
  "4 - low": "low",
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const identity = (v: unknown): AzureIdentityLike | null =>
  v && typeof v === "object" ? (v as AzureIdentityLike) : null;

/** Truthy-blocked detection is restricted to fields ProcessMapping declares. */
export function resolveBlocked(
  fields: AzureFields,
  mapping: ResolvedProcessMapping,
): { blocked: boolean; sourceField: string | null } {
  for (const field of mapping.blockedFields) {
    const value = fields[field];
    if (value === true) return { blocked: true, sourceField: field };
    if (typeof value === "string" && value.trim().toLowerCase() === "yes") {
      return { blocked: true, sourceField: field };
    }
  }
  return { blocked: false, sourceField: null };
}

export function resolveEstimate(
  fields: AzureFields,
  mapping: ResolvedProcessMapping,
): { estimate: number | null; unit: string | null; sourceField: string | null } {
  for (const field of mapping.estimateFields) {
    const value = num(fields[field]);
    if (value !== null) {
      const unit = field.endsWith("StoryPoints")
        ? "storyPoints"
        : field.endsWith("Effort")
          ? "effort"
          : "storyPoints";
      return { estimate: value, unit, sourceField: field };
    }
  }
  const remaining = num(fields["Microsoft.VSTS.Scheduling.RemainingWork"]);
  if (remaining !== null) {
    return {
      estimate: remaining,
      unit: "hours",
      sourceField: "Microsoft.VSTS.Scheduling.RemainingWork",
    };
  }
  return { estimate: null, unit: null, sourceField: null };
}

export function mapAzureWorkItem(
  raw: { readonly id: number; readonly rev?: number; readonly fields: AzureFields },
  mapping: ResolvedProcessMapping,
  ctx: MapWorkItemContext,
): MappedWorkItem {
  const f = raw.fields;
  const type = str(f["System.WorkItemType"]) ?? "Unknown";
  const state = str(f["System.State"]) ?? "Unknown";
  const alias = aliasFor(mapping, type);
  const stateCategory = stateCategoryFor(mapping, state);
  const blocked = resolveBlocked(f, mapping);
  const estimate = resolveEstimate(f, mapping);
  const severityRaw = mapping.severityField ? str(f[mapping.severityField]) : null;
  const nowFallback = new Date(0).toISOString();

  const tagsRaw = str(f["System.Tags"]);
  const tags = tagsRaw
    ? tagsRaw
        .split(";")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  const excludedBug = alias === "bug" && mapping.bugHandlingMode === "excluded";
  const countsTowardScope = !excludedBug && alias !== "task" && stateCategory !== "removed";

  return {
    azureWorkItemId: raw.id,
    dueDate: iso(f["Microsoft.VSTS.Scheduling.DueDate"]),
    payload: {
      project_id: ctx.projectId,
      team_id: ctx.teamId,
      iteration_id: ctx.iterationId,

      azure_rev: num(f["System.Rev"]) ?? raw.rev ?? 0,
      title: str(f["System.Title"]) ?? `#${raw.id}`,
      description: str(f["System.Description"]),
      azure_work_item_type: type,
      alias,
      state,
      state_category: stateCategory,
      reason: str(f["System.Reason"]),
      area_path: str(f["System.AreaPath"]) ?? ctx.azureProjectName,
      iteration_path: str(f["System.IterationPath"]) ?? ctx.azureProjectName,
      tags,
      assigned_to_member_id: ctx.resolveMember(identity(f["System.AssignedTo"])),
      created_by_member_id: ctx.resolveMember(identity(f["System.CreatedBy"])),
      changed_by_member_id: ctx.resolveMember(identity(f["System.ChangedBy"])),
      created_at_source: iso(f["System.CreatedDate"]) ?? nowFallback,
      changed_at_source: iso(f["System.ChangedDate"]) ?? nowFallback,
      activated_date: iso(f["Microsoft.VSTS.Common.ActivatedDate"]),
      resolved_date: iso(f["Microsoft.VSTS.Common.ResolvedDate"]),
      closed_date: iso(f["Microsoft.VSTS.Common.ClosedDate"]),
      state_change_date: iso(f["Microsoft.VSTS.Common.StateChangeDate"]),
      priority: num(f["Microsoft.VSTS.Common.Priority"]),
      severity: severityRaw ? (SEVERITY_MAP[severityRaw.toLowerCase()] ?? "unknown") : null,
      azure_severity_raw: severityRaw,
      estimate: estimate.estimate,
      estimate_unit: estimate.unit,
      estimate_source_field: estimate.sourceField,
      remaining_work: num(f["Microsoft.VSTS.Scheduling.RemainingWork"]),
      completed_work: num(f["Microsoft.VSTS.Scheduling.CompletedWork"]),
      original_estimate: num(f["Microsoft.VSTS.Scheduling.OriginalEstimate"]),
      is_blocked: blocked.blocked,
      blocked_source_field: blocked.sourceField,
      parent_azure_work_item_id: num(f["System.Parent"]),
      is_leaf: alias === "task" || alias === "bug",
      counts_toward_scope: countsTowardScope,
      azure_url: `${ctx.organizationBaseUrl}/${encodeURIComponent(ctx.azureProjectName)}/_workitems/edit/${raw.id}`,
      custom_fields: {},
      source_status: "active",
      is_deleted: false,
    },
  };
}

export type WorkItemDiff =
  | { readonly kind: "unchanged" }
  | { readonly kind: "update"; readonly patch: Partial<WorkItemMutablePayload> };

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => String(v) === String(b[i]));
  }
  if (a === null || a === undefined) return b === null || b === undefined;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a === "object" || typeof b === "object")
    return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
};

/**
 * Freshness-only touches are `unchanged`: `last_seen_at` is written separately
 * so a re-sync of identical data never inflates the "updated" tally.
 */
export function diffWorkItem(
  existing: Readonly<Record<string, unknown>>,
  payload: WorkItemMutablePayload,
): WorkItemDiff {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "custom_fields") continue;
    if (!same(existing[key], value)) patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return { kind: "unchanged" };
  return { kind: "update", patch: patch as Partial<WorkItemMutablePayload> };
}
