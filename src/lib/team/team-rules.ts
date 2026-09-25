/**
 * Deterministic Team page computation.
 *
 * Pure functions only: no database, no network, no clock beyond an injected
 * `nowIso`. Every number rendered on the Team page is produced here from real
 * synchronized facts, so tests can assert honesty without a live sync.
 */

export type TeamStateCategory =
  "proposed" | "inProgress" | "resolved" | "completed" | "removed" | "unknown";

export type TeamAccessLevel = "memberDetail" | "selfOnly" | "aggregate";

/** One synchronized work item, already tenant/iteration scoped by the caller. */
export interface TeamWorkItemFact {
  readonly id: string;
  readonly azureWorkItemId: number;
  readonly title: string;
  readonly alias: string;
  readonly azureType: string;
  readonly state: string;
  readonly stateCategory: TeamStateCategory;
  readonly estimate: number | null;
  readonly estimateUnit: string | null;
  readonly assignedToMemberId: string | null;
  readonly isBlocked: boolean;
  readonly countsTowardScope: boolean;
  readonly stateChangeDate: string | null;
  readonly changedAtSource: string | null;
  readonly azureUrl: string | null;
}

/** A team member as synchronized from Azure. Email/descriptor never enter here. */
export interface TeamMemberFact {
  readonly id: string;
  readonly displayName: string;
  /** Only a safe https image URL survives the server filter; otherwise null. */
  readonly avatarUrl: string | null;
  readonly capacityHours: number | null;
}

export interface TeamWorkItemRow {
  readonly id: string;
  readonly azureWorkItemId: number;
  readonly title: string;
  readonly alias: string;
  readonly azureType: string;
  readonly state: string;
  readonly stateCategory: TeamStateCategory;
  readonly estimate: number | null;
  readonly estimateUnit: string | null;
  readonly assignedMemberId: string | null;
  readonly assignedMemberName: string | null;
  readonly isBlocked: boolean;
  readonly hasEstimate: boolean;
  readonly changedAtSource: string | null;
  readonly stateChangeDate: string | null;
  readonly currentStageAgeDays: number | null;
  readonly azureUrl: string | null;
}

export interface TeamMemberRow {
  readonly memberId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly assigned: number;
  readonly active: number;
  readonly completed: number;
  readonly blocked: number;
  readonly unestimated: number;
  readonly byStateCategory: Readonly<Record<string, number>>;
  readonly byType: Readonly<Record<string, number>>;
  /** Median/max days in the current state; null when StateChangeDate is absent. */
  readonly currentStageAge: {
    readonly medianDays: number | null;
    readonly maxDays: number | null;
    readonly coveredItems: number;
  };
  /** Only present when a real positive capacity row exists. */
  readonly capacityHours: number | null;
  /** Only present with a valid positive capacity denominator. */
  readonly utilizationPercent: number | null;
  readonly coverage: {
    readonly hasCapacity: boolean;
    readonly hasEffortData: boolean;
    readonly estimatedItems: number;
  };
}

export interface TeamSummary {
  readonly memberCount: number;
  readonly totalItems: number;
  readonly activeItems: number;
  readonly completedItems: number;
  readonly blockedItems: number;
  readonly unassignedItems: number;
  readonly itemsWithoutEstimate: number;
  /** Assigned scoped items / total items; null when there is no work. */
  readonly assignmentCoveragePercent: number | null;
  /** Scoped items with a positive estimate / scoped items; null when no scope. */
  readonly estimateCoveragePercent: number | null;
  readonly scopedItems: number;
  readonly capacityAvailable: boolean;
}

export interface TeamDistribution {
  readonly byStateCategory: readonly { readonly key: string; readonly count: number }[];
  readonly byType: readonly {
    readonly key: string;
    readonly azureType: string;
    readonly count: number;
  }[];
  readonly assignment: { readonly assigned: number; readonly unassigned: number };
}

export interface TeamCalculationBasis {
  readonly activeExcludes: readonly string[];
  readonly completedCategory: string;
  readonly blockedSource: "mappedField";
  readonly estimateCoverageBasis: "scopedItems";
  readonly stageAgeSource: "stateChangeDate";
  readonly cycleTimeAvailable: false;
}

export const isCompleted = (c: TeamStateCategory): boolean => c === "completed";
export const isRemoved = (c: TeamStateCategory): boolean => c === "removed";
/** Active is everything that is neither completed nor removed. */
export const isActive = (c: TeamStateCategory): boolean => !isCompleted(c) && !isRemoved(c);

const hasPositiveEstimate = (f: { estimate: number | null }): boolean =>
  typeof f.estimate === "number" && Number.isFinite(f.estimate) && f.estimate > 0;

const DAY_MS = 86_400_000;

export function ageInDays(fromIso: string | null, nowIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(from) || !Number.isFinite(now)) return null;
  const days = Math.floor((now - from) / DAY_MS);
  return days < 0 ? 0 : days;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

export function buildWorkItemRows(
  facts: readonly TeamWorkItemFact[],
  members: readonly TeamMemberFact[],
  nowIso: string,
): TeamWorkItemRow[] {
  const nameById = new Map(members.map((m) => [m.id, m.displayName]));
  return facts.map((f) => ({
    id: f.id,
    azureWorkItemId: f.azureWorkItemId,
    title: f.title,
    alias: f.alias,
    azureType: f.azureType,
    state: f.state,
    stateCategory: f.stateCategory,
    estimate: f.estimate,
    estimateUnit: f.estimateUnit,
    assignedMemberId: f.assignedToMemberId,
    assignedMemberName: f.assignedToMemberId ? (nameById.get(f.assignedToMemberId) ?? null) : null,
    isBlocked: f.isBlocked,
    hasEstimate: hasPositiveEstimate(f),
    changedAtSource: f.changedAtSource,
    stateChangeDate: f.stateChangeDate,
    currentStageAgeDays: ageInDays(f.stateChangeDate, nowIso),
    azureUrl: f.azureUrl,
  }));
}

export function computeSummary(
  facts: readonly TeamWorkItemFact[],
  members: readonly TeamMemberFact[],
): TeamSummary {
  const scoped = facts.filter((f) => f.countsTowardScope);
  const assigned = facts.filter((f) => f.assignedToMemberId !== null).length;
  const capacityAvailable = members.some(
    (m) => typeof m.capacityHours === "number" && m.capacityHours > 0,
  );

  return {
    memberCount: members.length,
    totalItems: facts.length,
    activeItems: facts.filter((f) => isActive(f.stateCategory)).length,
    completedItems: facts.filter((f) => isCompleted(f.stateCategory)).length,
    blockedItems: facts.filter((f) => f.isBlocked).length,
    unassignedItems: facts.length - assigned,
    itemsWithoutEstimate: facts.filter((f) => !hasPositiveEstimate(f)).length,
    assignmentCoveragePercent: pct(assigned, facts.length),
    estimateCoveragePercent: pct(scoped.filter(hasPositiveEstimate).length, scoped.length),
    scopedItems: scoped.length,
    capacityAvailable,
  };
}

export function computeMemberRows(
  facts: readonly TeamWorkItemFact[],
  members: readonly TeamMemberFact[],
  nowIso: string,
): TeamMemberRow[] {
  return members
    .map<TeamMemberRow>((member) => {
      const mine = facts.filter((f) => f.assignedToMemberId === member.id);
      const byStateCategory: Record<string, number> = {};
      const byType: Record<string, number> = {};
      const ages: number[] = [];

      for (const f of mine) {
        byStateCategory[f.stateCategory] = (byStateCategory[f.stateCategory] ?? 0) + 1;
        byType[f.alias] = (byType[f.alias] ?? 0) + 1;
        const age = ageInDays(f.stateChangeDate, nowIso);
        if (age !== null) ages.push(age);
      }

      const activeItems = mine.filter((f) => isActive(f.stateCategory));
      const effort = activeItems.reduce(
        (sum, f) => sum + (hasPositiveEstimate(f) ? (f.estimate ?? 0) : 0),
        0,
      );
      const hasEffortData = activeItems.some(hasPositiveEstimate);
      const hasCapacity = typeof member.capacityHours === "number" && member.capacityHours > 0;

      return {
        memberId: member.id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        assigned: mine.length,
        active: activeItems.length,
        completed: mine.filter((f) => isCompleted(f.stateCategory)).length,
        blocked: mine.filter((f) => f.isBlocked).length,
        unestimated: mine.filter((f) => !hasPositiveEstimate(f)).length,
        byStateCategory,
        byType,
        currentStageAge: {
          medianDays: median(ages),
          maxDays: ages.length ? Math.max(...ages) : null,
          coveredItems: ages.length,
        },
        capacityHours: hasCapacity ? member.capacityHours : null,
        utilizationPercent:
          hasCapacity && hasEffortData ? pct(effort, member.capacityHours as number) : null,
        coverage: {
          hasCapacity,
          hasEffortData,
          estimatedItems: mine.filter(hasPositiveEstimate).length,
        },
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function computeDistribution(facts: readonly TeamWorkItemFact[]): TeamDistribution {
  const stateCounts = new Map<string, number>();
  const typeCounts = new Map<string, { azureType: string; count: number }>();
  let assigned = 0;

  for (const f of facts) {
    stateCounts.set(f.stateCategory, (stateCounts.get(f.stateCategory) ?? 0) + 1);
    const existing = typeCounts.get(f.alias);
    typeCounts.set(f.alias, {
      azureType: existing?.azureType ?? f.azureType,
      count: (existing?.count ?? 0) + 1,
    });
    if (f.assignedToMemberId) assigned += 1;
  }

  return {
    byStateCategory: [...stateCounts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    byType: [...typeCounts.entries()]
      .map(([key, v]) => ({ key, azureType: v.azureType, count: v.count }))
      .sort((a, b) => b.count - a.count),
    assignment: { assigned, unassigned: facts.length - assigned },
  };
}

export const calculationBasis: TeamCalculationBasis = {
  activeExcludes: ["completed", "removed"],
  completedCategory: "completed",
  blockedSource: "mappedField",
  estimateCoverageBasis: "scopedItems",
  stageAgeSource: "stateChangeDate",
  cycleTimeAvailable: false,
};

/** Member rows plus unassigned always reconcile with the aggregate totals. */
export function reconcile(summary: TeamSummary, members: readonly TeamMemberRow[]): boolean {
  const assignedFromMembers = members.reduce((sum, m) => sum + m.assigned, 0);
  return assignedFromMembers + summary.unassignedItems === summary.totalItems;
}

export type TeamDataState = "notSynced" | "current" | "partial" | "stale";

export interface TeamPageContract {
  readonly context: {
    readonly organizationName: { readonly en: string; readonly ar: string };
    readonly projectName: { readonly en: string; readonly ar: string };
    readonly teamName: { readonly en: string; readonly ar: string };
    readonly sprintName: { readonly en: string; readonly ar: string };
    readonly sprintStartDate: string | null;
    readonly sprintFinishDate: string | null;
    readonly lastWorkItemSyncAt: string | null;
    readonly mode: "real";
    readonly dataState: TeamDataState;
    readonly completeness: { readonly hasWorkItems: boolean; readonly hasMembers: boolean };
  };
  readonly accessLevel: TeamAccessLevel;
  readonly summary: TeamSummary;
  readonly members: readonly TeamMemberRow[];
  readonly workItems: readonly TeamWorkItemRow[];
  readonly distribution: TeamDistribution;
  readonly basis: TeamCalculationBasis;
}
