import { describe, expect, it } from "vitest";
import { AzureDevOpsClient, mapWithConcurrency } from "../client.server";
import { AzureDevOpsError, toAzureFailure } from "../errors";

const PAT = "super-secret-pat-value";

const jsonResponse = (
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });

const makeClient = (fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) =>
  new AzureDevOpsClient({
    organization: "contoso",
    pat: PAT,
    fetchImpl,
    sleep: async () => {},
    random: () => 0,
    ...overrides,
  });

describe("AzureDevOpsClient", () => {
  it("sends basic auth and api-version, and never exposes the PAT in the URL", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const client = makeClient(async (url, init) => {
      seenUrl = String(url);
      seenAuth = String(new Headers(init?.headers).get("authorization"));
      return jsonResponse({ count: 0, value: [] });
    });

    await client.listProjects();

    expect(seenUrl).toContain("https://dev.azure.com/contoso/_apis/projects");
    expect(seenUrl).toContain("api-version=7.1");
    expect(seenUrl).not.toContain(PAT);
    expect(seenAuth).toBe(`Basic ${btoa(`:${PAT}`)}`);
  });

  it("follows continuation tokens", async () => {
    let call = 0;
    const client = makeClient(async () => {
      call += 1;
      return call === 1
        ? jsonResponse(
            { count: 1, value: [{ id: "a" }] },
            { headers: { "x-ms-continuationtoken": "next" } },
          )
        : jsonResponse({ count: 1, value: [{ id: "b" }] });
    });

    const projects = await client.listProjects();
    expect(projects.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("stops paging at the configured ceiling", async () => {
    let calls = 0;
    const client = makeClient(
      async () => {
        calls += 1;
        return jsonResponse(
          { count: 1, value: [{ id: String(calls) }] },
          { headers: { "x-ms-continuationtoken": "t" } },
        );
      },
      { maxPages: 3 },
    );

    const projects = await client.listProjects();
    expect(calls).toBe(3);
    expect(projects).toHaveLength(3);
  });

  it("retries throttling responses and honours retry-after", async () => {
    const delays: number[] = [];
    let calls = 0;
    const client = makeClient(
      async () => {
        calls += 1;
        return calls === 1
          ? new Response("", { status: 429, headers: { "retry-after": "2" } })
          : jsonResponse({ count: 0, value: [] });
      },
      { sleep: async (ms: number) => void delays.push(ms) },
    );

    await client.listProjects();
    expect(calls).toBe(2);
    expect(delays).toEqual([2000]);
  });

  it("surfaces throttling as a sanitized error after exhausting retries", async () => {
    const client = makeClient(
      async () => new Response("", { status: 429, headers: { "retry-after": "5" } }),
      {
        maxRetries: 1,
      },
    );

    await expect(client.listProjects()).rejects.toMatchObject({
      code: "throttled",
      retryAfterSeconds: 5,
    });
  });

  it("maps auth and permission failures without leaking provider text", async () => {
    const unauthorized = makeClient(async () => new Response(`denied for ${PAT}`, { status: 401 }));
    const forbidden = makeClient(async () => new Response("no scope", { status: 403 }));

    const authError = await unauthorized.listProjects().catch((e: unknown) => e);
    expect(authError).toBeInstanceOf(AzureDevOpsError);
    expect((authError as Error).message).not.toContain(PAT);
    expect(toAzureFailure(authError).code).toBe("invalid_credentials");
    await expect(forbidden.listProjects()).rejects.toMatchObject({
      code: "insufficient_permissions",
    });
  });

  it("treats a non-JSON sign-in page as an invalid credential", async () => {
    const client = makeClient(
      async () =>
        new Response("<html>sign in</html>", { headers: { "content-type": "text/html" } }),
    );
    await expect(client.listProjects()).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("times out and reports a sanitized timeout", async () => {
    const client = makeClient(
      async () => {
        throw new Error("network down");
      },
      { maxRetries: 0 },
    );
    await expect(client.listProjects()).rejects.toMatchObject({ code: "timeout" });
  });

  it("returns null instead of failing the run for optional team settings", async () => {
    const client = makeClient(async () => new Response("", { status: 404 }));
    expect(await client.getTeamSettings("p", "t")).toBeNull();
    expect(await client.getTeamFieldValues("p", "t")).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and respects the limit", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("AzureDevOpsClient metadata reads", () => {
  it("reads process and board metadata with GET only, on the documented paths", async () => {
    const calls: { url: string; method: string }[] = [];
    const client = makeClient(async (url, init) => {
      calls.push({ url: String(url), method: String(init?.method) });
      return jsonResponse({ count: 0, value: [] });
    });

    await client.listWorkItemTypes("proj-1");
    await client.listWorkItemTypeStates("proj-1", "User Story");
    await client.listTeamBoards("proj-1", "team-1");
    await client.listBoardColumns("proj-1", "team-1", "board-1");

    expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "GET", "GET"]);
    expect(calls[0]!.url).toContain("/contoso/proj-1/_apis/wit/workitemtypes?");
    expect(calls[1]!.url).toContain("/proj-1/_apis/wit/workitemtypes/User%20Story/states?");
    expect(calls[2]!.url).toContain("/proj-1/team-1/_apis/work/boards?");
    expect(calls[3]!.url).toContain("/proj-1/team-1/_apis/work/boards/board-1/columns?");
    for (const call of calls) expect(call.url).toContain("api-version=7.1");
  });
});

describe("AzureDevOpsClient backlog WIQL", () => {
  it("sends timePrecision and $top on the allowlisted WIQL POST", async () => {
    let seenUrl = "";
    let seenMethod = "";
    const client = makeClient(async (url, init) => {
      seenUrl = String(url);
      seenMethod = String(init?.method);
      return jsonResponse({ workItems: [] });
    });

    await client.postAllowlisted(
      "wiql",
      "proj-1",
      { query: "SELECT [System.Id] FROM WorkItems" },
      { query: { timePrecision: "true", $top: 5001 } },
    );

    expect(seenMethod).toBe("POST");
    expect(seenUrl).toContain("/proj-1/_apis/wit/wiql?");
    expect(seenUrl).toContain("timePrecision=true");
    expect(seenUrl).toContain("%24top=5001");
  });
});

describe("AzureDevOpsClient revisions", () => {
  it("pages one item's revisions with GET from the last ingested rev", async () => {
    const calls: string[] = [];
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: 42, rev: from + i + 1, fields: {} }));
    const client = makeClient(async (url, init) => {
      calls.push(`${String(init?.method)} ${String(url)}`);
      const skip = Number(new URL(String(url)).searchParams.get("$skip"));
      return jsonResponse({ value: skip === 5 ? page(5, 200) : page(skip, 3) });
    });

    const revisions = await client.listWorkItemRevisions("proj-1", 42, 5);

    expect(revisions.map((r) => r.rev)).toEqual(Array.from({ length: 203 }, (_, i) => i + 6));
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.startsWith("GET "))).toBe(true);
    expect(calls[0]).toContain("/proj-1/_apis/wit/workItems/42/revisions?");
    expect(calls[0]).toContain("%24skip=5");
    expect(calls[1]).toContain("%24skip=205");
  });
});
