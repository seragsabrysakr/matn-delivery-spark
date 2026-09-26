import { describe, expect, it } from "vitest";
import {
  actualDeliveryDate,
  contributingSprints,
  deliverableScope,
  deliveryStatus,
  descendantsOf,
  forecastDelivery,
  rollUpProgress,
  type HierarchyItem,
} from "../deliverable-rules";

const item = (
  azureId: number,
  parentAzureId: number | null,
  over: Partial<HierarchyItem> = {},
): HierarchyItem => ({
  azureId,
  parentAzureId,
  type: "User Story",
  title: `Item ${azureId}`,
  countsTowardScope: true,
  stateCategory: "proposed",
  estimate: 3,
  iterationPath: null,
  closedDate: null,
  teamId: "team-1",
  ...over,
});

// Epic 1 → Feature 10 → Stories 100, 101, 102 → Tasks under 100.
const epic = item(1, null, { type: "Epic", countsTowardScope: false, estimate: null });
const feature = item(10, 1, { type: "Feature", countsTowardScope: false, estimate: null });
const s100 = item(100, 10, {
  stateCategory: "completed",
  estimate: 5,
  closedDate: "2026-08-30T09:00:00Z",
  iterationPath: "P\\Sprint 1",
});
const s101 = item(101, 10, { estimate: 3, iterationPath: "P\\Sprint 2" });
const s102 = item(102, 10, { estimate: 2, stateCategory: "removed" });
const t1 = item(1000, 100, { type: "Task", countsTowardScope: false, estimate: 8 });
const t2 = item(1001, 100, { type: "Task", countsTowardScope: false, estimate: 4 });
const all = [epic, feature, s100, s101, s102, t1, t2];

describe("descendantsOf / deliverableScope", () => {
  it("walks the whole tree and never counts tasks as scope", () => {
    const tree = descendantsOf(1, all);
    expect(tree.map((i) => i.azureId).sort((a, b) => a - b)).toEqual([
      10, 100, 101, 102, 1000, 1001,
    ]);
    expect(deliverableScope(epic, tree).map((i) => i.azureId)).toEqual([100, 101]);
  });

  it("survives a parent cycle", () => {
    const a = item(1, 2);
    const b = item(2, 1);
    expect(descendantsOf(1, [a, b]).map((i) => i.azureId)).toEqual([2]);
  });

  it("never counts a container next to its own children", () => {
    // In Azure, Epics and Features can count toward scope themselves.
    const e = item(1, null, { type: "Epic" });
    const f = item(10, 1, { type: "Feature" });
    const bare = item(11, 1, { type: "Feature" }); // not broken down yet
    const s = item(100, 10);
    const scope = deliverableScope(e, descendantsOf(1, [e, f, bare, s]));
    expect(scope.map((i) => i.azureId).sort()).toEqual([100, 11]);
  });

  it("treats a scope item with nothing below it as its own scope", () => {
    expect(deliverableScope(s101, []).map((i) => i.azureId)).toEqual([101]);
  });
});

describe("rollUpProgress", () => {
  it("weights by points when at least 60% of scope is estimated", () => {
    const progress = rollUpProgress([s100, s101]);
    expect(progress).toEqual({
      percent: 62.5, // 5 of 8 points
      basis: "points",
      scopeItems: 2,
      completedItems: 1,
      remainingPoints: 3,
      remainingItems: 1,
    });
  });

  it("falls back to counts when estimates are too sparse", () => {
    const progress = rollUpProgress([
      s100,
      item(201, 10, { estimate: null }),
      item(202, 10, { estimate: null }),
    ]);
    expect(progress.basis).toBe("count");
    expect(progress.percent).toBe(33.3);
    expect(progress.remainingPoints).toBeNull();
  });

  it("reports unknown progress, not 0, with no scope", () => {
    expect(rollUpProgress([]).percent).toBeNull();
  });
});

describe("contributingSprints / actualDeliveryDate", () => {
  it("lists the sprints the work was planned in, in sprint order", () => {
    expect(
      contributingSprints(descendantsOf(1, all), ["P\\Sprint 1", "P\\Sprint 2", "P\\Sprint 3"]),
    ).toEqual(["P\\Sprint 1", "P\\Sprint 2"]);
  });

  it("is delivered only when everything in scope is completed", () => {
    expect(actualDeliveryDate(feature, [s100, s101])).toBeNull();
    const done101 = { ...s101, stateCategory: "completed" as const, closedDate: "2026-09-10" };
    expect(actualDeliveryDate(feature, [s100, done101])).toBe("2026-09-10");
  });

  it("uses the root's closed date once the root itself is completed", () => {
    const closed = { ...feature, stateCategory: "completed" as const, closedDate: "2026-09-12" };
    expect(actualDeliveryDate(closed, [s100, s101])).toBe("2026-09-12");
  });
});

describe("forecastDelivery", () => {
  const sprints = [
    { startDate: "2026-08-16", finishDate: "2026-08-29" },
    { startDate: "2026-09-06", finishDate: "2026-09-17" },
    { startDate: "2026-09-20", finishDate: "2026-10-01" },
  ];

  it("projects remaining work at the deliverable's own rate and team cadence", () => {
    const forecast = forecastDelivery({
      remaining: 12,
      // 8 points in sprint 1 (closed in the gap before sprint 2 counts), 4 in sprint 2.
      completions: [
        { date: "2026-08-25", amount: 5 },
        { date: "2026-08-30", amount: 3 },
        { date: "2026-09-15", amount: 4 },
      ],
      sprints,
      today: "2026-09-18",
    });
    expect(forecast.ratePerSprint).toBe(6);
    expect(forecast.sprintsUsed).toBe(2);
    // Cadence: 21 days between sprint starts. 12 / 6 = 2 sprints → 42 days.
    expect(forecast.date).toBe("2026-10-30");
    expect(forecast.low).toBe("2026-10-30"); // 12 / 8 → 2 sprints
    expect(forecast.high).toBe("2026-11-20"); // 12 / 4 → 3 sprints
    expect(forecast.reason).toBeNull();
  });

  it("needs at least two completed sprints", () => {
    const forecast = forecastDelivery({
      remaining: 5,
      completions: [{ date: "2026-08-25", amount: 5 }],
      sprints: sprints.slice(0, 1),
      today: "2026-09-01",
    });
    expect(forecast).toMatchObject({ date: null, reason: "insufficient_history" });
  });

  it("gives no date when nothing under the deliverable was completed recently", () => {
    const forecast = forecastDelivery({
      remaining: 5,
      completions: [],
      sprints,
      today: "2026-09-18",
    });
    expect(forecast).toMatchObject({ date: null, reason: "no_recent_progress" });
  });

  it("has no pessimistic end when a recent sprint delivered nothing", () => {
    const forecast = forecastDelivery({
      remaining: 6,
      completions: [{ date: "2026-08-25", amount: 6 }],
      sprints,
      today: "2026-09-18",
    });
    expect(forecast.date).not.toBeNull();
    expect(forecast.high).toBeNull();
  });

  it("reports an unestimated remainder instead of guessing", () => {
    expect(
      forecastDelivery({ remaining: null, completions: [], sprints, today: "2026-09-18" }).reason,
    ).toBe("unestimated");
  });
});

describe("deliveryStatus", () => {
  const today = "2026-10-01";

  it("covers delivered, uncommitted, late, at risk and on track", () => {
    expect(
      deliveryStatus({
        actualDate: "2026-09-20",
        committedDate: "2026-09-15",
        forecastDate: null,
        today,
      }),
    ).toEqual({ status: "delivered", reason: null, daysLate: 5 });
    expect(
      deliveryStatus({ actualDate: null, committedDate: null, forecastDate: "2026-11-01", today })
        .status,
    ).toBe("no_committed_date");
    expect(
      deliveryStatus({
        actualDate: null,
        committedDate: "2026-09-28",
        forecastDate: "2026-11-01",
        today,
      }),
    ).toEqual({ status: "late", reason: null, daysLate: 3 });
    expect(
      deliveryStatus({
        actualDate: null,
        committedDate: "2026-10-20",
        forecastDate: "2026-11-01",
        today,
      }),
    ).toEqual({ status: "at_risk", reason: "forecast_after_commitment", daysLate: null });
    expect(
      deliveryStatus({ actualDate: null, committedDate: "2026-10-20", forecastDate: null, today }),
    ).toEqual({ status: "at_risk", reason: "forecast_unavailable", daysLate: null });
    expect(
      deliveryStatus({
        actualDate: null,
        committedDate: "2026-11-15",
        forecastDate: "2026-11-01",
        today,
      }).status,
    ).toBe("on_track");
  });
});
