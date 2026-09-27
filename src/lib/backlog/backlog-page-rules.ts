/**
 * Pure rules for the Backlog page (ADR-026): the team's open scope items that
 * are not in its current sprint, with the checks a delivery manager grooms by.
 * Scope follows ADR-023 (the requirement backlog, bugs per the team's
 * setting); placement is derived from the item's sprint dates at read time
 * (ADR-014), never persisted.
 */
import type { StateCategory } from "@/types/domain/work-item";

/** An item untouched in Azure for this many calendar days is stale. */
export const STALE_AFTER_DAYS = 30;

export type BacklogPlacementKind = "noSprint" | "pastSprint" | "futureSprint" | "currentSprint";

export type BacklogFlag = "unestimated" | "unassigned" | "stale" | "noParent";

/** Missing any of these makes an item "not ready"; each is read from Azure data. */
export const READINESS_CHECKS: readonly BacklogFlag[] = ["unestimated", "noParent"];

export interface BacklogItemInput {
  readonly azureId: number;
  readonly parentAzureId: number | null;
  readonly type: string;
  readonly title: string;
  readonly state: string;
  readonly stateCategory: StateCategory;
  readonly countsTowardScope: boolean;
  readonly estimate: number | null;
  readonly assignee: string | null;
  readonly priority: number | null;
  readonly tags: readonly string[];
  readonly azureUrl: string | null;
  readonly createdAt: string;
  readonly changedAt: string;
  /** The item's sprint (from `System.IterationPath`); null when none is synchronized. */
  readonly sprint: {
    readonly name: string;
    readonly startDate: string | null;
    readonly finishDate: string | null;
    /** The team's current sprint — latest started, late until the next starts (ADR-028). */
    readonly isCurrent?: boolean;
  } | null;
}

export interface BacklogRow {
  readonly azureId: number;
  readonly type: string;
  readonly title: string;
  readonly state: string;
  readonly estimate: number | null;
  readonly assignee: string | null;
  readonly priority: number | null;
  readonly tags: readonly string[];
  readonly azureUrl: string | null;
  readonly placement: BacklogPlacementKind;
  readonly sprintName: string | null;
  /** Calendar days since the item was created / last changed in Azure. */
  readonly ageDays: number | null;
  readonly idleDays: number | null;
  readonly flags: readonly BacklogFlag[];
  readonly ready: boolean;
}

export interface BacklogStats {
  readonly total: number;
  readonly points: number;
  readonly unestimated: number;
  readonly unassigned: number;
  readonly stale: number;
  readonly notReady: number;
  /** Open items still sitting in a sprint that has ended. */
  readonly inPastSprint: number;
  readonly inFutureSprint: number;
}

const DAY_MS = 86_400_000;

const daysSince = (iso: string, nowIso: string): number | null => {
  const from = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(from) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - from) / DAY_MS));
};

/**
 * Where an open item sits relative to today (a date in the team's time zone):
 * the team's current sprint (running, or late until the next starts) is not
 * backlog; an undated sprint (e.g. the project's root iteration) is treated
 * as no sprint.
 */
export function placementOf(
  sprint: BacklogItemInput["sprint"],
  today: string,
): BacklogPlacementKind {
  if (sprint?.isCurrent) return "currentSprint";
  if (!sprint || !sprint.startDate || !sprint.finishDate) return "noSprint";
  if (sprint.finishDate < today) return "pastSprint";
  if (sprint.startDate > today) return "futureSprint";
  return "currentSprint";
}

/**
 * Whether an item belongs on a team's backlog: its area is one of the team's
 * areas or under one (as Azure shows it — an item can be on several teams'
 * backlogs). The stored areas carry no includeChildren flag, so children are
 * included, as in the backlog sync's fallback (ADR-014).
 */
export function inTeamAreas(areaPath: string, teamAreas: readonly string[]): boolean {
  const path = areaPath.toLowerCase();
  return teamAreas.some((area) => {
    const a = area.trim().toLowerCase();
    return a.length > 0 && (path === a || path.startsWith(`${a}\\`));
  });
}

const OPEN = (c: StateCategory) => c !== "completed" && c !== "removed";

/** Highest priority first (Azure: 1 is highest; none last), then oldest id. */
const byPriority = (a: BacklogRow, b: BacklogRow) =>
  (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER) ||
  a.azureId - b.azureId;

export function buildBacklog(
  items: readonly BacklogItemInput[],
  today: string,
  nowIso: string,
): { readonly rows: BacklogRow[]; readonly stats: BacklogStats } {
  const rows: BacklogRow[] = [];
  for (const item of items) {
    if (!item.countsTowardScope || !OPEN(item.stateCategory)) continue;
    const placement = placementOf(item.sprint, today);
    if (placement === "currentSprint") continue;
    const idleDays = daysSince(item.changedAt, nowIso);
    const flags: BacklogFlag[] = [];
    if (item.estimate === null || !(item.estimate > 0)) flags.push("unestimated");
    if (!item.assignee) flags.push("unassigned");
    if (idleDays !== null && idleDays >= STALE_AFTER_DAYS) flags.push("stale");
    if (item.parentAzureId === null) flags.push("noParent");
    rows.push({
      azureId: item.azureId,
      type: item.type,
      title: item.title,
      state: item.state,
      estimate: item.estimate,
      assignee: item.assignee,
      priority: item.priority,
      tags: item.tags,
      azureUrl: item.azureUrl,
      placement,
      sprintName: placement === "noSprint" ? null : (item.sprint?.name ?? null),
      ageDays: daysSince(item.createdAt, nowIso),
      idleDays,
      flags,
      ready: READINESS_CHECKS.every((check) => !flags.includes(check)),
    });
  }
  rows.sort(byPriority);
  const has = (flag: BacklogFlag) => rows.filter((r) => r.flags.includes(flag)).length;
  return {
    rows,
    stats: {
      total: rows.length,
      points: Math.round(rows.reduce((sum, r) => sum + (r.estimate ?? 0), 0) * 10) / 10,
      unestimated: has("unestimated"),
      unassigned: has("unassigned"),
      stale: has("stale"),
      notReady: rows.filter((r) => !r.ready).length,
      inPastSprint: rows.filter((r) => r.placement === "pastSprint").length,
      inFutureSprint: rows.filter((r) => r.placement === "futureSprint").length,
    },
  };
}

export type BacklogFilter = "all" | "unestimated" | "unassigned" | "stale" | "notReady";

export function matchesFilter(row: BacklogRow, filter: BacklogFilter): boolean {
  if (filter === "all") return true;
  if (filter === "notReady") return !row.ready;
  return row.flags.includes(filter);
}
