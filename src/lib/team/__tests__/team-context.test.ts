import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal chainable PostgREST stub: every table returns a canned row set. */
const tables: Record<string, unknown[]> = {};

function builder(table: string) {
  const result = { data: tables[table] ?? [], error: null };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
  };
  for (const method of ["select", "eq", "in", "is", "order", "limit", "neq"]) {
    chain[method] = () => chain;
  }
  return chain;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

const { requireTeamIteration } = await import("@/lib/workspace/context.server");

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TEAM_ITERATION = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const TEAM = "44444444-4444-4444-8444-444444444444";

const contextFor = (roles: string[]) =>
  ({ tenantId: TENANT_A, coreUserId: "user-a", roles }) as never;

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
});

describe("team iteration context validation", () => {
  it("rejects a team iteration that is not visible in the caller's tenant", async () => {
    tables["core_team_iterations"] = [];
    await expect(
      requireTeamIteration(contextFor(["tenant_admin"]), TEAM_ITERATION),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects a scoped user whose grants exclude the project/team", async () => {
    tables["core_team_iterations"] = [
      {
        id: TEAM_ITERATION,
        tenant_id: TENANT_A,
        organization_id: "org",
        project_id: PROJECT,
        team_id: TEAM,
        iteration_id: "iter",
        time_zone: "Africa/Cairo",
        working_weekdays: [0, 1, 2, 3, 4],
      },
    ];
    tables["core_user_project_scopes"] = [{ project_id: "other-project", expires_at: null }];
    tables["core_user_team_scopes"] = [{ team_id: "other-team", expires_at: null }];

    await expect(
      requireTeamIteration(contextFor(["contributor"]), TEAM_ITERATION),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
