import { describe, expect, it } from "vitest";
import {
  buildWorkItemRows,
  computeDistribution,
  computeMemberRows,
  computeSummary,
  reconcile,
  type TeamMemberFact,
  type TeamWorkItemFact,
} from "../team-rules";
import { resolveAccessLevel, resolveDataState, safeAvatar } from "../team.server";
import { dictionary } from "@/lib/i18n";

const NOW = "2026-08-27T09:00:00.000Z";

const item = (over: Partial<TeamWorkItemFact> & { id: string }): TeamWorkItemFact => ({
  azureWorkItemId: 1,
  title: "Item",
  alias: "task",
  azureType: "Task",
  state: "Active",
  stateCategory: "inProgress",
  estimate: null,
  estimateUnit: null,
  assignedToMemberId: null,
  isBlocked: false,
  countsTowardScope: true,
  stateChangeDate: null,
  changedAtSource: null,
  azureUrl: "https://dev.azure.com/x/_workitems/edit/1",
  ...over,
});

const members: TeamMemberFact[] = [
  { id: "m1", displayName: "Amira", avatarUrl: null, capacityHours: null },
  { id: "m2", displayName: "Bilal", avatarUrl: null, capacityHours: 40 },
];

const facts: TeamWorkItemFact[] = [
  item({ id: "1", assignedToMemberId: "m1", stateCategory: "inProgress", estimate: 3 }),
  item({ id: "2", assignedToMemberId: "m1", stateCategory: "completed", estimate: 5 }),
  item({ id: "3", assignedToMemberId: "m2", stateCategory: "inProgress", isBlocked: true }),
  item({ id: "4", assignedToMemberId: "m2", stateCategory: "removed", estimate: 2 }),
  item({ id: "5", assignedToMemberId: null, stateCategory: "proposed" }),
];

describe("team calculations", () => {
  it("computes active/completed/blocked/unassigned honestly", () => {
    const s = computeSummary(facts, members);
    expect(s.totalItems).toBe(5);
    // active excludes completed and removed
    expect(s.activeItems).toBe(3);
    expect(s.completedItems).toBe(1);
    expect(s.blockedItems).toBe(1);
    expect(s.unassignedItems).toBe(1);
    expect(s.itemsWithoutEstimate).toBe(2);
  });

  it("computes estimate and assignment coverage from scoped items", () => {
    const s = computeSummary(facts, members);
    expect(s.estimateCoveragePercent).toBe(60);
    expect(s.assignmentCoveragePercent).toBe(80);
  });

  it("returns null coverage instead of zero when there is no work", () => {
    const s = computeSummary([], members);
    expect(s.estimateCoveragePercent).toBeNull();
    expect(s.assignmentCoveragePercent).toBeNull();
  });

  it("reports N/A capacity and never a utilization status without capacity", () => {
    const rows = computeMemberRows(facts, members, NOW);
    const amira = rows.find((r) => r.memberId === "m1")!;
    expect(amira.capacityHours).toBeNull();
    expect(amira.utilizationPercent).toBeNull();
    expect(amira.coverage.hasCapacity).toBe(false);
  });

  it("computes utilization only with a positive capacity denominator", () => {
    const rows = computeMemberRows(facts, members, NOW);
    const bilal = rows.find((r) => r.memberId === "m2")!;
    expect(bilal.capacityHours).toBe(40);
    // only active estimated work counts; m2's only estimate sits on a removed item
    expect(bilal.utilizationPercent).toBeNull();

    const withEffort = computeMemberRows(
      [item({ id: "9", assignedToMemberId: "m2", estimate: 20 })],
      members,
      NOW,
    );
    expect(withEffort.find((r) => r.memberId === "m2")!.utilizationPercent).toBe(50);
  });

  it("omits stage age when StateChangeDate is missing and computes it when present", () => {
    const rows = computeMemberRows(facts, members, NOW);
    expect(rows.find((r) => r.memberId === "m1")!.currentStageAge.medianDays).toBeNull();

    const aged = computeMemberRows(
      [item({ id: "7", assignedToMemberId: "m1", stateChangeDate: "2026-08-22T09:00:00.000Z" })],
      members,
      NOW,
    );
    expect(aged.find((r) => r.memberId === "m1")!.currentStageAge.medianDays).toBe(5);
  });

  it("reconciles member rows plus unassigned with the aggregate total", () => {
    const s = computeSummary(facts, members);
    expect(reconcile(s, computeMemberRows(facts, members, NOW))).toBe(true);
  });

  it("distributes by state category, type, and assignment", () => {
    const d = computeDistribution(facts);
    expect(d.assignment).toEqual({ assigned: 4, unassigned: 1 });
    expect(d.byStateCategory.find((r) => r.key === "inProgress")!.count).toBe(2);
    expect(d.byType.find((r) => r.key === "task")!.count).toBe(5);
  });

  it("never leaks email, descriptor, custom fields, or provider payloads", () => {
    const rows = buildWorkItemRows(facts, members, NOW);
    const serialized = JSON.stringify({ rows, members: computeMemberRows(facts, members, NOW) });
    for (const forbidden of [
      "email",
      "descriptor",
      "customFields",
      "custom_fields",
      "authUserId",
      "raw",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("contains no mock values in live rows", () => {
    const rows = buildWorkItemRows(facts, members, NOW);
    expect(rows.every((r) => facts.some((f) => f.id === r.id))).toBe(true);
  });
});

describe("team access and freshness", () => {
  const ctx = (roles: string[]) => ({ tenantId: "t", coreUserId: "u", roles }) as never;

  it("grants member detail to managers, aggregate to executives, self to contributors", () => {
    expect(resolveAccessLevel(ctx(["tenant_admin"]))).toBe("memberDetail");
    expect(resolveAccessLevel(ctx(["team_lead"]))).toBe("memberDetail");
    expect(resolveAccessLevel(ctx(["qa_release_owner"]))).toBe("memberDetail");
    expect(resolveAccessLevel(ctx(["delivery_manager"]))).toBe("memberDetail");
    expect(resolveAccessLevel(ctx(["executive_viewer"]))).toBe("aggregate");
    expect(resolveAccessLevel(ctx(["contributor"]))).toBe("selfOnly");
    expect(resolveAccessLevel(ctx(["readonly_viewer"]))).toBe("selfOnly");
    expect(resolveAccessLevel(ctx([]))).toBe("selfOnly");
  });

  it("rejects unsafe avatar URLs", () => {
    expect(safeAvatar("http://x/a.png")).toBeNull();
    expect(safeAvatar("javascript:alert(1)")).toBeNull();
    expect(safeAvatar(null)).toBeNull();
    expect(safeAvatar("https://dev.azure.com/a.png")).toBe("https://dev.azure.com/a.png");
  });

  it("reports honest data states", () => {
    expect(resolveDataState(null, 0, NOW)).toBe("notSynced");
    expect(resolveDataState(null, 5, NOW)).toBe("partial");
    expect(resolveDataState("2026-08-27T08:00:00.000Z", 5, NOW)).toBe("current");
    expect(resolveDataState("2026-08-20T08:00:00.000Z", 5, NOW)).toBe("stale");
  });
});

describe("team localization", () => {
  it("has natural Arabic and English strings for every team key", () => {
    const keys = Object.keys(dictionary).filter((k) => k.startsWith("tp."));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      const entry = dictionary[key as keyof typeof dictionary];
      expect(entry.ar.trim().length).toBeGreaterThan(0);
      expect(entry.en.trim().length).toBeGreaterThan(0);
      // no raw key leakage into either locale
      expect(entry.ar).not.toContain("tp.");
      expect(entry.en).not.toContain("tp.");
    }
  });
});
