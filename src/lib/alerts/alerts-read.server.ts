/**
 * Server-only read side of alerts (ADR-030): open alerts and the last week's
 * resolved ones, limited to the projects the user can see, for manager roles.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AppRole, TenantContext } from "@/lib/azure/authz.server";
import { loadWorkspaceSelectors } from "@/lib/workspace/context.server";
import type { AlertKind } from "./alert-rules";

const MANAGER_ROLES: readonly AppRole[] = [
  "platform_admin",
  "tenant_admin",
  "delivery_manager",
  "team_lead",
];
const RESOLVED_WINDOW_DAYS = 7;

export const canSeeAlerts = (tenant: TenantContext) =>
  tenant.roles.some((role) => MANAGER_ROLES.includes(role));

export interface AlertView {
  readonly id: string;
  readonly kind: AlertKind;
  readonly projectName: string;
  readonly title: string;
  readonly azureWorkItemId: number | null;
  readonly azureUrl: string | null;
  readonly assignee: string | null;
  readonly sprintName: string | null;
  readonly workingDaysInColumn: number | null;
  readonly ageBasis: string | null;
  readonly committedDate: string | null;
  readonly forecastDate: string | null;
  readonly daysLate: number | null;
  readonly detectedAt: string;
  readonly resolvedAt: string | null;
}

export type AlertsPayload =
  | { readonly allowed: false }
  | {
      readonly allowed: true;
      /** False until the alerts migration is applied. */
      readonly active: boolean;
      readonly open: readonly AlertView[];
      readonly resolved: readonly AlertView[];
      readonly lastCheckAt: string | null;
      readonly lastDigest: { readonly date: string; readonly teamsStatus: string } | null;
      readonly teamsConfigured: boolean;
    };

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

export async function loadAlerts(tenant: TenantContext): Promise<AlertsPayload> {
  if (!canSeeAlerts(tenant)) return { allowed: false };
  const selectors = await loadWorkspaceSelectors(tenant);
  const projectName = new Map(selectors.projects.map((p) => [p.id, p.nameEn]));
  const projectIds = [...projectName.keys()];
  const teamsConfigured = Boolean(process.env["MATN_TEAMS_WEBHOOK_URL"]);
  if (projectIds.length === 0) {
    return {
      allowed: true,
      active: true,
      open: [],
      resolved: [],
      lastCheckAt: null,
      lastDigest: null,
      teamsConfigured,
    };
  }
  const since = new Date(Date.now() - RESOLVED_WINDOW_DAYS * 86_400_000).toISOString();
  const [open, resolved, lastRun, lastDigest] = await Promise.all([
    supabaseAdmin
      .from("ntf_alerts")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .in("project_id", projectIds)
      .is("resolved_at", null)
      .order("detected_at", { ascending: true })
      .limit(500),
    supabaseAdmin
      .from("ntf_alerts")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .in("project_id", projectIds)
      .gte("resolved_at", since)
      .order("resolved_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("ntf_detection_runs")
      .select("ran_at")
      .eq("tenant_id", tenant.tenantId)
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("ntf_digests")
      .select("digest_date, teams_status")
      .eq("tenant_id", tenant.tenantId)
      .order("digest_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // Before the migration is applied the tables do not exist yet.
  if (open.error || resolved.error) {
    return {
      allowed: true,
      active: false,
      open: [],
      resolved: [],
      lastCheckAt: null,
      lastDigest: null,
      teamsConfigured,
    };
  }
  const view = (row: NonNullable<typeof open.data>[number]): AlertView => {
    const d = (row.details ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      kind: row.kind as AlertKind,
      projectName: projectName.get(row.project_id) ?? "",
      title: row.title,
      azureWorkItemId: row.azure_work_item_id === null ? null : Number(row.azure_work_item_id),
      azureUrl: str(d["azureUrl"]),
      assignee: str(d["assignee"]) ?? str(d["owner"]),
      sprintName: str(d["sprintName"]),
      workingDaysInColumn: num(d["workingDaysInColumn"]),
      ageBasis: str(d["ageBasis"]),
      committedDate: str(d["committedDate"]),
      forecastDate: str(d["forecastDate"]),
      daysLate: num(d["daysLate"]),
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at,
    };
  };
  return {
    allowed: true,
    active: true,
    open: (open.data ?? []).map(view),
    resolved: (resolved.data ?? []).map(view),
    lastCheckAt: lastRun.data?.ran_at ?? null,
    lastDigest: lastDigest.data
      ? { date: lastDigest.data.digest_date, teamsStatus: lastDigest.data.teams_status }
      : null,
    teamsConfigured,
  };
}
