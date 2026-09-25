/**
 * Server-only tenant + role resolution for Azure DevOps operations.
 *
 * Identity always comes from the validated bearer token (`auth.uid()`),
 * never from client-supplied ids. Tenant membership is resolved explicitly,
 * so a user that belongs to several tenants can never leak across them.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsError } from "./errors";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface TenantContext {
  readonly tenantId: string;
  readonly coreUserId: string;
  readonly roles: readonly AppRole[];
}

const SYNC_ROLES: readonly AppRole[] = ["platform_admin", "tenant_admin"];
const READ_STATUS_ROLES: readonly AppRole[] = [
  "platform_admin",
  "tenant_admin",
  "delivery_manager",
  "executive_viewer",
  "qa_release_owner",
  "team_lead",
];

/** Resolves the caller's tenant membership. Throws `forbidden` when ambiguous. */
export async function resolveTenantContext(
  authUserId: string,
  requestedTenantId?: string | null,
): Promise<TenantContext> {
  const query = supabaseAdmin
    .from("core_users")
    .select("id, tenant_id")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true);

  const { data, error } = requestedTenantId
    ? await query.eq("tenant_id", requestedTenantId)
    : await query;
  if (error) throw new AzureDevOpsError("unknown");
  const memberships = data ?? [];
  if (memberships.length === 0) throw new AzureDevOpsError("forbidden");
  if (memberships.length > 1) throw new AzureDevOpsError("forbidden");

  const membership = memberships[0]!;
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("core_user_roles")
    .select("role")
    .eq("tenant_id", membership.tenant_id)
    .eq("user_id", membership.id)
    .is("revoked_at", null);
  if (roleError) throw new AzureDevOpsError("unknown");

  return {
    tenantId: membership.tenant_id,
    coreUserId: membership.id,
    roles: (roleRows ?? []).map((r) => r.role),
  };
}

export const canRunSync = (context: TenantContext): boolean =>
  context.roles.some((role) => SYNC_ROLES.includes(role));

export const canReadSyncStatus = (context: TenantContext): boolean =>
  context.roles.some((role) => READ_STATUS_ROLES.includes(role));

export function assertCanRunSync(context: TenantContext): void {
  if (!canRunSync(context)) throw new AzureDevOpsError("forbidden");
}

export function assertCanReadSyncStatus(context: TenantContext): void {
  if (!canReadSyncStatus(context)) throw new AzureDevOpsError("forbidden");
}

/** Immutable audit trail entry; metadata never contains credentials. */
export async function writeAudit(input: {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: Database["public"]["Enums"]["audit_outcome"];
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabaseAdmin.from("aud_audit_events").insert({
    tenant_id: input.tenantId,
    actor_type: "user",
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    outcome: input.outcome,
    ...(input.correlationId ? { correlation_id: input.correlationId } : {}),
    metadata: (input.metadata ??
      {}) as Database["public"]["Tables"]["aud_audit_events"]["Row"]["metadata"],
  });
}
