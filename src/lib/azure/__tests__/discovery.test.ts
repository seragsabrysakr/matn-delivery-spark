import { describe, expect, it } from "vitest";
import { discoverAzureProjectsBounded } from "../discovery.server";

const PAT = "super-secret-pat";
const page = (ids: string[], token?: string) =>
  new Response(
    JSON.stringify({
      count: ids.length,
      value: ids.map((id) => ({ id, name: `p-${id}`, state: "wellFormed" })),
    }),
    {
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-ms-continuationtoken": token } : {}),
      },
    },
  );

const run = (fetchImpl: typeof fetch, overrides = {}) =>
  discoverAzureProjectsBounded({
    organization: "contoso",
    pat: PAT,
    fetchImpl,
    sleep: async () => {},
    ...overrides,
  });

describe("project discovery", () => {
  it("returns a complete result for a single page", async () => {
    let url = "";
    const result = await run(async (input) => {
      url = String(input);
      return page(["a", "b"]);
    });
    expect(result.status).toBe("complete");
    expect(result.projectCount).toBe(2);
    expect(result.pagesFetched).toBe(1);
    expect(url).toContain("$top=100");
    expect(url).toContain("api-version=7.1");
    expect(url).not.toContain(PAT);
    expect(result.projects[0]).toEqual({
      azureProjectId: "a",
      name: "p-a",
      description: null,
      state: "wellFormed",
      visibility: null,
      lastUpdateTime: null,
    });
  });

  it("follows continuation tokens across pages", async () => {
    let call = 0;
    const result = await run(async () => {
      call += 1;
      return call < 3 ? page([`${call}`], "next") : page(["3"]);
    });
    expect(result.status).toBe("complete");
    expect(result.pagesFetched).toBe(3);
    expect(result.projectCount).toBe(3);
  });

  it("stops at the 5-page ceiling and reports partial", async () => {
    let call = 0;
    const result = await run(async () => {
      call += 1;
      return page([`${call}`], "next");
    });
    expect(call).toBe(5);
    expect(result.status).toBe("partial");
    expect(result.projectCount).toBe(5);
  });

  it("stops at the project ceiling", async () => {
    const result = await run(async () => page(["a", "b", "c"], "next"), { maxProjects: 2 });
    expect(result.status).toBe("partial");
    expect(result.projectCount).toBe(2);
  });

  it("returns already discovered projects when a later page fails", async () => {
    let call = 0;
    const result = await run(async () => {
      call += 1;
      return call === 1 ? page(["a"], "next") : new Response("", { status: 503 });
    });
    expect(result.status).toBe("partial");
    expect(result.projectCount).toBe(1);
    expect(result.warning).toBe("provider_unavailable");
    expect(result.error).toBeNull();
  });

  it("does not retry 401/403/404 and never leaks provider text", async () => {
    let calls = 0;
    const result = await run(async () => {
      calls += 1;
      return new Response(`denied for ${PAT}`, { status: 401 });
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("failed");
    expect(result.warning).toBe("invalid_credentials");
    expect(JSON.stringify(result)).not.toContain(PAT);
  });

  it("retries transient codes at most once", async () => {
    let calls = 0;
    const result = await run(async () => {
      calls += 1;
      return calls === 1 ? new Response("", { status: 429 }) : page(["a"]);
    });
    expect(calls).toBe(2);
    expect(result.status).toBe("complete");
  });

  it("reports a timeout as a discovery failure, not zero projects", async () => {
    const result = await run(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    expect(result.status).toBe("failed");
    expect(result.warning).toBe("request_timeout");
    expect(result.projectCount).toBe(0);
  });

  it("fails fast on missing or invalid configuration", async () => {
    const missing = await discoverAzureProjectsBounded({ organization: "contoso", pat: "" });
    expect(missing.warning).toBe("missing_configuration");
    const invalid = await discoverAzureProjectsBounded({
      organization: "https://dev.azure.com/x",
      pat: PAT,
    });
    expect(invalid.warning).toBe("invalid_configuration");
  });
});
