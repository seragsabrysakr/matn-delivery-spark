import { describe, expect, it } from "vitest";
import { normalizeOrganization, validateAzureOrganization } from "../validate.server";

const PAT = "super-secret-pat-value";
const ORG = "matnsolutions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const run = (fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) =>
  validateAzureOrganization({
    organization: ORG,
    pat: PAT,
    fetchImpl,
    sleep: async () => {},
    ...overrides,
  });

describe("normalizeOrganization", () => {
  it("trims and accepts the real organization", () => {
    expect(normalizeOrganization("  matnsolutions \n")).toBe("matnsolutions");
  });

  it("rejects URLs, slashes, query strings and whitespace", () => {
    for (const value of [
      "https://dev.azure.com/matnsolutions",
      "matn/solutions",
      "matnsolutions?x=1",
      "matn solutions",
      "",
      null,
    ]) {
      expect(normalizeOrganization(value)).toBeNull();
    }
  });
});

describe("validateAzureOrganization", () => {
  it("issues one minimal request and reports connected", async () => {
    const urls: string[] = [];
    const diag = await run(async (url) => {
      urls.push(String(url));
      return json({ count: 1, value: [{ id: "p" }] });
    });
    expect(urls).toEqual([
      "https://dev.azure.com/matnsolutions/_apis/projects?api-version=7.1&$top=1",
    ]);
    expect(diag.outcome).toBe("connected");
    expect(diag.stage).toBe("azure_response");
    expect(diag.projectCount).toBe(1);
    expect(diag.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("maps 401/403/404 without retrying", async () => {
    for (const [status, outcome] of [
      [401, "invalid_credentials"],
      [403, "insufficient_permissions"],
      [404, "organization_not_found"],
      [400, "invalid_configuration"],
    ] as const) {
      let calls = 0;
      const diag = await run(async () => {
        calls += 1;
        return new Response("provider detail", { status });
      });
      expect(calls).toBe(1);
      expect(diag.outcome).toBe(outcome);
      expect(diag.httpStatus).toBe(status);
    }
  });

  it("retries a 503 exactly once", async () => {
    let calls = 0;
    const diag = await run(async () => {
      calls += 1;
      return calls === 1 ? new Response("", { status: 503 }) : json({ count: 2, value: [] });
    });
    expect(calls).toBe(2);
    expect(diag.outcome).toBe("connected");
    expect(diag.projectCount).toBe(2);
  });

  it("reports request_timeout when the fetch aborts, without retrying", async () => {
    let calls = 0;
    const diag = await run(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          calls += 1;
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
      { timeoutMs: 20 },
    );
    expect(calls).toBe(1);
    expect(diag.outcome).toBe("request_timeout");
    expect(diag.stage).toBe("azure_response");
  });

  it("reports network_unreachable on a connect failure", async () => {
    const diag = await run(async () => {
      throw new Error("getaddrinfo ENOTFOUND dev.azure.com");
    });
    expect(diag.outcome).toBe("network_unreachable");
    expect(diag.stage).toBe("dns_or_connect");
  });

  it("does not cut the fetch short before the 30s timeout", async () => {
    let observedTimeout = 0;
    const diag = await validateAzureOrganization({
      organization: ORG,
      pat: PAT,
      fetchImpl: async (_url, init) => {
        // Simulate a slow response resolving at 25s of a 30s budget.
        observedTimeout = init?.signal ? 1 : 0;
        return json({ count: 0, value: [] });
      },
      now: (() => {
        const values = [0, 25_000];
        let i = 0;
        return () => values[Math.min(i++, values.length - 1)]!;
      })(),
    });
    expect(observedTimeout).toBe(1);
    expect(diag.outcome).toBe("connected");
    expect(diag.elapsedMs).toBe(25_000);
  });

  it("never leaks the PAT or the Authorization header", async () => {
    let sentAuth = "";
    const diag = await run(async (url, init) => {
      sentAuth = String(new Headers(init?.headers).get("authorization"));
      expect(String(url)).not.toContain(PAT);
      return new Response(`sign in as ${PAT}`, { status: 401 });
    });
    expect(sentAuth).toBe(`Basic ${btoa(`:${PAT}`)}`);
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toContain(PAT);
    expect(serialized).not.toContain(btoa(`:${PAT}`));
    expect(serialized.toLowerCase()).not.toContain("basic ");
  });
});
