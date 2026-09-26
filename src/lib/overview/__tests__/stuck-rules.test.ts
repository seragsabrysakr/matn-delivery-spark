import { describe, expect, it } from "vitest";
import {
  assessStuck,
  defaultStuckSettings,
  workingDaysSince,
  type StuckCandidate,
} from "../stuck-rules";
import {
  buildOverview,
  computeFunnel,
  computeStuckItems,
  type BoardFact,
  type RealWorkItemFact,
} from "../overview-rules";
import { sprintCalendar } from "@/lib/calendar/cairo";

const settings = defaultStuckSettings();

// 2026-09-24 is a Thursday; 2026-09-27 is the following Sunday (Cairo).
const THU = "2026-09-24T08:00:00.000Z";

const candidate = (over: Partial<StuckCandidate> = {}): StuckCandidate => ({
  stateCategory: "inProgress",
  isBlocked: false,
  tags: [],
  columnKind: "inProgress",
  boardColumnEnteredAt: null,
  stateChangeDate: null,
  ...over,
});

describe("workingDaysSince (Sun–Thu, Africa/Cairo)", () => {
  it("does not count the entry day, counts today, skips Friday and Saturday", () => {
    expect(workingDaysSince(THU, "2026-09-24T20:00:00.000Z", settings)).toBe(0);
    expect(workingDaysSince(THU, "2026-09-26T10:00:00.000Z", settings)).toBe(0); // Fri, Sat
    expect(workingDaysSince(THU, "2026-09-27T10:00:00.000Z", settings)).toBe(1); // Sun
    expect(workingDaysSince(THU, "2026-09-30T10:00:00.000Z", settings)).toBe(4); // Sun–Wed
  });

  it("uses the Cairo calendar date, not UTC", () => {
    // 23:30 UTC on Thursday is already Friday 02:30 in Cairo.
    expect(workingDaysSince("2026-09-24T23:30:00.000Z", "2026-09-27T10:00:00.000Z", settings)).toBe(
      1,
    );
  });

  it("returns null for a missing or unusable instant", () => {
    expect(workingDaysSince(null, THU, settings)).toBeNull();
    expect(workingDaysSince("not a date", THU, settings)).toBeNull();
  });
});

describe("assessStuck", () => {
  const now = "2026-09-30T10:00:00.000Z"; // 4 working days after THU

  it("flags items over the threshold in an in-progress column", () => {
    const result = assessStuck(candidate({ boardColumnEnteredAt: THU }), now, settings);
    expect(result).toEqual({
      stuck: true,
      reasons: ["aged_in_column"],
      workingDaysInColumn: 4,
      ageBasis: "column_entry",
    });
  });

  it("does not flag at exactly the threshold", () => {
    const result = assessStuck(
      candidate({ boardColumnEnteredAt: THU }),
      "2026-09-29T10:00:00.000Z",
      settings,
    );
    expect(result.workingDaysInColumn).toBe(3);
    expect(result.stuck).toBe(false);
  });

  it("never ages work waiting in New or sitting in the done column", () => {
    expect(
      assessStuck(candidate({ columnKind: "incoming", boardColumnEnteredAt: THU }), now, settings)
        .stuck,
    ).toBe(false);
    expect(
      assessStuck(candidate({ columnKind: "outgoing", boardColumnEnteredAt: THU }), now, settings)
        .stuck,
    ).toBe(false);
  });

  it("off the board, ages only in-progress or resolved states, from the state change", () => {
    const result = assessStuck(
      candidate({ columnKind: null, stateCategory: "resolved", stateChangeDate: THU }),
      now,
      settings,
    );
    expect(result.reasons).toEqual(["aged_in_column"]);
    expect(result.ageBasis).toBe("state_change");
    expect(
      assessStuck(
        candidate({ columnKind: null, stateCategory: "proposed", stateChangeDate: THU }),
        now,
        settings,
      ).stuck,
    ).toBe(false);
  });

  it("flags blocked items from the Azure field or tag at any age or column", () => {
    const result = assessStuck(
      candidate({ columnKind: "incoming", isBlocked: true, tags: ["UI", " blocked "] }),
      now,
      settings,
    );
    expect(result.reasons).toEqual(["blocked_field", "blocked_tag"]);
    expect(result.workingDaysInColumn).toBeNull();
  });

  it("never flags closed work and reports unknown age as null, not zero", () => {
    expect(
      assessStuck(candidate({ stateCategory: "completed", isBlocked: true }), now, settings),
    ).toEqual({ stuck: false, reasons: [], workingDaysInColumn: null, ageBasis: null });
    const unknownAge = assessStuck(candidate(), now, settings);
    expect(unknownAge.workingDaysInColumn).toBeNull();
    expect(unknownAge.stuck).toBe(false);
  });

  it("honours the team's own working week and threshold", () => {
    const friSat = defaultStuckSettings({
      workingWeekdays: [1, 2, 3, 4, 5],
      thresholdWorkingDays: 1,
    });
    // Thu -> Sun: only Friday is a working day in a Mon–Fri week.
    const result = assessStuck(
      candidate({ boardColumnEnteredAt: THU }),
      "2026-09-27T10:00:00.000Z",
      friSat,
    );
    expect(result.workingDaysInColumn).toBe(1);
    expect(result.stuck).toBe(false);
  });
});

describe("stuck work in the Overview", () => {
  const board: BoardFact = {
    id: "b",
    name: "Stories",
    columns: [
      {
        id: "c-new",
        name: "New",
        columnType: "incoming",
        itemLimit: null,
        stateMappings: { "User Story": "New" },
      },
      {
        id: "c-dev",
        name: "Development",
        columnType: "inProgress",
        itemLimit: null,
        stateMappings: { "User Story": "Active" },
      },
      {
        id: "c-done",
        name: "Closed",
        columnType: "outgoing",
        itemLimit: null,
        stateMappings: { "User Story": "Closed" },
      },
    ],
  };
  const now = "2026-09-30T10:00:00.000Z";
  const fact = (over: Partial<RealWorkItemFact>): RealWorkItemFact => ({
    id: "x",
    azureWorkItemId: 1,
    title: "Item",
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
    changedAtSource: THU,
    azureUrl: "https://dev.azure.com/o/p/_workitems/edit/1",
    boardColumn: null,
    boardColumnEnteredAt: null,
    tags: [],
    parentAzureWorkItemId: null,
    ...over,
  });

  const facts = [
    fact({
      id: "aged",
      azureWorkItemId: 10,
      boardColumn: "Development",
      boardColumnEnteredAt: THU,
    }),
    fact({
      id: "fresh",
      azureWorkItemId: 11,
      boardColumn: "Development",
      boardColumnEnteredAt: now,
    }),
    fact({
      id: "waiting",
      azureWorkItemId: 12,
      state: "New",
      stateCategory: "proposed",
      boardColumnEnteredAt: THU,
    }),
    fact({
      id: "tagged",
      azureWorkItemId: 13,
      state: "New",
      stateCategory: "proposed",
      tags: ["Blocked"],
    }),
  ];

  it("lists stuck items oldest first, with Azure's board deciding the column kind", () => {
    const stuck = computeStuckItems(facts, [board], now);
    expect(stuck.map((s) => s.fact.id)).toEqual(["aged", "tagged"]);
  });

  it("counts stuck items per funnel column", () => {
    const stages = computeFunnel(facts, [board], now);
    expect(stages.map((s) => [s.label, s.count, s.stuckCount])).toEqual([
      ["New", 2, 1],
      ["Development", 2, 1],
      ["Closed", 0, 0],
    ]);
  });

  it("raises one stuck-work risk that does not repeat critical blockers", () => {
    const result = buildOverview({
      facts: [
        ...facts,
        fact({
          id: "blocked",
          azureWorkItemId: 14,
          isBlocked: true,
          blockedSince: "2026-09-20T00:00:00.000Z",
        }),
      ],
      members: [],
      calendar: sprintCalendar("2026-09-20", "2026-10-01", "2026-09-30"),
      history: [],
      boards: [board],
      lastSyncedAt: now,
      nowIso: now,
      iterationId: "ti",
    });
    const stuckRisk = result.snapshot.risks.find((r) => r.id === "risk-stuck")!;
    expect(stuckRisk.items.map((i) => i.id)).toEqual(["10", "13"]);
    expect(stuckRisk.ageDays).toBe(4);
    expect(
      result.snapshot.risks.find((r) => r.id === "risk-blocked")?.items.map((i) => i.id),
    ).toEqual(["14"]);
  });

  it("reports a Story once, not again through its stuck Tasks", () => {
    const story = fact({
      id: "story",
      azureWorkItemId: 20,
      boardColumn: "Development",
      boardColumnEnteredAt: THU,
    });
    const taskUnderStuckStory = fact({
      id: "t1",
      azureWorkItemId: 21,
      alias: "task",
      azureType: "Task",
      countsTowardScope: false,
      tags: ["Blocked"],
      parentAzureWorkItemId: 20,
    });
    const healthyStory = fact({
      id: "ok",
      azureWorkItemId: 30,
      boardColumn: "Development",
      boardColumnEnteredAt: now,
    });
    const taskUnderHealthyStory = fact({
      id: "t2",
      azureWorkItemId: 31,
      alias: "task",
      azureType: "Task",
      countsTowardScope: false,
      tags: ["blocked"],
      parentAzureWorkItemId: 30,
    });
    const stuck = computeStuckItems(
      [story, taskUnderStuckStory, healthyStory, taskUnderHealthyStory],
      [board],
      now,
    );
    expect(stuck.map((s) => s.fact.id)).toEqual(["story", "t2"]);
  });
});
