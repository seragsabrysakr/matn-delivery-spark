import { describe, expect, it } from "vitest";
import { buildAzureStateIndex } from "../metadata-rules";
import {
  resolveProcessMapping,
  resolveStateCategory,
  stateCategoryFor,
  type ProcessMappingRow,
} from "../process-mapping";
import { mapAzureWorkItem } from "../workitem-map";

const row = (over: Partial<ProcessMappingRow> = {}): ProcessMappingRow => ({
  work_item_type_aliases: {},
  state_category_map: {},
  done_states: null,
  active_states: null,
  blocked_fields: null,
  estimate_fields: null,
  severity_field: null,
  bug_handling_mode: "as_requirement",
  ...over,
});

const azure = buildAzureStateIndex([
  { workItemType: "User Story", stateName: "Ready for QA", stateCategory: "resolved" },
  { workItemType: "User Story", stateName: "Waiting Client", stateCategory: "inProgress" },
  { workItemType: "User Story", stateName: "Closed", stateCategory: "completed" },
  // Azure is authoritative even where the English dictionary disagrees.
  { workItemType: "User Story", stateName: "Testing", stateCategory: "inProgress" },
]);

describe("resolveStateCategory precedence", () => {
  it("uses synchronized Azure metadata for custom states", () => {
    const mapping = resolveProcessMapping(row(), "agile", azure);
    expect(resolveStateCategory(mapping, "Ready for QA", "User Story")).toEqual({
      category: "resolved",
      source: "azure",
    });
    expect(stateCategoryFor(mapping, "Waiting Client", "User Story")).toBe("inProgress");
  });

  it("prefers Azure over the built-in dictionary", () => {
    const mapping = resolveProcessMapping(row(), "agile", azure);
    expect(resolveStateCategory(mapping, "Testing", "User Story")).toEqual({
      category: "inProgress",
      source: "azure",
    });
  });

  it("lets explicit tenant configuration override Azure", () => {
    const mapping = resolveProcessMapping(
      row({
        state_category_map: { "Ready for QA": "inProgress" },
        done_states: ["Waiting Client"],
      }),
      "agile",
      azure,
    );
    expect(resolveStateCategory(mapping, "ready for qa", "User Story")).toEqual({
      category: "inProgress",
      source: "tenant",
    });
    expect(resolveStateCategory(mapping, "Waiting Client", "User Story").source).toBe("tenant");
    expect(stateCategoryFor(mapping, "Waiting Client", "User Story")).toBe("completed");
  });

  it("uses the dictionary only as a flagged last resort", () => {
    const mapping = resolveProcessMapping(row(), "agile", null);
    expect(resolveStateCategory(mapping, "Active", "User Story")).toEqual({
      category: "inProgress",
      source: "fallback",
    });
  });

  it("reports a custom state nobody knows as unknown, never guessed", () => {
    const mapping = resolveProcessMapping(row(), "agile", null);
    expect(resolveStateCategory(mapping, "Waiting Client", "User Story")).toEqual({
      category: "unknown",
      source: "none",
    });
  });
});

describe("mapAzureWorkItem with dynamic metadata", () => {
  const ctx = {
    projectId: "p1",
    teamId: "t1",
    iterationId: "i1",
    teamIterationId: "ti1",
    resolveMember: () => null,
    organizationBaseUrl: "https://dev.azure.com/contoso",
    azureProjectName: "Hoteliana",
  };

  it("carries the board column, done flag, lane and category source", () => {
    const mapping = resolveProcessMapping(row(), "agile", azure);
    const mapped = mapAzureWorkItem(
      {
        id: 42,
        fields: {
          "System.WorkItemType": "User Story",
          "System.State": "Ready for QA",
          "System.BoardColumn": "QA",
          "System.BoardColumnDone": true,
          "System.BoardLane": "Expedite",
        },
      },
      mapping,
      ctx,
    );
    expect(mapped.payload.state_category).toBe("resolved");
    expect(mapped.stateCategorySource).toBe("azure");
    expect(mapped.payload.board_column).toBe("QA");
    expect(mapped.payload.board_column_done).toBe(true);
    expect(mapped.payload.board_lane).toBe("Expedite");
  });

  it("leaves board fields null when Azure does not report them", () => {
    const mapped = mapAzureWorkItem(
      { id: 7, fields: { "System.WorkItemType": "Task", "System.State": "Blocked Externally" } },
      resolveProcessMapping(row(), "agile", azure),
      ctx,
    );
    expect(mapped.payload.board_column).toBeNull();
    expect(mapped.payload.board_column_done).toBeNull();
    expect(mapped.payload.board_lane).toBeNull();
    expect(mapped.payload.state_category).toBe("unknown");
    expect(mapped.stateCategorySource).toBe("none");
  });
});
