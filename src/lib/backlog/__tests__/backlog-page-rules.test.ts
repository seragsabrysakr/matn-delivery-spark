import { describe, expect, it } from "vitest";
import {
  buildBacklog,
  matchesFilter,
  placementOf,
  STALE_AFTER_DAYS,
  type BacklogItemInput,
} from "../backlog-page-rules";

const TODAY = "2026-09-27";
const NOW = "2026-09-27T09:00:00Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

const item = (id: number, over: Partial<BacklogItemInput> = {}): BacklogItemInput => ({
  azureId: id,
  parentAzureId: 100,
  type: "User Story",
  title: `Story ${id}`,
  state: "New",
  stateCategory: "proposed",
  countsTowardScope: true,
  estimate: 3,
  assignee: "Mona",
  priority: 2,
  tags: [],
  azureUrl: null,
  createdAt: daysAgo(10),
  changedAt: daysAgo(1),
  sprint: null,
  ...over,
});

describe("placementOf", () => {
  it("classifies by sprint dates against today", () => {
    expect(placementOf(null, TODAY)).toBe("noSprint");
    expect(placementOf({ name: "Root", startDate: null, finishDate: null }, TODAY)).toBe(
      "noSprint",
    );
    expect(
      placementOf({ name: "S2", startDate: "2026-09-06", finishDate: "2026-09-17" }, TODAY),
    ).toBe("pastSprint");
    expect(
      placementOf({ name: "S4", startDate: "2026-10-04", finishDate: "2026-10-15" }, TODAY),
    ).toBe("futureSprint");
    expect(
      placementOf({ name: "S3", startDate: "2026-09-20", finishDate: "2026-09-27" }, TODAY),
    ).toBe("currentSprint");
    // A late sprint the team still works in is current, not backlog (ADR-028).
    expect(
      placementOf(
        { name: "S2", startDate: "2026-09-06", finishDate: "2026-09-17", isCurrent: true },
        TODAY,
      ),
    ).toBe("currentSprint");
  });
});

describe("buildBacklog", () => {
  it("keeps only open scope items outside the current sprint", () => {
    const { rows } = buildBacklog(
      [
        item(1),
        item(2, { countsTowardScope: false, type: "Task" }),
        item(3, { stateCategory: "completed" }),
        item(4, { stateCategory: "removed" }),
        item(5, { sprint: { name: "S3", startDate: "2026-09-20", finishDate: "2026-09-30" } }),
        item(6, { sprint: { name: "S2", startDate: "2026-09-06", finishDate: "2026-09-17" } }),
      ],
      TODAY,
      NOW,
    );
    expect(rows.map((r) => r.azureId)).toEqual([1, 6]);
    expect(rows.find((r) => r.azureId === 6)).toMatchObject({
      placement: "pastSprint",
      sprintName: "S2",
    });
  });

  it("flags each check from Azure data and derives readiness", () => {
    const { rows, stats } = buildBacklog(
      [
        item(1),
        item(2, { estimate: null }),
        item(3, { estimate: 0 }),
        item(4, { assignee: null }),
        item(5, { changedAt: daysAgo(STALE_AFTER_DAYS) }),
        item(6, { parentAzureId: null }),
      ],
      TODAY,
      NOW,
    );
    const flags = Object.fromEntries(rows.map((r) => [r.azureId, r.flags]));
    expect(flags[1]).toEqual([]);
    expect(flags[2]).toEqual(["unestimated"]);
    expect(flags[3]).toEqual(["unestimated"]);
    expect(flags[4]).toEqual(["unassigned"]);
    expect(flags[5]).toEqual(["stale"]);
    expect(flags[6]).toEqual(["noParent"]);
    // Readiness is estimate + parent; unassigned or stale work can still be ready.
    expect(rows.filter((r) => !r.ready).map((r) => r.azureId)).toEqual([2, 3, 6]);
    expect(stats).toMatchObject({
      total: 6,
      unestimated: 2,
      unassigned: 1,
      stale: 1,
      notReady: 3,
      points: 12,
    });
  });

  it("orders by Azure priority, unprioritized last, then id", () => {
    const { rows } = buildBacklog(
      [item(5, { priority: null }), item(3, { priority: 2 }), item(9, { priority: 1 }), item(1)],
      TODAY,
      NOW,
    );
    expect(rows.map((r) => r.azureId)).toEqual([9, 1, 3, 5]);
  });

  it("reports unknown ages as null, not zero", () => {
    const { rows } = buildBacklog(
      [item(1, { createdAt: "not a date", changedAt: "nope" })],
      TODAY,
      NOW,
    );
    expect(rows[0]).toMatchObject({ ageDays: null, idleDays: null });
    expect(rows[0]!.flags).not.toContain("stale");
  });
});

describe("matchesFilter", () => {
  it("filters by flag or readiness", () => {
    const { rows } = buildBacklog(
      [item(1), item(2, { estimate: null, assignee: null })],
      TODAY,
      NOW,
    );
    const pick = (f: Parameters<typeof matchesFilter>[1]) =>
      rows.filter((r) => matchesFilter(r, f)).map((r) => r.azureId);
    expect(pick("all")).toEqual([1, 2]);
    expect(pick("unassigned")).toEqual([2]);
    expect(pick("notReady")).toEqual([2]);
    expect(pick("stale")).toEqual([]);
  });
});
