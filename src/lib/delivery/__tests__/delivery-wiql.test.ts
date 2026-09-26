import { describe, expect, it } from "vitest";
import {
  buildDescendantsWiql,
  buildRootsWiql,
  idsFromLinks,
  normalizeMappingValue,
  rootsFromResult,
  topLevelOnly,
} from "../delivery-wiql";

describe("buildRootsWiql", () => {
  it("builds a project-scoped query per mapping mode, escaping values", () => {
    expect(
      buildRootsWiql({ mode: "work_item_type", value: "Feature", projectName: "Hoteliana" }),
    ).toBe(
      "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'Hoteliana' AND [System.WorkItemType] = 'Feature' ORDER BY [System.Id]",
    );
    expect(buildRootsWiql({ mode: "tag", value: "Client's", projectName: "P" })).toContain(
      "[System.Tags] CONTAINS 'Client''s'",
    );
    expect(buildRootsWiql({ mode: "area_path", value: "P\\Web", projectName: "P" })).toContain(
      "[System.AreaPath] UNDER 'P\\Web'",
    );
  });
});

describe("buildDescendantsWiql", () => {
  it("queries the recursive hierarchy under the roots", () => {
    const wiql = buildDescendantsWiql([10, 11]);
    expect(wiql).toContain("FROM WorkItemLinks");
    expect(wiql).toContain("[Source].[System.Id] IN (10, 11)");
    expect(wiql).toContain("System.LinkTypes.Hierarchy-Forward");
    expect(wiql).toContain("MODE (Recursive)");
  });

  it("refuses an empty root list", () => {
    expect(() => buildDescendantsWiql([])).toThrow();
  });
});

describe("result parsing", () => {
  it("reads roots from flat and tree results", () => {
    expect(rootsFromResult({ workItems: [{ id: 3 }, { id: 1 }, { id: 3 }] })).toEqual([1, 3]);
    expect(
      rootsFromResult({
        workItemRelations: [
          { target: { id: 10 } },
          { rel: "System.LinkTypes.Hierarchy-Forward", source: { id: 10 }, target: { id: 100 } },
        ],
      }),
    ).toEqual([10]);
  });

  it("collects every id from a link result", () => {
    expect(
      idsFromLinks({
        workItemRelations: [
          { target: { id: 10 } },
          { source: { id: 10 }, target: { id: 100 } },
          { source: { id: 100 }, target: { id: 1000 } },
        ],
      }),
    ).toEqual([10, 100, 1000]);
  });

  it("keeps only top-level items for an area mapping", () => {
    const parents = new Map<number, number | null>([
      [1, null],
      [2, 1],
      [3, 99],
    ]);
    expect(topLevelOnly([1, 2, 3], parents)).toEqual([1, 3]);
  });
});

describe("normalizeMappingValue", () => {
  it("extracts a saved query id from a pasted link", () => {
    expect(
      normalizeMappingValue(
        "saved_query",
        "https://dev.azure.com/o/P/_queries/query/1B4E28BA-2FA1-11D2-883F-0016D3CCA427/",
      ),
    ).toBe("1b4e28ba-2fa1-11d2-883f-0016d3cca427");
  });

  it("rejects empty values and bad query ids", () => {
    expect(() => normalizeMappingValue("tag", "  ")).toThrow();
    expect(() => normalizeMappingValue("saved_query", "not-a-guid")).toThrow();
  });
});
