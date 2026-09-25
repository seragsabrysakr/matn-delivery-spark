import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateBootstrapInput } from "../bootstrap-rules";

/** Mutable fake of the service-role client used by the server module. */
const state = {
  user: null as null | {
    id: string;
    email: string | null;
    email_confirmed_at: string | null;
    user_metadata?: Record<string, unknown>;
  },
  getUserError: null as null | { message: string },
  rpcResult: {
    status: "created",
    tenantId: "11111111-1111-4111-8111-111111111111",
    tenantSlug: "matn",
  } as unknown,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: async () => ({
          data: state.user ? { user: state.user } : null,
          error: state.getUserError,
        }),
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (fn === "real_tenant_exists") return { data: false, error: null };
      return { data: state.rpcResult, error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ eq: async () => ({ count: 0, error: null }) }) }),
    }),
  },
}));

const load = async () => await import("../bootstrap.server");

const VERIFIED = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "First.Admin@example.com",
  email_confirmed_at: "2026-08-27T00:00:00Z",
};

const input = { tenantName: "MATN Delivery Intelligence", tenantSlug: "matn" };

beforeEach(() => {
  state.user = null;
  state.getUserError = null;
  state.rpcCalls = [];
  state.rpcResult = {
    status: "created",
    tenantId: "11111111-1111-4111-8111-111111111111",
    tenantSlug: "matn",
  };
});

describe("bootstrapFirstTenantAdmin", () => {
  it("denies an unauthenticated caller", async () => {
    const { bootstrapFirstTenantAdminServer } = await load();
    expect(await bootstrapFirstTenantAdminServer(null, input)).toEqual({
      status: "rejected",
      reason: "unauthenticated",
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("denies a caller whose email is not verified", async () => {
    state.user = { ...VERIFIED, email_confirmed_at: null };
    const { bootstrapFirstTenantAdminServer } = await load();
    expect(await bootstrapFirstTenantAdminServer(VERIFIED.id, input)).toEqual({
      status: "rejected",
      reason: "email_unverified",
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("provisions the first verified user as tenant admin using the token identity", async () => {
    state.user = VERIFIED;
    const { bootstrapFirstTenantAdminServer } = await load();
    const result = await bootstrapFirstTenantAdminServer(VERIFIED.id, input);
    expect(result).toEqual({ status: "created", tenantSlug: "matn" });

    const call = state.rpcCalls.at(-1)!;
    expect(call.fn).toBe("bootstrap_first_tenant_admin");
    // Identity comes from Auth, normalized — never from the browser.
    expect(call.args["p_auth_user_id"]).toBe(VERIFIED.id);
    expect(call.args["p_email"]).toBe("first.admin@example.com");
  });

  it("rejects a second user once a real tenant exists", async () => {
    state.user = {
      ...VERIFIED,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "second@example.com",
    };
    state.rpcResult = { status: "rejected", reason: "tenant_exists" };
    const { bootstrapFirstTenantAdminServer } = await load();
    expect(
      await bootstrapFirstTenantAdminServer("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", input),
    ).toEqual({
      status: "rejected",
      reason: "tenant_exists",
    });
  });

  it("ignores browser-supplied role, tenant and auth identity fields", async () => {
    state.user = VERIFIED;
    const { bootstrapFirstTenantAdminServer } = await load();
    const hostile = {
      ...input,
      role: "platform_admin",
      auth_user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      tenant_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      user_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    } as unknown as typeof input;

    await bootstrapFirstTenantAdminServer(VERIFIED.id, hostile);
    const args = state.rpcCalls.at(-1)!.args;
    expect(Object.keys(args).sort()).toEqual([
      "p_auth_user_id",
      "p_display_name",
      "p_email",
      "p_tenant_name",
      "p_tenant_slug",
    ]);
    expect(JSON.stringify(args)).not.toContain("platform_admin");
    expect(JSON.stringify(args)).not.toContain("cccccccc");
  });

  it("returns only sanitized fields — no ids, keys or provider detail", async () => {
    state.user = VERIFIED;
    const { bootstrapFirstTenantAdminServer } = await load();
    const result = await bootstrapFirstTenantAdminServer(VERIFIED.id, input);
    expect(Object.keys(result).sort()).toEqual(["status", "tenantSlug"]);
    const serialized = JSON.stringify(result);
    for (const needle of ["service_role", "sb_secret", "SUPABASE", "eyJ", "@example.com"]) {
      expect(serialized).not.toContain(needle);
    }
  });
});

describe("validateBootstrapInput", () => {
  it("accepts the defaults", () => {
    expect(
      validateBootstrapInput({ tenantName: "MATN Delivery Intelligence", tenantSlug: "matn" }),
    ).toBeNull();
  });

  it("rejects reserved, malformed and CI slugs", () => {
    for (const slug of ["matn-demo", "ci-test", "M", "ab", "bad slug", "UPPER_CASE", "-lead"]) {
      expect(validateBootstrapInput({ tenantName: "X", tenantSlug: slug })).toBe("invalid_slug");
    }
  });

  it("rejects an empty name", () => {
    expect(validateBootstrapInput({ tenantName: "   ", tenantSlug: "matn" })).toBe("invalid_name");
  });
});
