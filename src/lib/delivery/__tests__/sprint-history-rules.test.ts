import { describe, expect, it } from "vitest";
import {
  averageVelocity,
  computeSprintHistory,
  firstWorkingDay,
  stateAt,
  zonedMidnight,
  type HistoryPoint,
  type ItemHistory,
  type SprintWindow,
} from "../sprint-history-rules";

const TZ = "Africa/Cairo";
const S2 = "Hoteliana\\Sprint 2";
const sprint: SprintWindow = {
  iterationId: "it-2",
  name: "Sprint 2",
  path: S2,
  startDate: "2026-09-06",
  finishDate: "2026-09-17",
};
const AFTER = Date.parse("2026-09-25T12:00:00Z");

const point = (rev: number, revisedAt: string, over: Partial<HistoryPoint> = {}): HistoryPoint => ({
  rev,
  revisedAt,
  iterationPath: S2,
  stateCategory: "proposed",
  estimate: 3,
  ...over,
});

const item = (
  id: number,
  revisions: HistoryPoint[],
  over: Partial<ItemHistory> = {},
): ItemHistory => ({
  workItemId: `w-${id}`,
  azureWorkItemId: id,
  title: `Item ${id}`,
  countsTowardScope: true,
  historyComplete: true,
  revisions,
  ...over,
});

describe("zonedMidnight / stateAt", () => {
  it("uses local midnight in the team's time zone", () => {
    // Cairo is UTC+3 in September 2026.
    expect(new Date(zonedMidnight("2026-09-06", TZ)).toISOString()).toBe(
      "2026-09-05T21:00:00.000Z",
    );
  });

  it("returns the latest revision at or before the instant, or null before creation", () => {
    const revisions = [
      point(1, "2026-09-01T08:00:00Z"),
      point(2, "2026-09-10T08:00:00Z", { estimate: 5 }),
    ];
    expect(stateAt(revisions, Date.parse("2026-09-05T00:00:00Z"))?.rev).toBe(1);
    expect(stateAt(revisions, Date.parse("2026-09-12T00:00:00Z"))?.estimate).toBe(5);
    expect(stateAt(revisions, Date.parse("2026-08-01T00:00:00Z"))).toBeNull();
  });
});

describe("computeSprintHistory", () => {
  const items: ItemHistory[] = [
    // Committed at start, delivered.
    item(1, [
      point(1, "2026-09-01T08:00:00Z", { estimate: 5 }),
      point(2, "2026-09-15T10:00:00Z", { stateCategory: "completed", estimate: 5 }),
    ]),
    // Committed at start, still open at the end -> carried over.
    item(2, [point(1, "2026-09-02T08:00:00Z", { estimate: 3 })]),
    // Added mid-sprint and delivered.
    item(3, [
      point(1, "2026-09-01T08:00:00Z", { iterationPath: "Hoteliana", estimate: 2 }),
      point(2, "2026-09-08T08:00:00Z", { estimate: 2 }),
      point(3, "2026-09-16T08:00:00Z", { stateCategory: "completed", estimate: 2 }),
    ]),
    // Committed, then moved out to the backlog mid-sprint -> removed.
    item(4, [
      point(1, "2026-09-01T08:00:00Z", { estimate: 8 }),
      point(2, "2026-09-09T08:00:00Z", { iterationPath: "Hoteliana", estimate: 8 }),
    ]),
    // A Task: never scope, never counted.
    item(5, [point(1, "2026-09-01T08:00:00Z")], { countsTowardScope: false }),
    // Created after the sprint ended, straight into it: not part of this sprint.
    item(6, [point(1, "2026-09-20T08:00:00Z")]),
  ];

  const row = computeSprintHistory(items, sprint, TZ, AFTER);

  it("reconstructs committed, added, removed, delivered and carried over", () => {
    expect(row.status).toBe("completed");
    expect(row.committed).toEqual({ count: 3, points: 16, estimated: 3 });
    expect(row.added).toEqual({ count: 1, points: 2, estimated: 1 });
    expect(row.removed).toEqual({ count: 1, points: 8, estimated: 1 });
    expect(row.delivered).toEqual({ count: 2, points: 7, estimated: 2 });
    expect(row.deliveredCommitted).toEqual({ count: 1, points: 5, estimated: 1 });
    expect(row.carriedOver).toEqual({ count: 1, points: 3, estimated: 1 });
    expect(row.carriedOverIds).toEqual([2]);
  });

  it("computes say/do on points when every committed item is estimated, and velocity", () => {
    expect(row.sayDo).toEqual({ percent: 31.3, basis: "points" }); // 5 of 16
    expect(row.velocity).toBe(7);
  });

  it("falls back to counts when a committed item has no estimate", () => {
    const unestimated = computeSprintHistory(
      [
        item(1, [point(1, "2026-09-01T08:00:00Z", { estimate: null })]),
        item(2, [
          point(1, "2026-09-01T08:00:00Z", { estimate: 3 }),
          point(2, "2026-09-10T08:00:00Z", { stateCategory: "completed", estimate: 3 }),
        ]),
      ],
      sprint,
      TZ,
      AFTER,
    );
    expect(unestimated.sayDo).toEqual({ percent: 50, basis: "count" });
  });

  it("reports incomplete histories instead of hiding them", () => {
    const gaps = computeSprintHistory(
      [item(1, [point(3, "2026-09-10T08:00:00Z")], { historyComplete: false })],
      sprint,
      TZ,
      AFTER,
    );
    expect(gaps.historyGaps).toBe(1);
  });

  it("treats a running sprint as current: no carry-over yet, delivered so far", () => {
    const running = computeSprintHistory(items, sprint, TZ, Date.parse("2026-09-15T12:00:00Z"));
    expect(running.status).toBe("current");
    expect(running.carriedOver).toBeNull();
    expect(running.delivered.count).toBe(1);
  });

  it("gives a future sprint no say/do or velocity", () => {
    const future = computeSprintHistory(items, sprint, TZ, Date.parse("2026-09-01T00:00:00Z"));
    expect(future.status).toBe("future");
    expect(future.sayDo).toBeNull();
    expect(future.velocity).toBeNull();
  });

  it("reports velocity as unknown, not zero, when delivered items have no estimates", () => {
    const unknown = computeSprintHistory(
      [
        item(1, [
          point(1, "2026-09-01T08:00:00Z", { estimate: null }),
          point(2, "2026-09-10T08:00:00Z", { stateCategory: "completed", estimate: null }),
        ]),
      ],
      sprint,
      TZ,
      AFTER,
    );
    expect(unknown.velocity).toBeNull();
  });
});

describe("averageVelocity", () => {
  const row = (finishDate: string, velocity: number | null, status = "completed") =>
    ({ finishDate, velocity, status }) as Parameters<typeof averageVelocity>[0][number];

  it("averages the last three completed sprints", () => {
    expect(
      averageVelocity([
        row("2026-08-01", 10),
        row("2026-08-15", 20),
        row("2026-08-29", 30),
        row("2026-09-12", 40),
        row("2026-09-26", 99, "current"),
      ]),
    ).toEqual({ mean: 30, sprints: 3 });
  });

  it("needs at least two completed sprints", () => {
    expect(averageVelocity([row("2026-08-29", 30)])).toBeNull();
  });
});

describe("commitment on the planning day", () => {
  it("counts work planned into the sprint on its first working day as committed", () => {
    const planned = computeSprintHistory(
      [
        // Sprint 2 starts Sunday 2026-09-06; planned into it that morning (Cairo).
        item(1, [
          point(1, "2026-09-01T08:00:00Z", { iterationPath: "Hoteliana" }),
          point(2, "2026-09-06T07:30:00Z"),
        ]),
        // Pulled in on day two: added during the sprint.
        item(2, [
          point(1, "2026-09-01T08:00:00Z", { iterationPath: "Hoteliana" }),
          point(2, "2026-09-07T07:30:00Z"),
        ]),
      ],
      sprint,
      TZ,
      AFTER,
    );
    expect(planned.committed.count).toBe(1);
    expect(planned.added.count).toBe(1);
  });

  it("skips non-working days to find the planning day", () => {
    // 2026-09-04 is a Friday: the first Sun–Thu working day is Sunday 2026-09-06.
    expect(firstWorkingDay("2026-09-04", [0, 1, 2, 3, 4])).toBe("2026-09-06");
    expect(firstWorkingDay("2026-09-06", [0, 1, 2, 3, 4])).toBe("2026-09-06");
  });

  it("does not count work closed and then reopened before the end as delivered", () => {
    const reopened = computeSprintHistory(
      [
        item(1, [
          point(1, "2026-09-01T08:00:00Z", { estimate: 3 }),
          point(2, "2026-09-15T08:00:00Z", { stateCategory: "completed", estimate: 3 }),
          point(3, "2026-09-16T08:00:00Z", { stateCategory: "resolved", estimate: 3 }),
        ]),
      ],
      sprint,
      TZ,
      AFTER,
    );
    expect(reopened.delivered.count).toBe(0);
    expect(reopened.carriedOver?.count).toBe(1);
  });
});

describe("work delivered after the sprint end", () => {
  it("reports late closures that never left the sprint, with the median delay", () => {
    const row = computeSprintHistory(
      [
        // Closed on the Sunday after a Thursday finish: late, still in the sprint.
        item(1, [
          point(1, "2026-09-01T08:00:00Z", { estimate: 5 }),
          point(2, "2026-09-20T07:00:00Z", { stateCategory: "completed", estimate: 5 }),
        ]),
        // Moved to the next sprint, then closed there: carried over, not late.
        item(2, [
          point(1, "2026-09-01T08:00:00Z", { estimate: 3 }),
          point(2, "2026-09-19T07:00:00Z", { iterationPath: "Hoteliana\\Sprint 3", estimate: 3 }),
          point(3, "2026-09-22T07:00:00Z", {
            iterationPath: "Hoteliana\\Sprint 3",
            stateCategory: "completed",
            estimate: 3,
          }),
        ]),
      ],
      sprint,
      TZ,
      AFTER,
    );
    expect(row.delivered.count).toBe(0);
    expect(row.carriedOver).toEqual({ count: 2, points: 8, estimated: 2 });
    expect(row.deliveredAfterEnd).toEqual({ count: 1, points: 5, estimated: 1 });
    expect(row.medianDaysLate).toBe(2.4); // Fri 18 Sep 00:00 Cairo -> Sun 20 Sep 10:00 Cairo
  });

  it("has no late deliveries while the sprint is running", () => {
    const running = computeSprintHistory(
      [item(1, [point(1, "2026-09-01T08:00:00Z")])],
      sprint,
      TZ,
      Date.parse("2026-09-10T12:00:00Z"),
    );
    expect(running.deliveredAfterEnd).toBeNull();
    expect(running.medianDaysLate).toBeNull();
  });
});
