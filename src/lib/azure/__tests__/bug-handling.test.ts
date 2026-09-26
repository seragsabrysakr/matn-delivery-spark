import { describe, expect, it } from "vitest";
import {
  bugHandlingFromAzure,
  effectiveBugHandling,
  resolveProcessMapping,
  type ProcessMappingRow,
} from "../process-mapping";
import { mapAzureWorkItem } from "../workitem-map";

const ctx = {
  projectId: "p",
  teamId: "t",
  iterationId: "i",
  teamIterationId: "ti",
  resolveMember: () => null,
  organizationBaseUrl: "https://dev.azure.com/o",
  azureProjectName: "Hoteliana",
};

const bug = {
  id: 7,
  fields: { "System.WorkItemType": "Bug", "System.State": "Active", "System.Parent": 3 },
};

describe("bug handling from the team's Azure setting", () => {
  it("maps Azure bugsBehavior values, case-insensitively", () => {
    expect(bugHandlingFromAzure("AsTasks")).toBe("as_task");
    expect(bugHandlingFromAzure("asRequirements")).toBe("as_requirement");
    expect(bugHandlingFromAzure("off")).toBe("as_task");
    expect(bugHandlingFromAzure("somethingNew")).toBeNull();
    expect(bugHandlingFromAzure(undefined)).toBeNull();
  });

  it("uses the team's setting unless the tenant configured bug handling explicitly", () => {
    const fromAzure = resolveProcessMapping(null, "custom");
    expect(fromAzure.bugHandlingConfigured).toBe(false);
    expect(effectiveBugHandling(fromAzure, "as_task")).toBe("as_task");
    expect(effectiveBugHandling(fromAzure, null)).toBe("as_requirement");

    const row: ProcessMappingRow = {
      work_item_type_aliases: {},
      state_category_map: {},
      done_states: null,
      active_states: null,
      blocked_fields: null,
      estimate_fields: null,
      severity_field: null,
      bug_handling_mode: "as_requirement",
    };
    const configured = resolveProcessMapping(row, "custom");
    expect(effectiveBugHandling(configured, "as_task")).toBe("as_requirement");
  });

  it("does not count a bug planned as a task as scope, so its story is not double-counted", () => {
    const mapping = resolveProcessMapping(null, "custom");
    const asTask = mapAzureWorkItem(bug, mapping, { ...ctx, bugHandlingMode: "as_task" });
    expect(asTask.payload.counts_toward_scope).toBe(false);
    expect(asTask.payload.is_leaf).toBe(true);
    expect(asTask.payload.parent_azure_work_item_id).toBe(3);

    const asRequirement = mapAzureWorkItem(bug, mapping, {
      ...ctx,
      bugHandlingMode: "as_requirement",
    });
    expect(asRequirement.payload.counts_toward_scope).toBe(true);

    // No team setting: the mapping default keeps today's behaviour.
    expect(mapAzureWorkItem(bug, mapping, ctx).payload.counts_toward_scope).toBe(true);
  });
});
