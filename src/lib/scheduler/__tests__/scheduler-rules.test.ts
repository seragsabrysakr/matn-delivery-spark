import { describe, expect, it } from "vitest";
import {
  decideSync,
  OVERDUE_LIMIT_DAYS,
  pickScheduledSprints,
  sprintPhase,
  SYNC_INTERVAL_MS,
} from "../scheduler-rules";

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

  it("keeps a late sprint current until the next one starts, up to the overdue limit", () => {
    // Ended 17 Sep, no Sprint 3 yet: still the team's sprint through 17 Oct.
    const s2 = sprint("hot", "s2", "2026-09-06", "2026-09-17");
    expect(pickScheduledSprints([s2], "2026-09-29")).toHaveLength(1);
    expect(pickScheduledSprints([s2], "2026-10-17")).toHaveLength(1);
    expect(pickScheduledSprints([s2], "2026-10-18")).toHaveLength(0);
    // Once Sprint 3 starts, it replaces Sprint 2.
    const s3 = sprint("hot", "s3", "2026-09-28", "2026-10-09");
    expect(pickScheduledSprints([s2, s3], "2026-09-29").map((s) => s.teamIterationId)).toEqual([
      "s3",
    ]);
  });
});

describe("sprintPhase", () => {
  const phase = (
    startDate: string | null,
    finishDate: string | null,
    today: string,
    laterSprintStarted = false,
  ) => sprintPhase({ startDate, finishDate, today, laterSprintStarted });

  it("classifies a sprint against today and the team's later sprints", () => {
    expect(phase(null, null, "2026-09-27")).toBe("undated");
    expect(phase("2026-10-04", "2026-10-15", "2026-09-27")).toBe("notStarted");
    expect(phase("2026-09-20", "2026-09-27", "2026-09-27")).toBe("running");
    expect(phase("2026-09-06", "2026-09-17", "2026-09-27")).toBe("overdue");
    expect(phase("2026-09-06", "2026-09-17", "2026-09-27", true)).toBe("ended");
    expect(phase("2026-09-06", "2026-09-17", `2026-10-17`)).toBe("overdue");
    expect(phase("2026-09-06", "2026-09-17", `2026-10-18`)).toBe("inactive");
    expect(OVERDUE_LIMIT_DAYS).toBe(30);
  });
});
