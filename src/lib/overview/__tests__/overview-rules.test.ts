import { describe, expect, it } from "vitest";
import { countWorkingDays, sprintCalendar } from "@/lib/calendar/cairo";
import {
  buildIterationWiql,
  chunkIds,
  escapeWiqlLiteral,
  isAllowedReadPostKind,
} from "@/lib/azure/wiql";
import { diffWorkItem } from "@/lib/azure/workitem-map";
import {
  buildOverview,
  computeCriticalBlockers,
  computeFunnel,
  computeScopeCompletion,
  computeSprintConfidence,
  type BoardFact,
  type RealWorkItemFact,
} from "../overview-rules";

const fact = (over: Partial<RealWorkItemFact> = {}): RealWorkItemFact => ({
  id: "id-1",
  azureWorkItemId: 1,
  title: "Item",
  alias: "story",
  azureType: "User Story",
  state: "Active",
  stateCategory: "inProgress",
  isBlocked: false,
  blockedSince: null,
  estimate: 5,
  assignedToMemberId: "m1",
  countsTowardScope: true,
  stateChangeDate: "2026-08-18T00:00:00.000Z",
  changedAtSource: "2026-08-18T00:00:00.000Z",
  azureUrl: null,
  boardColumn: null,
  boardColumnEnteredAt: null,
  ...over,
});

describe("cairo calendar", () => {
  it("counts Sunday–Thursday working days only", () => {
    // 2026-08-16 is a Sunday; 2026-08-29 the following Saturday.
    expect(countWorkingDays("2026-08-16", "2026-08-29")).toBe(10);
  });

  it("returns null when sprint dates are missing", () => {
    expect(sprintCalendar(null, "2026-08-29", "2026-08-20")).toBeNull();
    expect(sprintCalendar("2026-08-16", null, "2026-08-20")).toBeNull();
  });

  it("derives day N of M and expected progress", () => {
    const calendar = sprintCalendar("2026-08-16", "2026-08-29", "2026-08-25");
    expect(calendar?.totalWorkingDays).toBe(10);
    expect(calendar?.currentWorkingDay).toBe(8);
    expect(calendar?.expectedCompletionPercent).toBe(80);
  });

  it("clamps a date after the sprint to the final day", () => {
    expect(sprintCalendar("2026-08-16", "2026-08-29", "2026-09-10")?.currentWorkingDay).toBe(10);
  });
});

describe("wiql builder", () => {
  it("only allows the two read POST kinds", () => {
    expect(isAllowedReadPostKind("wiql")).toBe(true);
    expect(isAllowedReadPostKind("workItemsBatch")).toBe(true);
    expect(isAllowedReadPostKind("workitemupdate")).toBe(false);
  });

  it("escapes single quotes instead of interpolating raw input", () => {
    expect(escapeWiqlLiteral("O'Brien")).toBe("O''Brien");
  });

  it("scopes the query to project, iteration subtree and mapped types", () => {
    const wiql = buildIterationWiql({
      projectName: "Hoteliana",
      iterationPath: "Hoteliana\\Sprint 1",
      workItemTypes: ["User Story", "Bug"],
    });
    expect(wiql).toContain("[System.TeamProject] = 'Hoteliana'");
    expect(wiql).toContain("[System.IterationPath] UNDER 'Hoteliana\\Sprint 1'");
    expect(wiql).toContain("IN ('User Story', 'Bug')");
  });

  it("caps batches at 200 ids", () => {
    const ids = Array.from({ length: 450 }, (_, i) => i + 1);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(200);
    expect(chunks[2]).toHaveLength(50);
  });
});

describe("work item diff", () => {
  it("treats an identical re-sync as unchanged despite null/undefined mismatch", () => {
    const payload = { title: "A", estimate: 5, reason: null } as never;
    expect(diffWorkItem({ title: "A", estimate: "5", reason: undefined }, payload).kind).toBe(
      "unchanged",
    );
  });

  it("reports only the changed columns", () => {
    const payload = { title: "B", estimate: 5 } as never;
    const diff = diffWorkItem({ title: "A", estimate: 5 }, payload);
    expect(diff).toEqual({ kind: "update", patch: { title: "B" } });
  });
});

describe("overview rules", () => {
  it("prefers estimates and falls back to item count", () => {
    const estimated = computeScopeCompletion([
      fact({ id: "1", estimate: 5, stateCategory: "completed" }),
      fact({ id: "2", estimate: 5, stateCategory: "inProgress" }),
    ]);
    expect(estimated).toMatchObject({ percent: 50, basis: "estimate" });

    const counted = computeScopeCompletion([
      fact({ id: "1", estimate: null, stateCategory: "completed" }),
      fact({ id: "2", estimate: null, stateCategory: "inProgress" }),
    ]);
    expect(counted).toMatchObject({ percent: 50, basis: "count" });
  });

  it("reports no scope rather than zero when there are no work items", () => {
    expect(computeScopeCompletion([]).percent).toBeNull();
  });

  it("counts only active items blocked for two days or more", () => {
    const now = "2026-08-25T00:00:00.000Z";
    const result = computeCriticalBlockers(
      [
        fact({ id: "1", isBlocked: true, blockedSince: "2026-08-20T00:00:00.000Z" }),
        fact({ id: "2", isBlocked: true, blockedSince: "2026-08-24T18:00:00.000Z" }),
        fact({
          id: "3",
          isBlocked: true,
          blockedSince: "2026-08-01T00:00:00.000Z",
          stateCategory: "completed",
        }),
      ],
      now,
    );
    expect(result.count).toBe(1);
  });

  it("withholds the confidence score below the coverage floor", () => {
    const result = computeSprintConfidence({
      scopePercent: null,
      expectedPercent: null,
      baselineScopeTotal: null,
      currentScopeTotal: 0,
      blockedActive: 0,
      activeTotal: 0,
      dataCoverage: 1,
    });
    expect(result.score).toBeNull();
    expect(result.coverage).toBeLessThan(0.6);
  });

  it("scores confidence from the available components only", () => {
    const result = computeSprintConfidence({
      scopePercent: 70,
      expectedPercent: 70,
      baselineScopeTotal: null,
      currentScopeTotal: 10,
      blockedActive: 0,
      activeTotal: 10,
      dataCoverage: 1,
    });
    expect(result.coverage).toBeCloseTo(0.8, 5);
    expect(result.score).toBe(100);
  });

  it("marks engineering and release unavailable until those domains are synchronized", () => {
    const result = buildOverview({
      facts: [fact()],
      members: [],
      calendar: sprintCalendar("2026-08-16", "2026-08-29", "2026-08-25"),
      history: [],
      lastSyncedAt: "2026-08-25T00:00:00.000Z",
      nowIso: "2026-08-25T00:10:00.000Z",
      iterationId: "ti-1",
    });
    expect(result.unavailable["engineering"]).toBe("not_synchronized");
    expect(result.unavailable["release"]).toBe("not_synchronized");
    expect(result.unavailable["scopeChange"]).toBe("no_baseline_snapshot");
    const scopeChange = result.snapshot.kpis.find((k) => k.id === "scopeChange");
    expect(scopeChange?.unavailable?.reasonKey).toBe("real.reason.no_baseline_snapshot");
    expect(result.snapshot.kpis.find((k) => k.id === "release")?.unavailable?.reasonKey).toBe(
      "real.reason.not_synchronized",
    );
  });

  it("withholds scope change while the only baseline was captured today", () => {
    const result = buildOverview({
      facts: [fact()],
      members: [],
      calendar: sprintCalendar("2026-08-16", "2026-08-29", "2026-08-25"),
      history: [{ snapshotDate: "2026-08-25", workingDay: 8, completedPercent: 0, scopeTotal: 5 }],
      lastSyncedAt: "2026-08-25T09:00:00.000Z",
      nowIso: "2026-08-25T09:10:00.000Z",
      iterationId: "ti-1",
    });
    expect(result.unavailable["scopeChange"]).toBe("baseline_same_day");
    expect(result.snapshot.kpis.find((k) => k.id === "scopeChange")?.unavailable?.reasonKey).toBe(
      "real.reason.baseline_same_day",
    );
  });

  it("always renders the six primary cards with dictionary-backed keys", () => {
    const result = buildOverview({
      facts: [],
      members: [],
      calendar: null,
      history: [],
      lastSyncedAt: null,
      nowIso: "2026-08-25T00:00:00.000Z",
      iterationId: "ti-1",
    });
    expect(result.unavailable["workItems"]).toBe("no_work_items");
    expect(result.unavailable["sprintCalendar"]).toBe("no_sprint_dates");
    expect(result.snapshot.kpis.map((k) => k.id)).toEqual([
      "confidence",
      "scope",
      "expected",
      "scopeChange",
      "blockers",
      "release",
    ]);
    expect(result.snapshot.kpis[0]?.tooltipKey).toBe("kpi.confidence.help");
    expect(result.snapshot.kpis[1]?.explanationKey).toBe("real.reason.no_work_items");
    expect(result.snapshot.risks).toHaveLength(0);
  });

  it("reports capacity and effort as unknown rather than zero", () => {
    const result = buildOverview({
      facts: [fact({ assignedToMemberId: "m1", estimate: null })],
      members: [{ id: "m1", displayName: "Sara", capacityHours: null }],
      calendar: sprintCalendar("2026-08-16", "2026-08-29", "2026-08-25"),
      history: [],
      lastSyncedAt: "2026-08-25T00:00:00.000Z",
      nowIso: "2026-08-25T00:10:00.000Z",
      iterationId: "ti-1",
    });
    const member = result.snapshot.teamLoad[0]!;
    expect(member.capacityHours).toBeNull();
    expect(member.assignedHours).toBeNull();
    expect(member.signal).toBe("unknown");
    expect(member.activeItems).toBe(1);
  });
});

describe("computeFunnel (live Azure board columns)", () => {
  const storiesBoard: BoardFact = {
    id: "board-stories",
    name: "Stories",
    columns: [
      {
        id: "col-new",
        name: "New",
        columnType: "incoming",
        itemLimit: null,
        stateMappings: { "User Story": "New", Bug: "New" },
      },
      {
        id: "col-dev",
        name: "Development",
        columnType: "inProgress",
        itemLimit: 1,
        stateMappings: { "User Story": "Active", Bug: "Active" },
      },
      {
        id: "col-qa",
        name: "Ready for QA",
        columnType: "inProgress",
        itemLimit: null,
        stateMappings: { "User Story": "Resolved", Bug: "Resolved" },
      },
      {
        id: "col-closed",
        name: "Closed",
        columnType: "outgoing",
        itemLimit: null,
        stateMappings: { "User Story": "Closed", Bug: "Closed" },
      },
    ],
  };
  const now = "2026-08-25T00:00:00.000Z";

  it("returns one stage per Azure column, in Azure order, with Azure's names", () => {
    const stages = computeFunnel([fact()], [storiesBoard], now);
    expect(stages.map((s) => [s.id, s.label])).toEqual([
      ["col-new", "New"],
      ["col-dev", "Development"],
      ["col-qa", "Ready for QA"],
      ["col-closed", "Closed"],
    ]);
  });

  it("places items by their synced board column, then by state mapping", () => {
    const stages = computeFunnel(
      [
        fact({ id: "a", state: "Active", boardColumn: "Ready for QA" }),
        fact({ id: "b", state: "Closed", boardColumn: null }),
        fact({ id: "c", azureType: "Bug", state: "New", boardColumn: null }),
        fact({ id: "d", azureType: "Task", alias: "task", state: "Active" }),
      ],
      [storiesBoard],
      now,
    );
    expect(stages.map((s) => s.count)).toEqual([1, 0, 1, 1]);
  });

  it("flags a column over its Azure WIP limit and never flags the done column", () => {
    const stages = computeFunnel(
      [
        fact({ id: "a", state: "Active", stateChangeDate: now, changedAtSource: now }),
        fact({ id: "b", state: "Active", stateChangeDate: now, changedAtSource: now }),
        fact({ id: "c", state: "Closed", stateChangeDate: "2026-08-01T00:00:00.000Z" }),
      ],
      [storiesBoard],
      now,
    );
    const dev = stages.find((s) => s.id === "col-dev")!;
    expect(dev.itemLimit).toBe(1);
    expect(dev.status).toBe("atRisk");
    expect(stages.find((s) => s.id === "col-closed")!.status).toBe("healthy");
  });

  it("ages items from when they entered the column when known", () => {
    const stages = computeFunnel(
      [
        fact({
          state: "Active",
          boardColumn: "Development",
          boardColumnEnteredAt: "2026-08-19T00:00:00.000Z",
          stateChangeDate: "2026-08-24T00:00:00.000Z",
        }),
      ],
      [storiesBoard],
      now,
    );
    const dev = stages.find((s) => s.id === "col-dev")!;
    expect(dev.avgDays).toBe(6);
    expect(dev.status).toBe("critical");
  });

  it("shows no funnel and reports why when board metadata is not synchronized", () => {
    expect(computeFunnel([fact()], [], now)).toEqual([]);
    const result = buildOverview({
      facts: [fact()],
      members: [],
      calendar: sprintCalendar("2026-08-16", "2026-08-29", "2026-08-25"),
      history: [],
      lastSyncedAt: "2026-08-25T00:00:00.000Z",
      nowIso: "2026-08-25T00:10:00.000Z",
      iterationId: "ti-1",
    });
    expect(result.snapshot.funnel).toEqual([]);
    expect(result.unavailable["funnel"]).toBe("board_not_synchronized");
  });
});
