import { describe, expect, it } from "vitest";
import { readProjectTeams } from "../teams.server";
import { blockedCounts, blockingDependency, canTombstone, deriveRunStatus } from "../job-rules";
import { emptyCounts, SYNC_DOMAINS, type DomainCounts, type SyncDomain } from "../contracts";

const PAT = "secret-pat";
const PROJECT_ID = "7350a2d8-5b29-4875-8c8f-3b4ef05a13a1";

const teamsBody = (n: number, offset = 0) =>
  new Response(
    JSON.stringify({
      count: n,
      value: Array.from({ length: n }, (_, i) => ({
        id: `t${offset + i}`,
        name: `Team ${offset + i}`,
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const read = (fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) =>
  readProjectTeams({
    organization: "contoso",
    pat: PAT,
    azureProjectId: PROJECT_ID,
    fetchImpl,
    sleep: async () => {},
    ...overrides,
  });

describe("readProjectTeams", () => {
  it("addresses the officially supported endpoint by project id, never by name", async () => {
    let url = "";
    const result = await read(async (input) => {
      url = String(input);
      return teamsBody(2);
    });
    expect(url).toBe(
      `https://dev.azure.com/contoso/_apis/projects/${PROJECT_ID}/teams?api-version=7.1&$top=100`,
    );
    expect(url).not.toContain(PAT);
    expect(result.status).toBe("complete");
    expect(result.teamCount).toBe(2);
    expect(result.pagesFetched).toBe(1);
  });

  it("pages with bounded limits and stops at the page ceiling", async () => {
    let calls = 0;
    const result = await read(
      async () => {
        calls += 1;
        return teamsBody(100, calls * 100);
      },
      { maxPages: 3 },
    );
    expect(calls).toBe(3);
    expect(result.status).toBe("partial");
    expect(result.teamCount).toBe(300);
  });

  it("caps the number of teams per project", async () => {
    const result = await read(async () => teamsBody(100), { maxTeams: 40 });
    expect(result.teamCount).toBe(40);
    expect(result.status).toBe("partial");
  });

  it("keeps earlier pages when a later page fails", async () => {
    let calls = 0;
    const result = await read(async () => {
      calls += 1;
      return calls === 1 ? teamsBody(100) : new Response("", { status: 403 });
    });
    expect(result.status).toBe("partial");
    expect(result.teamCount).toBe(100);
    expect(result.warning).toBe("insufficient_permissions");
  });

  it("retries transient failures once and never retries 403", async () => {
    let transient = 0;
    await read(async () => {
      transient += 1;
      return transient === 1 ? new Response("", { status: 503 }) : teamsBody(1);
    });
    expect(transient).toBe(2);

    let forbidden = 0;
    const denied = await read(async () => {
      forbidden += 1;
      return new Response("", { status: 403 });
    });
    expect(forbidden).toBe(1);
    expect(denied.status).toBe("failed");
    expect(denied.teamCount).toBe(0);
  });

  it("reports a sanitized timeout without provider text or secrets", async () => {
    const result = await read(
      async () => {
        const error = new Error(`aborted ${PAT}`);
        error.name = "AbortError";
        throw error;
      },
      { timeoutMs: 5 },
    );
    expect(result.status).toBe("failed");
    expect(result.warning).toBe("request_timeout");
    expect(JSON.stringify(result)).not.toContain(PAT);
  });

  it("does not turn every project into a generic failure", async () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const results = await Promise.all(
      ids.map((id) =>
        readProjectTeams({
          organization: "contoso",
          pat: PAT,
          azureProjectId: id,
          sleep: async () => {},
          // Only p3 is inaccessible; the rest must still succeed.
          fetchImpl: async (input) =>
            String(input).includes("/p3/") ? new Response("", { status: 403 }) : teamsBody(2),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "complete")).toHaveLength(3);
    expect(results.filter((r) => r.status === "failed")).toHaveLength(1);
    expect(results.reduce((sum, r) => sum + r.teamCount, 0)).toBe(6);
  });
});

const domains = (overrides: Partial<Record<SyncDomain, Partial<DomainCounts>>> = {}) =>
  Object.fromEntries(
    SYNC_DOMAINS.map((d) => [d, { ...emptyCounts(), ...(overrides[d] ?? {}) }]),
  ) as Record<SyncDomain, DomainCounts>;

describe("domain dependency status", () => {
  it("blocks dependent domains when teams is partial or failed", () => {
    const state = domains({
      organization: { complete: true },
      projects: { complete: true },
      teams: { complete: false, failed: 4 },
    });
    expect(blockingDependency("teams", state)).toBeNull();
    for (const domain of [
      "iterations",
      "teamIterations",
      "members",
      "teamMemberships",
    ] as SyncDomain[]) {
      expect(blockingDependency(domain, state)).toBe("teams");
    }
  });

  it("blocked domains are never complete, never fresh and never tombstoned", () => {
    const blocked = blockedCounts(
      { ...emptyCounts(), complete: true, freshnessAt: "2026-01-01" },
      "teams",
    );
    expect(blocked.complete).toBe(false);
    expect(blocked.freshnessAt).toBeNull();
    expect(blocked.blocked).toBe(true);
    expect(blocked.blockedBy).toBe("teams");
    expect(canTombstone(blocked, true)).toBe(false);
  });

  it("a partial teams domain cannot tombstone and yields a partial run", () => {
    const partialTeams = { ...emptyCounts(), failed: 1, complete: false };
    expect(canTombstone(partialTeams, false)).toBe(false);
    const state = domains({
      organization: { complete: true },
      projects: { complete: true },
      teams: partialTeams,
      iterations: blockedCounts(emptyCounts(), "teams"),
    });
    expect(deriveRunStatus(state)).toBe("partial");
  });

  it("allows dependents once teams completes cleanly", () => {
    const state = domains({
      organization: { complete: true },
      projects: { complete: true },
      teams: { complete: true },
    });
    expect(blockingDependency("iterations", state)).toBeNull();
    expect(blockingDependency("members", state)).toBeNull();
  });
});
