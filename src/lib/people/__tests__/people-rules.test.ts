import { describe, expect, it } from "vitest";
import {
  buildPeople,
  localDateOf,
  MAX_ACTIVITY_ITEMS,
  previousWorkingDay,
  type RevisionFact,
} from "../people-rules";
import type { RealWorkItemFact } from "@/lib/overview/overview-rules";
import { defaultStuckSettings } from "@/lib/overview/stuck-rules";

// Sunday 2026-09-27, 12:00 Cairo (UTC+3). Previous working day: Thursday 2026-09-24.
const NOW = "2026-09-27T09:00:00Z";
const settings = defaultStuckSettings();

const fact = (id: number, over: Partial<RealWorkItemFact> = {}): RealWorkItemFact => ({
  id: `w-${id}`,
  azureWorkItemId: id,
  title: `Item ${id}`,
  alias: "task",
  azureType: "Task",
  state: "Active",
  stateCategory: "inProgress",
  isBlocked: false,
  blockedSince: null,
  estimate: null,
  assignedToMemberId: "m1",
  countsTowardScope: false,
  stateChangeDate: "2026-09-24T08:00:00Z",
  changedAtSource: "2026-09-24T08:00:00Z",
  azureUrl: null,
  boardColumn: null,
  boardColumnEnteredAt: null,
  tags: [],
  parentAzureWorkItemId: null,
  ...over,
});

const rev = (memberId: string, azureId: number, revisedAt: string): RevisionFact => ({
  memberId,
  azureId,
  title: `Item ${azureId}`,
  azureUrl: null,
  revisedAt,
});

const members = [
  { id: "m1", displayName: "Ahmed" },
  { id: "m2", displayName: "Sara" },
];

describe("calendar helpers", () => {
  it("reads the local date in the team's time zone", () => {
    expect(localDateOf("2026-09-24T22:30:00Z", "Africa/Cairo")).toBe("2026-09-25");
    expect(localDateOf("bad", "Africa/Cairo")).toBeNull();
  });

  it("skips the weekend to the previous working day", () => {
    expect(previousWorkingDay("2026-09-27", [0, 1, 2, 3, 4])).toBe("2026-09-24");
    expect(previousWorkingDay("2026-09-29", [0, 1, 2, 3, 4])).toBe("2026-09-28");
    expect(previousWorkingDay("2026-09-29", [])).toBeNull();
  });
});

describe("buildPeople", () => {
  it("counts each person's work by state category and lists stuck items", () => {
    const view = buildPeople({
      members,
      facts: [
        fact(1, { stateCategory: "completed" }),
        fact(2),
        fact(3, { stateCategory: "proposed" }),
        fact(4, { isBlocked: true }),
        fact(5, { stateCategory: "removed" }),
        fact(6, { assignedToMemberId: null, stateCategory: "proposed" }),
        fact(7, { assignedToMemberId: "m2", stateCategory: "unknown" }),
      ],
      boards: [],
      revisions: [rev("m1", 2, "2026-09-24T09:00:00Z"), rev("m2", 7, "2026-09-27T08:00:00Z")],
      transitions: [],
      nowIso: NOW,
      settings,
    });
    const ahmed = view.people.find((p) => p.memberId === "m1")!;
    expect(ahmed).toMatchObject({ total: 4, done: 1, inProgress: 2, notStarted: 1 });
    expect(ahmed.stuck.map((s) => s.azureId)).toEqual([4]);
    const sara = view.people.find((p) => p.memberId === "m2")!;
    expect(sara).toMatchObject({ total: 1, unknownState: 1, inProgress: 0 });
    expect(view.unassignedOpen).toBe(1);
    expect(view.previousWorkingDay).toBe("2026-09-24");
  });

  it("lists what each person changed on the previous working day, moves first", () => {
    const view = buildPeople({
      members,
      facts: [fact(1)],
      boards: [],
      revisions: [
        rev("m1", 10, "2026-09-24T07:00:00Z"),
        rev("m1", 11, "2026-09-24T08:00:00Z"),
        rev("m1", 11, "2026-09-24T10:00:00Z"),
        rev("m1", 12, "2026-09-24T12:00:00Z"),
        // Wednesday and today are not "yesterday".
        rev("m1", 13, "2026-09-23T10:00:00Z"),
        rev("m1", 14, "2026-09-27T06:00:00Z"),
        // A change by someone else on the item is not Ahmed's.
        rev("m2", 10, "2026-09-24T09:00:00Z"),
      ],
      transitions: [
        {
          memberId: "m1",
          azureId: 12,
          occurredAt: "2026-09-24T12:00:00Z",
          fromState: "New",
          toState: "Active",
        },
        {
          memberId: "m1",
          azureId: 13,
          occurredAt: "2026-09-23T10:00:00Z",
          fromState: "Active",
          toState: "Closed",
        },
      ],
      nowIso: NOW,
      settings,
    });
    const ahmed = view.people.find((p) => p.memberId === "m1")!;
    expect(ahmed.yesterday.map((a) => a.azureId)).toEqual([12, 11, 10]);
    expect(ahmed.yesterday[0]!.moves).toEqual([{ from: "New", to: "Active" }]);
    expect(ahmed.yesterday[1]!.changes).toBe(2);
    expect(ahmed.lastActivityAt).toBe("2026-09-27T06:00:00Z");
    expect(ahmed.noUpdate).toBe(false);
  });

  it("alerts when someone holds work in progress and changed nothing for 2 working days", () => {
    const view = buildPeople({
      members,
      facts: [fact(1), fact(2, { assignedToMemberId: "m2", stateCategory: "proposed" })],
      boards: [],
      // Ahmed last changed something on Tuesday: Wed, Thu, Sun = 3 working days.
      revisions: [rev("m1", 1, "2026-09-22T10:00:00Z")],
      transitions: [],
      nowIso: NOW,
      settings,
    });
    const ahmed = view.people.find((p) => p.memberId === "m1")!;
    expect(ahmed).toMatchObject({ idleWorkingDays: 3, noUpdate: true });
    // Sara has no activity, but nothing in progress either: no alert.
    const sara = view.people.find((p) => p.memberId === "m2")!;
    expect(sara).toMatchObject({ idleWorkingDays: null, noUpdate: false });
    expect(view.people[0]!.memberId).toBe("m1");
  });

  it("alerts when no change is found at all while work is in progress", () => {
    const view = buildPeople({
      members: [members[0]!],
      facts: [fact(1)],
      boards: [],
      revisions: [],
      transitions: [],
      nowIso: NOW,
      settings,
    });
    expect(view.people[0]).toMatchObject({ lastActivityAt: null, noUpdate: true });
  });

  it("caps the activity list and says so", () => {
    const revisions = Array.from({ length: MAX_ACTIVITY_ITEMS + 3 }, (_, i) =>
      rev("m1", 100 + i, "2026-09-24T10:00:00Z"),
    );
    const view = buildPeople({
      members: [members[0]!],
      facts: [],
      boards: [],
      revisions,
      transitions: [],
      nowIso: NOW,
      settings,
    });
    expect(view.people[0]!.yesterday).toHaveLength(MAX_ACTIVITY_ITEMS);
    expect(view.people[0]!.yesterdayTruncated).toBe(true);
  });
});
