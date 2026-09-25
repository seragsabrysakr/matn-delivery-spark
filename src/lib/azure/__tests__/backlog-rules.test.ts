import { describe, expect, it } from "vitest";
import {
  buildBacklogWiql,
  classifyPlacement,
  decideBacklogMode,
  FULL_RECONCILE_INTERVAL_MS,
  incrementalSince,
  laterOf,
  normalizeTeamAreas,
  openStatesByType,
  parseBacklogToken,
  resolveOwningTeam,
  serializeBacklogToken,
  WATERMARK_OVERLAP_MS,
  type TeamArea,
} from "../backlog-rules";
import { buildWorkItemsBatchBody } from "../wiql";

const areas: TeamArea[] = [
  { teamId: "t-core", path: "Hoteliana\\Core", includeChildren: true },
  { teamId: "t-mobile", path: "Hoteliana\\Core\\Mobile", includeChildren: true },
  { teamId: "t-root", path: "Hoteliana", includeChildren: false },
];

describe("openStatesByType", () => {
  it("keeps every non-closed state per type, including custom ones", () => {
    const open = openStatesByType([
      { workItemType: "User Story", stateName: "New", stateCategory: "proposed" },
      { workItemType: "User Story", stateName: "Ready for QA", stateCategory: "resolved" },
      { workItemType: "User Story", stateName: "Waiting Client", stateCategory: "inProgress" },
      { workItemType: "User Story", stateName: "Closed", stateCategory: "completed" },
      { workItemType: "User Story", stateName: "Removed", stateCategory: "removed" },
      { workItemType: "Bug", stateName: "Odd", stateCategory: "unknown" },
    ]);
    expect(open["User Story"]).toEqual(["New", "Ready for QA", "Waiting Client"]);
    // Unknown categories count as open so nothing is silently dropped.
    expect(open["Bug"]).toEqual(["Odd"]);
  });

  it("keeps a type whose states are all closed, with no open states", () => {
    const open = openStatesByType([
      { workItemType: "Archive", stateName: "Done", stateCategory: "completed" },
    ]);
    expect(open).toEqual({ Archive: [] });
  });
});

describe("normalizeTeamAreas", () => {
  it("drops duplicates and children already covered by an including parent", () => {
    const normalized = normalizeTeamAreas([
      ...areas,
      { teamId: "t-other", path: "hoteliana\\core", includeChildren: false },
      { teamId: "t-empty", path: "  ", includeChildren: true },
    ]);
    expect(normalized.map((a) => [a.path, a.includeChildren])).toEqual([
      ["Hoteliana\\Core", true],
      ["Hoteliana", false],
    ]);
  });
});

describe("buildBacklogWiql", () => {
  it("full mode: team areas, per-type open states, no iteration filter", () => {
    const wiql = buildBacklogWiql({
      projectName: "Hoteliana",
      areas,
      workItemTypes: ["User Story", "Bug", "Epic"],
      mode: "full",
      openStates: { "User Story": ["New", "Ready for QA"], bug: ["Active"] },
    })!;
    expect(wiql.query).toContain("[System.TeamProject] = 'Hoteliana'");
    expect(wiql.query).toContain("[System.AreaPath] UNDER 'Hoteliana\\Core'");
    expect(wiql.query).toContain("[System.AreaPath] = 'Hoteliana'");
    expect(wiql.query).not.toContain("Mobile");
    expect(wiql.query).toContain(
      "([System.WorkItemType] = 'User Story' AND [System.State] IN ('New', 'Ready for QA'))",
    );
    expect(wiql.query).toContain(
      "([System.WorkItemType] = 'Bug' AND [System.State] IN ('Active'))",
    );
    expect(wiql.query).not.toContain("IterationPath");
    expect(wiql.skippedTypes).toEqual(["Epic"]);
  });

  it("incremental mode: changed since the watermark, with no state filter", () => {
    const wiql = buildBacklogWiql({
      projectName: "Hoteliana",
      areas,
      workItemTypes: ["User Story"],
      mode: "incremental",
      changedSince: "2026-09-25T10:00:00.000Z",
    })!;
    expect(wiql.query).toContain("[System.ChangedDate] > '2026-09-25T10:00:00.000Z'");
    expect(wiql.query).toContain("[System.WorkItemType] IN ('User Story')");
    expect(wiql.query).not.toContain("[System.State]");
  });

  it("escapes literals and refuses to build without areas, types or a watermark", () => {
    const wiql = buildBacklogWiql({
      projectName: "O'Brien",
      areas: [{ teamId: "t", path: "O'Brien\\A", includeChildren: true }],
      workItemTypes: ["Bug"],
      mode: "full",
      openStates: { Bug: ["Won't Fix Yet"] },
    })!;
    expect(wiql.query).toContain("'O''Brien'");
    expect(wiql.query).toContain("'Won''t Fix Yet'");
    expect(
      buildBacklogWiql({ projectName: "P", areas: [], workItemTypes: ["Bug"], mode: "full" }),
    ).toBeNull();
    expect(
      buildBacklogWiql({ projectName: "P", areas, workItemTypes: ["Bug"], mode: "incremental" }),
    ).toBeNull();
  });

  it("produces no query when no type has open states", () => {
    const wiql = buildBacklogWiql({
      projectName: "P",
      areas,
      workItemTypes: ["Archive"],
      mode: "full",
      openStates: { Archive: [] },
    })!;
    expect(wiql.query).toBe("");
    expect(wiql.skippedTypes).toEqual([]);
  });
});

describe("resolveOwningTeam", () => {
  it("picks the most specific area", () => {
    expect(resolveOwningTeam("Hoteliana\\Core\\Mobile\\iOS", areas)).toBe("t-mobile");
    expect(resolveOwningTeam("Hoteliana\\Core\\Web", areas)).toBe("t-core");
    expect(resolveOwningTeam("hoteliana", areas)).toBe("t-root");
  });

  it("respects includeChildren = false and unknown areas", () => {
    expect(resolveOwningTeam("Hoteliana\\Finance", areas)).toBeNull();
    expect(resolveOwningTeam("Hoteliana\\Corelation", areas)).toBeNull();
  });

  it("keeps the current owner on a tie, else the lowest team id", () => {
    const shared: TeamArea[] = [
      { teamId: "t-b", path: "P\\Shared", includeChildren: true },
      { teamId: "t-a", path: "P\\Shared", includeChildren: true },
    ];
    expect(resolveOwningTeam("P\\Shared\\X", shared, "t-b")).toBe("t-b");
    expect(resolveOwningTeam("P\\Shared\\X", shared, "t-z")).toBe("t-a");
    expect(resolveOwningTeam("P\\Shared\\X", shared)).toBe("t-a");
  });
});

describe("backlog watermark and mode", () => {
  const now = Date.parse("2026-09-26T12:00:00.000Z");

  it("runs full first, then incremental, then full again after a day", () => {
    expect(decideBacklogMode(null, now)).toBe("full");
    expect(decideBacklogMode({ watermarkAt: null, lastFullReconcileAt: null }, now)).toBe("full");
    expect(
      decideBacklogMode(
        {
          watermarkAt: "2026-09-26T11:00:00.000Z",
          lastFullReconcileAt: "2026-09-26T06:00:00.000Z",
        },
        now,
      ),
    ).toBe("incremental");
    expect(
      decideBacklogMode(
        {
          watermarkAt: "2026-09-26T11:00:00.000Z",
          lastFullReconcileAt: new Date(now - FULL_RECONCILE_INTERVAL_MS).toISOString(),
        },
        now,
      ),
    ).toBe("full");
    expect(
      decideBacklogMode(
        { watermarkAt: "2026-09-26T11:00:00.000Z", lastFullReconcileAt: null },
        now,
      ),
    ).toBe("full");
  });

  it("re-reads a safety overlap before the watermark", () => {
    const since = incrementalSince("2026-09-26T11:00:00.000Z");
    expect(Date.parse("2026-09-26T11:00:00.000Z") - Date.parse(since)).toBe(WATERMARK_OVERLAP_MS);
  });

  it("round-trips the last full reconcile token and rejects garbage", () => {
    expect(parseBacklogToken(serializeBacklogToken("2026-09-26T06:00:00.000Z"))).toBe(
      "2026-09-26T06:00:00.000Z",
    );
    expect(parseBacklogToken("not json")).toBeNull();
    expect(parseBacklogToken(JSON.stringify({ lastFullReconcileAt: "nope" }))).toBeNull();
    expect(parseBacklogToken(null)).toBeNull();
  });

  it("never moves a watermark backwards", () => {
    expect(laterOf("2026-09-26T11:00:00.000Z", "2026-09-26T10:00:00.000Z")).toBe(
      "2026-09-26T11:00:00.000Z",
    );
    expect(laterOf(null, "2026-09-26T10:00:00.000Z")).toBe("2026-09-26T10:00:00.000Z");
    expect(laterOf("2026-09-26T10:00:00.000Z", null)).toBe("2026-09-26T10:00:00.000Z");
  });
});

describe("classifyPlacement", () => {
  const current = new Set(["iter-now"]);
  it("separates the current sprint, the backlog and closed items", () => {
    expect(
      classifyPlacement({ iterationId: "iter-now", stateCategory: "inProgress" }, current),
    ).toBe("in_sprint");
    expect(
      classifyPlacement({ iterationId: "iter-next", stateCategory: "proposed" }, current),
    ).toBe("in_backlog");
    expect(classifyPlacement({ iterationId: null, stateCategory: "unknown" }, current)).toBe(
      "in_backlog",
    );
    expect(
      classifyPlacement({ iterationId: "iter-now", stateCategory: "completed" }, current),
    ).toBe("closed");
    expect(classifyPlacement({ iterationId: null, stateCategory: "removed" }, current)).toBe(
      "closed",
    );
  });
});

describe("work items batch body", () => {
  it("asks Azure to omit deleted or inaccessible ids only when re-checking", () => {
    expect(buildWorkItemsBatchBody([1, 2])).not.toHaveProperty("errorPolicy");
    expect(buildWorkItemsBatchBody([1, 2], [], { omitMissing: true }).errorPolicy).toBe("Omit");
  });
});
