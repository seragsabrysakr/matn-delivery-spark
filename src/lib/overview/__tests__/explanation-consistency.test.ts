import { describe, expect, it } from "vitest";
import { sprintCalendar } from "@/lib/calendar/cairo";
import { dictionary, type Locale } from "@/lib/i18n";
import {
  buildOverview,
  findExplanationContradictions,
  type RealWorkItemFact,
} from "../overview-rules";

const fact = (over: Partial<RealWorkItemFact> = {}): RealWorkItemFact => ({
  id: "id-1",
  azureWorkItemId: 1,
  title: "Item",
  alias: "story",
  azureType: "User Story",
  state: "Active",
  stateCategory: "inProgress",
  isBlocked: false,
  blockedSince: null,
  estimate: null,
  assignedToMemberId: "m1",
  countsTowardScope: true,
  stateChangeDate: "2026-08-18T00:00:00.000Z",
  changedAtSource: "2026-08-18T00:00:00.000Z",
  azureUrl: null,
  boardColumn: null,
  boardColumnEnteredAt: null,
  tags: [],
  parentAzureWorkItemId: null,
  ...over,
});

/** Day 10 of 10, no capacity, no blockers, no baseline — the reported live state. */
const liveOverview = () =>
  buildOverview({
    facts: [fact({ id: "1" }), fact({ id: "2", assignedToMemberId: "m2" })],
    members: [
      { id: "m1", displayName: "Sara", capacityHours: null },
      { id: "m2", displayName: "Omar", capacityHours: null },
    ],
    calendar: sprintCalendar("2026-08-16", "2026-08-29", "2026-08-27"),
    history: [],
    lastSyncedAt: "2026-08-27T06:00:00.000Z",
    nowIso: "2026-08-27T06:30:00.000Z",
    iterationId: "ti-1",
  });

const render = (key: string, vars: Record<string, string | number> | undefined, locale: Locale) => {
  let out = (dictionary as Record<string, { ar: string; en: string }>)[key]?.[locale] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) out = out.replaceAll(`{${k}}`, String(v));
  return out;
};

describe("real-mode explanation consistency", () => {
  const result = liveOverview();
  const byId = Object.fromEntries(result.snapshot.kpis.map((k) => [k.id, k]));

  it("produces no contradictions between facts and displayed values", () => {
    expect(findExplanationContradictions(result.snapshot.kpis)).toEqual([]);
  });

  it("never reuses a static Phase 1 explanation key in real mode", () => {
    for (const metric of result.snapshot.kpis) {
      expect(metric.explanationKey.endsWith(".explain")).toBe(false);
      expect(dictionary).toHaveProperty(metric.explanationKey);
    }
  });

  it("confidence does not cite scope change or blockers when neither applies", () => {
    const confidence = byId["confidence"]!;
    expect(confidence.explanationFacts?.missingComponents).toContain("scopeStability");
    expect(confidence.explanationKey).not.toContain("scopeStability");
    expect(confidence.explanationFacts?.blockerCount).toBe(0);
    for (const locale of ["en", "ar"] as const) {
      const text = render(confidence.explanationKey, confidence.explanationVars, locale);
      expect(text).not.toMatch(/scope change|تغيّر النطاق/);
      expect(text).not.toMatch(/blocker|المعوّقات/);
    }
  });

  it("scope completion uses the real sprint day and never 'day 7' or '11 points behind'", () => {
    const scope = byId["scope"]!;
    expect(scope.explanationFacts?.sprintDay).toBe(10);
    expect(scope.explanationVars?.["a"]).toBe(10);
    expect(scope.explanationFacts).toMatchObject({ basis: "count", numerator: 0, denominator: 2 });
    const en = render(scope.explanationKey, scope.explanationVars, "en");
    expect(en).toContain("Day 10 of 10");
    expect(en).toContain("0 of 2 scoped items");
    expect(en).toContain("Tasks in the funnel do not count");
    expect(en).not.toContain("11 points");
    const ar = render(scope.explanationKey, scope.explanationVars, "ar");
    expect(ar).toContain("اليوم 10 من 10");
    expect(ar).toContain("مهام الفانل");
  });

  it("expected completion never mentions capacity when capacity is unavailable", () => {
    const expected = byId["expected"]!;
    expect(expected.explanationFacts?.capacityAvailable).toBe(false);
    expect(expected.explanationKey).toBe("real.explain.expected.final");
    expect(render(expected.explanationKey, expected.explanationVars, "en")).toBe(
      "Day 10 of 10: the sprint has reached its final working day, so the expected line is 100%.",
    );
    const ar = render(expected.explanationKey, expected.explanationVars, "ar");
    expect(ar).toContain("يوم العمل الأخير");
    expect(ar).not.toContain("سعة");
  });

  it("zero blockers explain that nothing is mapped as blocked", () => {
    const blockers = byId["blockers"]!;
    expect(blockers.value).toBe(0);
    expect(blockers.explanationKey).toBe("real.explain.blockers.none");
    expect(render(blockers.explanationKey, undefined, "en")).toBe(
      "No active work items are explicitly mapped as blocked.",
    );
    expect(render(blockers.explanationKey, undefined, "ar")).toContain("لا توجد عناصر نشطة");
  });

  it("keeps scope change and release readiness unavailable with real reasons", () => {
    expect(byId["scopeChange"]!.unavailable?.reasonKey).toBe("real.reason.no_baseline_snapshot");
    expect(byId["release"]!.unavailable?.reasonKey).toBe("real.reason.not_synchronized");
    expect(byId["release"]!.explanationKey).toBe("real.explain.release.notSynced");
  });

  it("flags a contradiction when a narrative disagrees with the value", () => {
    const blockers = byId["blockers"]!;
    const tampered = [{ ...blockers, explanationKey: "real.explain.blockers.some" }];
    expect(findExplanationContradictions(tampered).join(" ")).toContain("contradicts count");
  });
});
