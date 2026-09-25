import { describe, expect, it } from "vitest";
import {
  boardColumnEnteredAt,
  boardColumnIndexFor,
  buildAzureStateIndex,
  choosePrimaryBoard,
  isMetadataStale,
  lookupAzureStateCategory,
  mapAzureStateCategory,
  normalizeBoardColumns,
  normalizeTypeStates,
} from "../metadata-rules";

describe("mapAzureStateCategory", () => {
  it("maps every Azure state category, case-insensitively", () => {
    expect(mapAzureStateCategory("Proposed")).toBe("proposed");
    expect(mapAzureStateCategory("InProgress")).toBe("inProgress");
    expect(mapAzureStateCategory("inprogress")).toBe("inProgress");
    expect(mapAzureStateCategory("Resolved")).toBe("resolved");
    expect(mapAzureStateCategory("Completed")).toBe("completed");
    expect(mapAzureStateCategory("Removed")).toBe("removed");
  });

  it("never guesses an unexpected or missing category", () => {
    expect(mapAzureStateCategory("Blocked")).toBe("unknown");
    expect(mapAzureStateCategory("")).toBe("unknown");
    expect(mapAzureStateCategory(undefined)).toBe("unknown");
  });
});

describe("normalizeTypeStates", () => {
  it("keeps Azure order, custom names and colors", () => {
    const states = normalizeTypeStates([
      { name: "New", category: "Proposed", color: "b2b2b2" },
      { name: "Ready for QA", category: "Resolved", color: "ff9d00" },
      { name: "Waiting Client", category: "InProgress" },
      { name: "Closed", category: "Completed" },
    ]);
    expect(states.map((s) => [s.stateName, s.stateCategory, s.sortOrder])).toEqual([
      ["New", "proposed", 0],
      ["Ready for QA", "resolved", 1],
      ["Waiting Client", "inProgress", 2],
      ["Closed", "completed", 3],
    ]);
    expect(states[0]!.color).toBe("b2b2b2");
    expect(states[2]!.color).toBeNull();
  });

  it("keeps the raw Azure category and drops blanks and duplicates", () => {
    const states = normalizeTypeStates([
      { name: " ", category: "Proposed" },
      { name: "Doing", category: "SomethingNew" },
      { name: "doing", category: "InProgress" },
    ]);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      stateName: "Doing",
      azureCategory: "SomethingNew",
      stateCategory: "unknown",
    });
  });
});

describe("normalizeBoardColumns", () => {
  it("preserves Azure column order, WIP limits and state mappings", () => {
    const columns = normalizeBoardColumns([
      {
        id: "c1",
        name: "New",
        columnType: "incoming",
        itemLimit: 0,
        stateMappings: { "User Story": "New", Bug: "New" },
      },
      {
        id: "c2",
        name: "Ready for QA",
        columnType: "inProgress",
        itemLimit: 4,
        isSplit: true,
        stateMappings: { "User Story": "Active" },
      },
      {
        id: "c3",
        name: "Closed",
        columnType: "outgoing",
        stateMappings: { "User Story": "Closed" },
      },
    ]);
    expect(columns.map((c) => [c.name, c.columnOrder, c.columnType, c.itemLimit])).toEqual([
      ["New", 0, "incoming", null],
      ["Ready for QA", 1, "inProgress", 4],
      ["Closed", 2, "outgoing", null],
    ]);
    expect(columns[1]!.isSplit).toBe(true);
    expect(columns[0]!.stateMappings).toEqual({ "User Story": "New", Bug: "New" });
  });

  it("marks an unrecognized column type as unknown and skips malformed columns", () => {
    const columns = normalizeBoardColumns([
      { id: "", name: "Broken" },
      { id: "c1", name: "Custom", columnType: "future" },
    ]);
    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({ columnType: "unknown", columnOrder: 0, stateMappings: {} });
  });
});

describe("Azure state index", () => {
  const index = buildAzureStateIndex([
    { workItemType: "User Story", stateName: "Ready for QA", stateCategory: "resolved" },
    { workItemType: "Bug", stateName: "Ready for QA", stateCategory: "resolved" },
    { workItemType: "User Story", stateName: "Waiting", stateCategory: "inProgress" },
    { workItemType: "Task", stateName: "Waiting", stateCategory: "proposed" },
    { workItemType: "Task", stateName: "Odd", stateCategory: "unknown" },
  ]);

  it("resolves by type and state first", () => {
    expect(lookupAzureStateCategory(index, "Task", "waiting")).toBe("proposed");
    expect(lookupAzureStateCategory(index, "user story", "Waiting")).toBe("inProgress");
  });

  it("falls back to the state alone only when every type agrees", () => {
    expect(lookupAzureStateCategory(index, "Feature", "Ready for QA")).toBe("resolved");
    expect(lookupAzureStateCategory(index, "Feature", "Waiting")).toBeNull();
    expect(lookupAzureStateCategory(index, null, "Ready for QA")).toBe("resolved");
  });

  it("ignores unknown categories and missing metadata", () => {
    expect(lookupAzureStateCategory(index, "Task", "Odd")).toBeNull();
    expect(lookupAzureStateCategory(null, "Task", "Waiting")).toBeNull();
  });
});

describe("board placement", () => {
  const columns = normalizeBoardColumns([
    { id: "a", name: "New", stateMappings: { "User Story": "New", Bug: "New" } },
    { id: "b", name: "Development", stateMappings: { "User Story": "Active", Bug: "Active" } },
    { id: "c", name: "Code Review", stateMappings: { "User Story": "Active", Bug: "Active" } },
    { id: "d", name: "Closed", stateMappings: { "User Story": "Closed", Bug: "Closed" } },
  ]);

  it("uses the synced board column first, even for split states", () => {
    expect(
      boardColumnIndexFor(
        { azureType: "User Story", state: "Active", boardColumn: "Code Review" },
        columns,
      ),
    ).toBe(2);
  });

  it("falls back to the column mapped to the item's state", () => {
    expect(
      boardColumnIndexFor({ azureType: "Bug", state: "Closed", boardColumn: null }, columns),
    ).toBe(3);
    expect(
      boardColumnIndexFor(
        { azureType: "Bug", state: "Active", boardColumn: "Renamed Column" },
        columns,
      ),
    ).toBe(1);
  });

  it("returns null for types that are not on the board or unmapped states", () => {
    expect(
      boardColumnIndexFor({ azureType: "Task", state: "Active", boardColumn: null }, columns),
    ).toBeNull();
    expect(
      boardColumnIndexFor({ azureType: "Bug", state: "Removed", boardColumn: null }, columns),
    ).toBeNull();
  });

  it("picks the board that holds most items, keeping Azure order on ties", () => {
    const stories = { id: "s", name: "Stories", columns };
    const features = {
      id: "f",
      name: "Features",
      columns: normalizeBoardColumns([{ id: "x", name: "New", stateMappings: { Feature: "New" } }]),
    };
    expect(choosePrimaryBoard([features, stories], ["User Story", "Bug", "Feature"])?.id).toBe("s");
    expect(choosePrimaryBoard([features, stories], ["Feature"])?.id).toBe("f");
    expect(choosePrimaryBoard([features, stories], ["Task"])).toBeNull();
    expect(choosePrimaryBoard([], ["Bug"])).toBeNull();
  });
});

describe("boardColumnEnteredAt", () => {
  const changed = "2026-09-20T10:00:00.000Z";

  it("is unknown on first sighting", () => {
    expect(boardColumnEnteredAt(null, { boardColumn: "Doing", changedAtSource: changed })).toBe(
      null,
    );
  });

  it("stamps a column change with the item's change time", () => {
    expect(
      boardColumnEnteredAt(
        { boardColumn: "New", enteredAt: null },
        { boardColumn: "Doing", changedAtSource: changed },
      ),
    ).toBe(changed);
  });

  it("does not treat the first observed column as a move", () => {
    expect(
      boardColumnEnteredAt(
        { boardColumn: null, enteredAt: null },
        { boardColumn: "Doing", changedAtSource: changed },
      ),
    ).toBeNull();
  });

  it("keeps the earlier stamp while the column is unchanged", () => {
    expect(
      boardColumnEnteredAt(
        { boardColumn: "doing", enteredAt: "2026-09-01T00:00:00.000Z" },
        { boardColumn: "Doing", changedAtSource: changed },
      ),
    ).toBe("2026-09-01T00:00:00.000Z");
  });

  it("clears the stamp when the item leaves the board", () => {
    expect(
      boardColumnEnteredAt(
        { boardColumn: "Doing", enteredAt: "2026-09-01T00:00:00.000Z" },
        { boardColumn: null, changedAtSource: changed },
      ),
    ).toBeNull();
  });
});

describe("isMetadataStale", () => {
  const now = Date.parse("2026-09-25T12:00:00.000Z");
  it("treats missing, unparseable and old metadata as stale", () => {
    expect(isMetadataStale(null, now)).toBe(true);
    expect(isMetadataStale("not a date", now)).toBe(true);
    expect(isMetadataStale("2026-09-25T05:00:00.000Z", now)).toBe(true);
  });
  it("keeps recent metadata", () => {
    expect(isMetadataStale("2026-09-25T11:00:00.000Z", now)).toBe(false);
  });
});
