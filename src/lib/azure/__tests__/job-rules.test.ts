import { describe, expect, it } from "vitest";
import {
  RUN_STALE_MS,
  canTombstone,
  decideStart,
  deriveRunStatus,
  initialCursor,
  isLockExpired,
  nextCursor,
} from "../job-rules";
import { emptyCounts, SYNC_DOMAINS, type DomainCounts, type SyncDomain } from "../contracts";

const counts = (patch: Partial<DomainCounts> = {}): DomainCounts => ({
  ...emptyCounts(),
  ...patch,
});

describe("job cursor", () => {
  it("starts at the organization domain", () => {
    expect(initialCursor()).toEqual({ domain: "organization", index: 0 });
  });

  it("advances within a domain while units remain", () => {
    expect(nextCursor({ domain: "teams", index: 2 }, true)).toEqual({ domain: "teams", index: 3 });
  });

  it("skips paired domains driven by their owner domain", () => {
    expect(nextCursor({ domain: "iterations", index: 0 }, false)).toEqual({
      domain: "members",
      index: 0,
    });
    expect(nextCursor({ domain: "members", index: 0 }, false)).toBeNull();
  });

  it("resumes from a stored domain/page cursor", () => {
    const stored = { domain: "teams" as SyncDomain, index: 4 };
    expect(nextCursor(stored, true)).toEqual({ domain: "teams", index: 5 });
  });
});

describe("tombstone safety", () => {
  it("never tombstones a partial or failed domain", () => {
    expect(canTombstone(counts({ complete: false }), false)).toBe(false);
    expect(canTombstone(counts({ complete: true, failed: 1 }), true)).toBe(false);
    expect(canTombstone(counts({ complete: true }), false)).toBe(false);
  });

  it("tombstones only after a complete failure-free scan", () => {
    expect(canTombstone(counts({ complete: true, failed: 0 }), true)).toBe(true);
  });
});

describe("run status", () => {
  it("derives succeeded, partial and failed", () => {
    const all = (complete: boolean) =>
      Object.fromEntries(SYNC_DOMAINS.map((d) => [d, counts({ complete })])) as Record<
        SyncDomain,
        DomainCounts
      >;
    expect(deriveRunStatus(all(true))).toBe("succeeded");
    expect(deriveRunStatus(all(false))).toBe("failed");
    const mixed = { ...all(false), projects: counts({ complete: true }) };
    expect(deriveRunStatus(mixed)).toBe("partial");
  });
});

describe("duplicate start handling", () => {
  const now = Date.UTC(2026, 7, 27, 8, 0, 0);
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  it("reuses a live run instead of starting a second one", () => {
    expect(
      decideStart(
        { runId: "r1", status: "running", heartbeatAt: iso(-5_000), expiresAt: iso(60_000) },
        now,
      ),
    ).toEqual({ kind: "reuse", runId: "r1" });
  });

  it("reclaims a stale or expired run", () => {
    expect(
      decideStart(
        {
          runId: "r1",
          status: "running",
          heartbeatAt: iso(-RUN_STALE_MS - 1_000),
          expiresAt: iso(60_000),
        },
        now,
      ).kind,
    ).toBe("reclaim");
    expect(
      decideStart(
        { runId: "r1", status: "queued", heartbeatAt: iso(-1_000), expiresAt: iso(-1) },
        now,
      ).kind,
    ).toBe("reclaim");
  });

  it("starts fresh with no active run or a finished one", () => {
    expect(decideStart(null, now)).toEqual({ kind: "start" });
    expect(
      decideStart(
        { runId: "r1", status: "succeeded", heartbeatAt: iso(-1_000), expiresAt: iso(60_000) },
        now,
      ),
    ).toEqual({ kind: "start" });
  });

  it("treats a missing expiry as expired", () => {
    expect(isLockExpired(null, now)).toBe(true);
    expect(isLockExpired(iso(1_000), now)).toBe(false);
  });
});
