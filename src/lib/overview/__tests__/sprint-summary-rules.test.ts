import { describe, expect, it } from "vitest";
import { summarizeSprint } from "../sprint-summary-rules";
import type { RealWorkItemFact } from "../overview-rules";

const WEEK = [0, 1, 2, 3, 4];

const fact = (id: number, over: Partial<RealWorkItemFact> = {}): RealWorkItemFact => ({
  id: `w-${id}`,
  azureWorkItemId: id,
  title: `Item ${id}`,
  alias: "story",
  azureType: "User Story",
  state: "New",
  stateCategory: "proposed",
  isBlocked: false,
  blockedSince: null,
  estimate: 3,
  assignedToMemberId: null,
  countsTowardScope: true,
  stateChangeDate: null,
  changedAtSource: "2026-09-10T08:00:00Z",
  azureUrl: null,
  boardColumn: null,
  boardColumnEnteredAt: null,
  tags: [],
  parentAzureWorkItemId: null,
  ...over,
});

const task = (id: number, parent: number, stateCategory: RealWorkItemFact["stateCategory"]) =>
  fact(id, {
    alias: "task",
    azureType: "Task",
    countsTowardScope: false,
    estimate: null,
    parentAzureWorkItemId: parent,
    stateCategory,
  });

describe("summarizeSprint", () => {
  // Hoteliana Sprint 2 shape: stories left in New while their tasks close.
  const facts = [
    fact(1),
    fact(2),
    fact(3, { stateCategory: "completed" }),
    task(10, 1, "completed"),
    task(11, 1, "completed"),
    task(12, 1, "proposed"),
    task(13, 2, "inProgress"),
    task(14, 2, "proposed"),
    task(15, 99, "removed"),
  ];

  it("reports an ended sprint with working days since the end", () => {
    const s = summarizeSprint({
      facts,
      startDate: "2026-09-06",
      finishDate: "2026-09-17",
      today: "2026-09-27",
      workingWeekdays: WEEK,
    });
    expect(s.phase).toBe("ended");
    // Sun 20 – Thu 24 and Sun 27.
    expect(s.workingDaysSinceEnd).toBe(6);
    expect(s.workingDaysLeft).toBeNull();
    expect(s.expectedPercent).toBe(100);
  });

  it("keeps stories and tasks apart and uses the scope KPI rule", () => {
    const s = summarizeSprint({
      facts,
      startDate: "2026-09-06",
      finishDate: "2026-09-17",
      today: "2026-09-27",
      workingWeekdays: WEEK,
    });
    expect(s.stories).toMatchObject({
      total: 3,
      done: 1,
      notStarted: 2,
      points: 9,
      pointsDone: 3,
      percent: 33.3,
      basis: "estimate",
    });
    // The removed task is not counted.
    expect(s.tasks).toMatchObject({ total: 5, done: 2, inProgress: 1, notStarted: 2, percent: 40 });
  });

  it("lists stories still New whose tasks moved", () => {
    const s = summarizeSprint({
      facts,
      startDate: "2026-09-06",
      finishDate: "2026-09-17",
      today: "2026-09-27",
      workingWeekdays: WEEK,
    });
    expect(s.storiesBehindTasks).toEqual([
      { azureId: 1, title: "Item 1", azureUrl: null, tasksDone: 2, tasks: 3 },
      { azureId: 2, title: "Item 2", azureUrl: null, tasksDone: 0, tasks: 2 },
    ]);
  });

  it("counts working days left in a running sprint, today included", () => {
    const s = summarizeSprint({
      facts: [],
      startDate: "2026-09-20",
      finishDate: "2026-10-01",
      today: "2026-09-27",
      workingWeekdays: WEEK,
    });
    expect(s.phase).toBe("running");
    // Sun 27 – Thu 1.
    expect(s.workingDaysLeft).toBe(5);
    expect(s.stories.percent).toBeNull();
    expect(s.stories.basis).toBeNull();
    expect(s.tasks.percent).toBeNull();
  });

  it("marks undated and future sprints without inventing dates", () => {
    expect(
      summarizeSprint({
        facts: [],
        startDate: null,
        finishDate: null,
        today: "2026-09-27",
        workingWeekdays: WEEK,
      }),
    ).toMatchObject({ phase: "undated", expectedPercent: null, startDate: null });
    expect(
      summarizeSprint({
        facts: [],
        startDate: "2026-10-04",
        finishDate: "2026-10-15",
        today: "2026-09-27",
        workingWeekdays: WEEK,
      }),
    ).toMatchObject({ phase: "notStarted", expectedPercent: 0 });
  });

  it("reports unestimated scope as unknown points, not zero", () => {
    const s = summarizeSprint({
      facts: [fact(1, { estimate: null }), fact(2, { estimate: null })],
      startDate: "2026-09-06",
      finishDate: "2026-09-17",
      today: "2026-09-27",
      workingWeekdays: WEEK,
    });
    expect(s.stories).toMatchObject({ points: null, pointsDone: null, basis: "count", percent: 0 });
  });
});
