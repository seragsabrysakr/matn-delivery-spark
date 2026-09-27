import { describe, expect, it } from "vitest";
import { BEHIND_PACE_POINTS, portfolioStatus, sortPortfolio } from "../portfolio-rules";

const base = {
  phase: "running" as const,
  storiesPercent: 50,
  expectedPercent: 50,
  stuck: 0,
  storiesBehindTasks: 0,
};

describe("portfolioStatus", () => {
  it("reads the sprint phase first", () => {
    expect(portfolioStatus({ ...base, phase: "overdue" })).toBe("late");
    expect(portfolioStatus({ ...base, phase: "inactive" })).toBe("idle");
    expect(portfolioStatus({ ...base, phase: "undated" })).toBe("idle");
  });

  it("is behind only when stories trail the pace by the threshold", () => {
    expect(
      portfolioStatus({ ...base, storiesPercent: 50 - BEHIND_PACE_POINTS + 1, stuck: 0 }),
    ).toBe("onTrack");
    expect(portfolioStatus({ ...base, storiesPercent: 50 - BEHIND_PACE_POINTS })).toBe("behind");
    // Unknown progress is never read as behind.
    expect(portfolioStatus({ ...base, storiesPercent: null })).toBe("onTrack");
  });

  it("needs attention with stuck work or stories left behind their tasks", () => {
    expect(portfolioStatus({ ...base, stuck: 2 })).toBe("attention");
    expect(portfolioStatus({ ...base, storiesBehindTasks: 1 })).toBe("attention");
  });
});

describe("sortPortfolio", () => {
  it("puts problems first, then more stuck work, then by name", () => {
    const rows = sortPortfolio([
      { name: "B", status: "onTrack" as const, stuck: 0 },
      { name: "A", status: "idle" as const, stuck: 0 },
      { name: "C", status: "attention" as const, stuck: 1 },
      { name: "D", status: "attention" as const, stuck: 4 },
      { name: "E", status: "late" as const, stuck: 0 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["E", "D", "C", "B", "A"]);
  });
});
