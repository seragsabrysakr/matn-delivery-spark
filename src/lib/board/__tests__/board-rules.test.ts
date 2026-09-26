import { describe, expect, it } from "vitest";
import { buildSprintBoard } from "../board-rules";
import type { BoardFact, RealWorkItemFact } from "@/lib/overview/overview-rules";
import { defaultStuckSettings } from "@/lib/overview/stuck-rules";

// Thursday 2026-09-24, Cairo.
const NOW = "2026-09-24T10:00:00Z";

const fact = (id: number, over: Partial<RealWorkItemFact> = {}): RealWorkItemFact => ({
  id: `w-${id}`,
  azureWorkItemId: id,
  title: `Item ${id}`,
  alias: "story",
  azureType: "User Story",
  state: "Active",
  stateCategory: "inProgress",
  isBlocked: false,
  blockedSince: null,
  estimate: 3,
  assignedToMemberId: "m1",
  countsTowardScope: true,
  stateChangeDate: null,
  changedAtSource: NOW,
  azureUrl: null,
  boardColumn: "Dev",
  boardColumnEnteredAt: "2026-09-23T08:00:00Z",
  tags: [],
  parentAzureWorkItemId: null,
  ...over,
});

const boards: BoardFact[] = [
  {
    id: "b1",
    name: "Stories",
    columns: [
      {
        id: "c1",
        name: "New",
        columnType: "incoming",
        itemLimit: null,
        stateMappings: { "User Story": "New" },
      },
      {
        id: "c2",
        name: "Dev",
        columnType: "inProgress",
        itemLimit: 1,
        stateMappings: { "User Story": "Active" },
      },
      {
        id: "c3",
        name: "Closed",
        columnType: "outgoing",
        itemLimit: null,
        stateMappings: { "User Story": "Closed" },
      },
    ],
  },
];

const board = (facts: RealWorkItemFact[]) =>
  buildSprintBoard({
    facts,
    boards,
    memberNames: new Map([["m1", "Sara"]]),
    nowIso: NOW,
    settings: defaultStuckSettings(),
  });

describe("buildSprintBoard", () => {
  const view = board([
    fact(1),
    // Sunday 2026-09-13 entry: 9 working days in Dev (14–17, 20–24) → stuck.
    fact(2, { boardColumnEnteredAt: "2026-09-13T08:00:00Z", estimate: 5 }),
    fact(3, { boardColumn: "New", state: "New", stateCategory: "proposed" }),
    fact(10, {
      alias: "task",
      azureType: "Task",
      countsTowardScope: false,
      boardColumn: null,
      parentAzureWorkItemId: 1,
      stateCategory: "completed",
    }),
    fact(11, {
      alias: "task",
      azureType: "Task",
      countsTowardScope: false,
      boardColumn: null,
      parentAzureWorkItemId: 1,
      assignedToMemberId: null,
    }),
    fact(12, {
      alias: "bug",
      azureType: "Bug",
      countsTowardScope: false,
      boardColumn: null,
      parentAzureWorkItemId: 1,
    }),
    fact(4, { boardColumn: null, state: "Weird", stateCategory: "proposed" }), // scope, not on the board
  ]);

  it("uses the team's columns in Azure order with WIP limits", () => {
    expect(view.boardName).toBe("Stories");
    expect(view.columns.map((c) => [c.name, c.cards.length, c.overLimit])).toEqual([
      ["New", 1, false],
      ["Dev", 2, true],
      ["Closed", 0, false],
    ]);
  });

  it("puts stuck and older cards first, with age and reasons", () => {
    const dev = view.columns[1]!;
    expect(dev.cards.map((c) => c.azureId)).toEqual([2, 1]);
    expect(dev.cards[0]).toMatchObject({
      stuck: true,
      stuckReasons: ["aged_in_column"],
      daysInColumn: 9,
    });
    expect(dev.points).toBe(8);
  });

  it("rolls up children on each card", () => {
    const card = view.columns[1]!.cards.find((c) => c.azureId === 1)!;
    expect(card).toMatchObject({
      tasks: 2,
      tasksDone: 1,
      unassignedChildren: 1,
      openBugs: 1,
      assignee: "Sara",
    });
  });

  it("lists scope items the board cannot place", () => {
    expect(view.offBoard.map((c) => c.azureId)).toEqual([4]);
    expect(view.totals).toEqual({ cards: 4, stuck: 1, points: 14 });
  });

  it("falls back to a flat list without board metadata", () => {
    const flat = buildSprintBoard({
      facts: [fact(1)],
      boards: [],
      memberNames: new Map(),
      nowIso: NOW,
      settings: defaultStuckSettings(),
    });
    expect(flat.boardName).toBeNull();
    expect(flat.offBoard.map((c) => c.azureId)).toEqual([1]);
  });
});
