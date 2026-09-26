import { describe, expect, it } from "vitest";
import {
  deriveColumnEntry,
  deriveScopeChanges,
  deriveTransitions,
  isCompleteHistory,
  normalizeRevisions,
  type RevisionRecord,
} from "../revision-rules";

const rev = (n: number, over: Partial<RevisionRecord> = {}): RevisionRecord => ({
  rev: n,
  revisedAt: `2026-09-0${n}T09:00:00.000Z`,
  revisedByMemberId: "m-changer",
  state: "New",
  stateCategory: "proposed",
  iterationPath: "Hoteliana",
  areaPath: "Hoteliana\\Supplier Dashboard",
  estimate: 3,
  assignedToMemberId: "m-owner",
  boardColumn: "New",
  ...over,
});

describe("normalizeRevisions / isCompleteHistory", () => {
  it("orders by rev, drops invalid revs and keeps the later duplicate", () => {
    const sorted = normalizeRevisions([rev(2), rev(1), rev(0), rev(2, { state: "Active" })]);
    expect(sorted.map((r) => [r.rev, r.state])).toEqual([
      [1, "New"],
      [2, "Active"],
    ]);
  });

  it("requires rev 1 through the latest rev with no gaps", () => {
    expect(isCompleteHistory([rev(1), rev(2), rev(3)], 3)).toBe(true);
    expect(isCompleteHistory([rev(2), rev(3)], 3)).toBe(false);
    expect(isCompleteHistory([rev(1), rev(3)], 3)).toBe(false);
    expect(isCompleteHistory([rev(1), rev(2)], 3)).toBe(false);
    expect(isCompleteHistory([], 1)).toBe(false);
  });
});

describe("deriveTransitions", () => {
  const history = [
    rev(1, { revisedByMemberId: "m-po" }),
    rev(2, { estimate: 5 }), // no state change
    rev(3, {
      state: "Active",
      stateCategory: "inProgress",
      revisedByMemberId: "m-dev",
    }),
    rev(5, {
      revisedAt: "2026-09-05T09:00:00.000Z",
      state: "Ready for Test",
      stateCategory: "resolved",
      revisedByMemberId: "m-dev",
    }),
    rev(6, {
      revisedAt: "2026-09-06T21:00:00.000Z",
      state: "Closed",
      stateCategory: "completed",
      revisedByMemberId: "m-qa",
    }),
  ];

  it("records every state change with who moved it and the time spent before", () => {
    const transitions = deriveTransitions(history);
    expect(
      transitions.map((t) => [t.fromState, t.toState, t.changedByMemberId, t.sourceRev]),
    ).toEqual([
      [null, "New", "m-po", 1],
      ["New", "Active", "m-dev", 3],
      ["Active", "Ready for Test", "m-dev", 5],
      ["Ready for Test", "Closed", "m-qa", 6],
    ]);
    expect(transitions.map((t) => t.durationSeconds)).toEqual([
      null,
      2 * 86_400,
      2 * 86_400,
      86_400 + 12 * 3_600,
    ]);
    expect(transitions[3]!.fromStateCategory).toBe("resolved");
    expect(transitions[3]!.toStateCategory).toBe("completed");
  });

  it("from a partial history, never invents the initial state or a first duration", () => {
    const transitions = deriveTransitions(history.slice(2));
    expect(transitions[0]).toMatchObject({ fromState: "Active", toState: "Ready for Test" });
    expect(transitions[0]!.durationSeconds).toBeNull();
    expect(transitions[1]!.durationSeconds).toBe(86_400 + 12 * 3_600);
  });

  it("treats state names case-insensitively", () => {
    expect(deriveTransitions([rev(1), rev(2, { state: "new" })])).toHaveLength(1);
  });
});

describe("deriveScopeChanges", () => {
  const iterations = new Map([
    ["hoteliana\\sprint 1", "it-1"],
    ["hoteliana\\sprint 2", "it-2"],
  ]);

  it("tracks sprint entry, exit, carry-over and re-estimates", () => {
    const changes = deriveScopeChanges(
      [
        rev(1), // created in the backlog root: no sprint
        rev(2, { iterationPath: "Hoteliana\\Sprint 1" }),
        rev(3, { iterationPath: "Hoteliana\\Sprint 1", estimate: 5 }),
        rev(4, { iterationPath: "Hoteliana\\Sprint 2", estimate: 5 }), // carried over
        rev(5, { iterationPath: "Hoteliana", estimate: 5 }), // back to the backlog
      ],
      iterations,
    );
    expect(changes.map((c) => [c.iterationId, c.changeType, c.estimateDelta, c.sourceRev])).toEqual(
      [
        ["it-1", "added", 3, 2],
        ["it-1", "reestimated", 2, 3],
        ["it-1", "removed", -5, 4],
        ["it-2", "added", 5, 4],
        ["it-2", "removed", -5, 5],
      ],
    );
  });

  it("counts creation straight into a sprint as added", () => {
    const changes = deriveScopeChanges(
      [rev(1, { iterationPath: "Hoteliana\\Sprint 2" })],
      iterations,
    );
    expect(changes).toEqual([
      {
        iterationId: "it-2",
        occurredAt: rev(1).revisedAt,
        changeType: "added",
        estimateDelta: 3,
        sourceRev: 1,
      },
    ]);
  });

  it("ignores paths that are not synchronized iterations", () => {
    expect(
      deriveScopeChanges([rev(1), rev(2, { iterationPath: "Hoteliana\\Unknown" })], iterations),
    ).toEqual([]);
  });
});

describe("deriveColumnEntry", () => {
  it("returns when the item entered its latest column, from a complete history", () => {
    const entry = deriveColumnEntry(
      [
        rev(1),
        rev(2, { boardColumn: "Active" }),
        rev(3, { boardColumn: "active" }), // same column, other casing
        rev(4, { boardColumn: "Active", estimate: 8 }),
      ],
      4,
    );
    expect(entry).toEqual({ column: "Active", enteredAt: rev(2).revisedAt });
  });

  it("uses creation time when the item never left its first column", () => {
    expect(deriveColumnEntry([rev(1), rev(2, { estimate: 5 })], 2)).toEqual({
      column: "New",
      enteredAt: rev(1).revisedAt,
    });
  });

  it("returns null for an incomplete history or an item that left the board", () => {
    expect(deriveColumnEntry([rev(2, { boardColumn: "Active" })], 2)).toBeNull();
    expect(deriveColumnEntry([rev(1), rev(2, { boardColumn: null })], 2)).toBeNull();
  });
});

describe("mapRawRevision", () => {
  it("keeps who made the change apart from who owns the item", async () => {
    const { mapRawRevision } = await import("../workitem-map");
    const { resolveProcessMapping } = await import("../process-mapping");
    const members: Record<string, string> = { "dev@matn": "m-dev", "qa@matn": "m-qa" };
    const mapped = mapRawRevision(
      {
        rev: 4,
        fields: {
          "System.Rev": 4,
          "System.ChangedDate": "2026-09-10T08:30:00Z",
          "System.ChangedBy": { uniqueName: "qa@matn" },
          "System.AssignedTo": { uniqueName: "dev@matn" },
          "System.WorkItemType": "Task",
          "System.State": "Active",
          "System.IterationPath": "Hoteliana\\Sprint 2",
          "System.BoardColumn": "In Progress",
          "System.Tags": "Backend; QA",
          "System.Parent": 13116,
          "Microsoft.VSTS.Scheduling.RemainingWork": 4,
        },
      },
      resolveProcessMapping(null, "custom"),
      (ref) => (ref?.uniqueName ? (members[ref.uniqueName] ?? null) : null),
    )!;
    expect(mapped.revisedByMemberId).toBe("m-qa");
    expect(mapped.assignedToMemberId).toBe("m-dev");
    expect(mapped.revisedAt).toBe("2026-09-10T08:30:00.000Z");
    expect(mapped.boardColumn).toBe("In Progress");
    expect(mapped.fields).toMatchObject({ type: "Task", tags: "Backend; QA", parent: 13116 });
    expect(mapped.remainingWork).toBe(4);
  });

  it("drops a revision without a rev or a change time", async () => {
    const { mapRawRevision } = await import("../workitem-map");
    const { resolveProcessMapping } = await import("../process-mapping");
    expect(
      mapRawRevision(
        { fields: { "System.State": "New" } },
        resolveProcessMapping(null),
        () => null,
      ),
    ).toBeNull();
  });
});
