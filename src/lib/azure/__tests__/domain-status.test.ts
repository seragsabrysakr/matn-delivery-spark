import { describe, expect, it } from "vitest";
import { emptyCounts, type DomainCounts } from "../contracts";
import { blockingDependency, domainStatus, finalizeScopedDomain } from "../job-rules";
import { countsBalance } from "../project-upsert";
import { diffTeam, mutableTeamPayload, IMMUTABLE_TEAM_COLUMNS } from "../team-upsert";

const counts = (patch: Partial<DomainCounts>): DomainCounts => ({ ...emptyCounts(), ...patch });

describe("foundation domain status invariants", () => {
  it("treats seven inserted teams with zero failures across all scopes as complete", () => {
    const result = finalizeScopedDomain(
      counts({ discovered: 7, inserted: 7 }),
      { expected: 4, attempted: 4, completed: 4, failed: 0, remainingContinuationTokens: 0 },
      "2026-01-01T00:00:00.000Z",
    );
    expect(result.status).toBe("complete");
    expect(result.counts.complete).toBe(true);
    expect(countsBalance(result.counts)).toBe(true);
  });

  it("treats a project scope with zero teams and a successful response as complete", () => {
    expect(
      domainStatus(counts({}), {
        expected: 1,
        attempted: 1,
        completed: 1,
        failed: 0,
        remainingContinuationTokens: 0,
      }),
    ).toBe("complete");
  });

  it("marks partial only when some scope is incomplete or failed", () => {
    const result = finalizeScopedDomain(
      counts({ discovered: 5, inserted: 5 }),
      { expected: 4, attempted: 4, completed: 3, failed: 1, remainingContinuationTokens: 0 },
      "2026-01-01T00:00:00.000Z",
    );
    expect(result.status).toBe("partial");
    expect(result.incompleteScopes).toBe(1);
  });

  it("marks failed when no scope succeeded and failures exist", () => {
    expect(
      domainStatus(counts({ failed: 2 }), {
        expected: 2,
        attempted: 2,
        completed: 0,
        failed: 2,
        remainingContinuationTokens: 0,
      }),
    ).toBe("failed");
  });

  it("cannot finalize before every expected scope is attempted", () => {
    expect(
      domainStatus(counts({ unchanged: 7 }), {
        expected: 4,
        attempted: 3,
        completed: 3,
        failed: 0,
        remainingContinuationTokens: 0,
      }),
    ).toBe("partial");
  });

  it("marks blocked when a dependency is not complete", () => {
    expect(domainStatus(counts({ blocked: true, blockedBy: "teams" }))).toBe("blocked");
  });

  it("blocks downstream domains only while teams is incomplete", () => {
    const domains = {
      organization: counts({ complete: true }),
      projects: counts({ complete: true }),
      teams: counts({ complete: false, discovered: 7, inserted: 7 }),
      iterations: counts({}),
      teamIterations: counts({}),
      members: counts({}),
      teamMemberships: counts({}),
    } as const;
    expect(blockingDependency("iterations", domains)).toBe("teams");
    const unblocked = { ...domains, teams: counts({ complete: true, discovered: 7, inserted: 7 }) };
    expect(blockingDependency("iterations", unblocked)).toBeNull();
    expect(blockingDependency("members", unblocked)).toBeNull();
  });

  it("keeps read = inserted + updated + unchanged + failed for every domain shape", () => {
    expect(countsBalance(counts({ discovered: 7, inserted: 7 }))).toBe(true);
    expect(countsBalance(counts({ discovered: 4, unchanged: 4 }))).toBe(true);
    expect(countsBalance(counts({ discovered: 4, updated: 1, unchanged: 2, failed: 1 }))).toBe(
      true,
    );
  });
});

describe("team reconciliation", () => {
  const source = {
    azureTeamId: "t1",
    name: "Delivery",
    description: "Core",
    areaPaths: ["Proj\\Area"],
    defaultIterationPath: "Proj\\Sprint 1",
  };
  const existing = {
    id: "uuid-1",
    azure_team_name: "Delivery",
    name_en: "Delivery",
    description: "Core",
    area_paths: ["Proj\\Area"],
    default_iteration_path: "Proj\\Sprint 1",
    source_status: "active",
    is_deleted: false,
  };

  it("counts a freshness-only touch as unchanged", () => {
    expect(diffTeam(existing, source)).toBeNull();
  });

  it("detects real content changes", () => {
    expect(diffTeam({ ...existing, description: "Old" }, source)).not.toBeNull();
  });

  it("never includes identity columns in the update payload", () => {
    const payload = mutableTeamPayload(source) as unknown as Record<string, unknown>;
    for (const column of IMMUTABLE_TEAM_COLUMNS) expect(payload).not.toHaveProperty(column);
  });
});
