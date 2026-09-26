import { describe, expect, it } from "vitest";
import { decideSync, pickScheduledSprints, SYNC_INTERVAL_MS } from "../scheduler-rules";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("decideSync", () => {
  it("starts when there has never been a run", () => {
    expect(decideSync(null, "sprint", NOW)).toEqual({ action: "start" });
  });

  it("resumes an active or interrupted run before starting another", () => {
    expect(
      decideSync(
        { id: "r1", status: "running", startedAt: ago(3_600_000), finishedAt: null },
        "backlog",
        NOW,
      ),
    ).toEqual({ action: "advance", runId: "r1" });
  });

  it("waits until the interval has passed since the last finished run", () => {
    const recent = {
      id: "r2",
      status: "succeeded",
      startedAt: ago(5 * 60_000),
      finishedAt: ago(4 * 60_000),
    };
    expect(decideSync(recent, "sprint", NOW)).toEqual({ action: "wait" });
    const old = { ...recent, finishedAt: ago(SYNC_INTERVAL_MS.sprint) };
    expect(decideSync(old, "sprint", NOW)).toEqual({ action: "start" });
  });

  it("treats partial and failed runs as finished", () => {
    const failed = { id: "r3", status: "failed", startedAt: ago(60_000), finishedAt: ago(60_000) };
    expect(decideSync(failed, "history", NOW)).toEqual({ action: "wait" });
  });
});

describe("pickScheduledSprints", () => {
  const sprint = (
    team: string,
    id: string,
    startDate: string | null,
    finishDate: string | null,
  ) => ({
    tenantId: "t1",
    teamId: team,
    teamIterationId: id,
    startDate,
    finishDate,
  });

  it("keeps each team's latest started sprint", () => {
    const picked = pickScheduledSprints(
      [
        sprint("hot", "s1", "2026-08-16", "2026-08-29"),
        sprint("hot", "s2", "2026-09-06", "2026-09-17"),
        sprint("hot", "s3", "2026-10-04", "2026-10-15"), // not started yet
        sprint("rev", "r5", "2026-04-20", "2026-05-03"), // finished long ago
        sprint("tal", "u1", null, null),
      ],
      "2026-09-26",
    );
    expect(picked.map((s) => s.teamIterationId)).toEqual(["s2"]);
  });

  it("keeps a finished sprint for one more sprint length, the team's own cadence", () => {
    // 12-day sprint ending 17 Sep: still followed through 29 Sep.
    const s2 = sprint("hot", "s2", "2026-09-06", "2026-09-17");
    expect(pickScheduledSprints([s2], "2026-09-29")).toHaveLength(1);
    expect(pickScheduledSprints([s2], "2026-09-30")).toHaveLength(0);
  });
});
