import { describe, expect, it } from "vitest";
import { buildHierarchy, filterRows, type HierarchyInput } from "../hierarchy-rules";

const node = (
  azureId: number,
  parentAzureId: number | null,
  type: string,
  over: Partial<HierarchyInput> = {},
): HierarchyInput => {
  const level =
    type === "Epic" || type === "Feature"
      ? "portfolio"
      : type === "User Story"
        ? "requirement"
        : type === "Task"
          ? "task"
          : type === "Bug"
            ? "bug"
            : null;
  return {
    azureId,
    parentAzureId,
    type,
    title: `${type} ${azureId}`,
    state: "New",
    stateCategory: "proposed",
    countsTowardScope: level === "requirement",
    estimate: level === "requirement" ? 3 : null,
    iterationPath: null,
    closedDate: null,
    teamId: null,
    backlogLevel: level,
    assignee: "Sara",
    remainingWork: null,
    boardColumn: null,
    isBlocked: false,
    tags: [],
    azureUrl: null,
    changedAt: null,
    ...over,
  };
};

const items: HierarchyInput[] = [
  node(1, null, "Epic"),
  node(10, 1, "Feature"),
  node(100, 10, "User Story", { stateCategory: "completed", estimate: 5 }),
  node(101, 10, "User Story", { estimate: 3, isBlocked: true }),
  node(1000, 100, "Task", { stateCategory: "completed" }),
  node(1001, 101, "Task", { remainingWork: 4, assignee: null }),
  node(1002, 101, "Bug"),
  node(5000, 1001, "Test Case"), // not on any backlog
  node(200, 99, "User Story"), // parent not synchronized
  node(300, null, "Task"), // task with no parent
];

describe("buildHierarchy", () => {
  const { rows, stats } = buildHierarchy(items);
  const row = (id: number) => rows.find((r) => r.azureId === id)!;

  it("orders rows depth-first, containers before their children", () => {
    expect(rows.map((r) => [r.azureId, r.depth])).toEqual([
      [1, 0],
      [10, 1],
      [100, 2],
      [1000, 3],
      [101, 2],
      [1002, 3],
      [1001, 3],
      [5000, 4],
      [200, 0],
      [300, 0],
    ]);
    expect(row(10).childIds).toEqual([100, 101]);
  });

  it("rolls up leaf scope only — containers and tasks never count", () => {
    expect(row(1).rollup).toMatchObject({
      descendants: 7,
      scopeItems: 2,
      completedScope: 1,
      progressPercent: 62.5,
      progressBasis: "points",
      remainingPoints: 3,
      tasks: 2,
      tasksDone: 1,
      bugs: 1,
      openBugs: 1,
      blocked: 1,
      unassignedOpen: 1,
      remainingHours: 4,
    });
  });

  it("keeps orphans as flagged roots", () => {
    expect(row(200)).toMatchObject({ depth: 0, parentMissing: true, effectiveParentId: null });
  });

  it("reports data quality from the tree", () => {
    expect(stats.quality).toEqual({
      requirementsWithoutParent: 0,
      tasksWithoutParent: 1,
      bugsWithoutParent: 0,
      parentMissing: 1,
      unestimatedRequirements: 0,
      tasksWithoutHours: 1, // 300 (1001 has hours; 1000 is done)
    });
    expect(stats.byType.map((t) => t.type)).toEqual([
      "Epic",
      "Feature",
      "User Story",
      "Bug",
      "Task",
      "Test Case",
    ]);
  });

  it("survives a parent cycle", () => {
    const cyc = buildHierarchy([node(1, 2, "Feature"), node(2, 1, "Feature")]);
    expect(cyc.rows.map((r) => r.azureId).sort()).toEqual([1, 2]);
  });
});

describe("filterRows", () => {
  it("keeps matches with their ancestors, in tree order", () => {
    const { rows } = buildHierarchy(items);
    expect(filterRows(rows, (r) => r.azureId === 1002).map((r) => r.azureId)).toEqual([
      1, 10, 101, 1002,
    ]);
  });
});
