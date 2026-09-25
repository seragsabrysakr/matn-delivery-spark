/**
 * Server-only first-administrator bootstrap.
 *
 * Identity (auth user id + verified email) always comes from the validated
 * bearer token and the Auth admin API — never from the browser. The browser
 * may only supply a workspace name and slug. Tenant, user and role creation
 * happens inside one locked database transaction
 * (`public.bootstrap_first_tenant_admin`), so two concurrent callers can never
 * both become the first administrator.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BootstrapRejectionReason, BootstrapResult, BootstrapState } from "./contracts";
import { normalizeName, normalizeSlug, validateBootstrapInput } from "./bootstrap-rules";

interface VerifiedIdentity {
  readonly authUserId: string;
  readonly email: string;
  readonly displayName: string;
}

const reject = (reason: BootstrapRejectionReason): BootstrapResult => ({
  status: "rejected",
  reason,
});

/** Resolves the caller's verified identity from Auth. Never trusts client input. */
async function resolveVerifiedIdentity(
  authUserId: string | null | undefined,
): Promise<VerifiedIdentity | BootstrapRejectionReason> {
  if (!authUserId) return "unauthenticated";
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error || !data?.user) return "unauthenticated";
  const user = data.user;
  if (!user.email_confirmed_at) return "email_unverified";
  const email = (user.email ?? "").trim().toLowerCase();
  if (email === "") return "invalid_identity";
  const metaName =
    typeof user.user_metadata?.["display_name"] === "string"
      ? (user.user_metadata["display_name"] as string)
      : "";
  return { authUserId, email, displayName: metaName.trim() || email.split("@")[0]! };
}

/** What the onboarding screen needs to decide which state to render. */
export async function readBootstrapState(authUserId: string): Promise<BootstrapState> {
  const identity = await resolveVerifiedIdentity(authUserId);
  const emailVerified = typeof identity !== "string";

  const { data: tenantExists } = await supabaseAdmin.rpc("real_tenant_exists");
  const { count } = await supabaseAdmin
    .from("core_users")
    .select("id", { count: "exact", head: true })
    .eq("auth_user_id", authUserId)
    .eq("is_active", true);

  return {
    hasRealTenant: tenantExists === true,
    hasMembership: (count ?? 0) > 0,
    emailVerified,
  };
}

export async function bootstrapFirstTenantAdminServer(
  authUserId: string | null,
  input: { tenantName: string; tenantSlug: string },
): Promise<BootstrapResult> {
  const identity = await resolveVerifiedIdentity(authUserId);
  if (typeof identity === "string") return reject(identity);

  const invalid = validateBootstrapInput(input);
  if (invalid) return reject(invalid);

  const { data, error } = await supabaseAdmin.rpc("bootstrap_first_tenant_admin", {
    p_auth_user_id: identity.authUserId,
    p_email: identity.email,
    p_display_name: identity.displayName,
    p_tenant_name: normalizeName(input.tenantName),
    p_tenant_slug: normalizeSlug(input.tenantSlug),
  });
  if (error) return reject("unknown");

  const payload = (data ?? {}) as { status?: string; reason?: string; tenantSlug?: string };
  if (payload.status === "created" && typeof payload.tenantSlug === "string") {
    return { status: "created", tenantSlug: payload.tenantSlug };
  }
  return reject((payload.reason as BootstrapRejectionReason | undefined) ?? "unknown");
}
