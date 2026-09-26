/**
 * Pure sprint-history rules (ADR-018).
 *
 * Each sprint is reconstructed from Azure DevOps revision history: an item's
 * sprint membership, state and estimate at any instant are those of its latest
 * revision at or before that instant. From that we derive, per sprint, what
 * was committed at the start, added or removed during it, delivered by its
 * end and carried over, plus say/do and velocity. Nothing is guessed: an item
 * without a complete history is reported as a coverage gap.
 */
import type { StateCategory } from "@/types/domain/work-item";

export interface HistoryPoint {
  readonly rev: number;
  readonly revisedAt: string;
  readonly iterationPath: string | null;
  readonly stateCategory: StateCategory;
  readonly estimate: number | null;
}

export interface ItemHistory {
  readonly workItemId: string;
  readonly azureWorkItemId: number;
  readonly title: string;
  /** Whether the item counts as sprint scope (type and team bug handling, ADR-016). */
  readonly countsTowardScope: boolean;
  /** True when the stored history starts at rev 1 and reaches the item's latest rev. */
  readonly historyComplete: boolean;
  readonly revisions: readonly HistoryPoint[];
}

export interface SprintWindow {
  readonly iterationId: string;
  readonly name: string;
  readonly path: string;
  /** Inclusive calendar dates in the team's time zone. */
  readonly startDate: string;
  readonly finishDate: string;
}

export interface Tally {
  readonly count: number;
  /** Sum of known estimates; null when no item in the set has one. */
  readonly points: number | null;
  readonly estimated: number;
}

export type SprintStatus = "completed" | "current" | "future";
export type SayDoBasis = "points" | "count";

export interface SprintHistoryRow {
  readonly iterationId: string;
  readonly name: string;
  readonly startDate: string;
  readonly finishDate: string;
  readonly status: SprintStatus;
  readonly committed: Tally;
  readonly added: Tally;
  readonly removed: Tally;
  readonly delivered: Tally;
  /** Delivered items that were committed at the start. */
  readonly deliveredCommitted: Tally;
  /** Open at the end of a completed sprint; null while the sprint runs. */
  readonly carriedOver: Tally | null;
  /**
   * Open at the end but closed afterwards without ever leaving the sprint:
   * work finished late, often closed on the next working day. Part of
   * `carriedOver`; null while the sprint runs.
   */
  readonly deliveredAfterEnd: Tally | null;
  /** Median calendar days between the sprint end and those late closures. */
  readonly medianDaysLate: number | null;
  /** Delivered-of-committed %, by points when every committed item is estimated. */
  readonly sayDo: { readonly percent: number; readonly basis: SayDoBasis } | null;
  /** Points delivered (all delivered scope, committed or added). */
  readonly velocity: number | null;
  /** Scope items touching this sprint whose history is incomplete. */
  readonly historyGaps: number;
  readonly carriedOverIds: readonly number[];
}

/** UTC instant of local midnight at the start of `dateOnly` in `timeZone`. */
export function zonedMidnight(dateOnly: string, timeZone: string): number {
  const guess = Date.parse(`${dateOnly}T00:00:00Z`);
  // Offset of the zone at that moment, e.g. +3h for Africa/Cairo in summer.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asLocal = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return guess - (asLocal - guess);
}

const nextDate = (dateOnly: string): string =>
  new Date(Date.parse(`${dateOnly}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The item's latest revision at or before `instant`, or null if it did not exist yet. */
export function stateAt(revisions: readonly HistoryPoint[], instant: number): HistoryPoint | null {
  let latest: HistoryPoint | null = null;
  for (const revision of revisions) {
    const at = Date.parse(revision.revisedAt);
    if (!Number.isFinite(at) || at > instant) continue;
    if (!latest || revision.rev > latest.rev) latest = revision;
  }
  return latest;
}

const samePath = (a: string | null, b: string): boolean =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

const inSprint = (point: HistoryPoint | null, path: string): boolean =>
  point !== null && samePath(point.iterationPath, path) && point.stateCategory !== "removed";

const tally = (entries: readonly { readonly estimate: number | null }[]): Tally => {
  const estimated = entries.filter((e) => typeof e.estimate === "number" && e.estimate > 0);
  return {
    count: entries.length,
    points: estimated.length > 0 ? estimated.reduce((sum, e) => sum + (e.estimate ?? 0), 0) : null,
    estimated: estimated.length,
  };
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The first working day on or after `dateOnly`. */
export function firstWorkingDay(dateOnly: string, workingWeekdays: readonly number[]): string {
  let day = dateOnly;
  for (let i = 0; i < 7; i += 1) {
    if (workingWeekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())) return day;
    day = nextDate(day);
  }
  return dateOnly;
}

/**
 * One sprint's history. Teams plan on the sprint's first working day, so the
 * commitment is the scope at the end of that day (local time); anything that
 * joins later was added during the sprint. The end is local midnight after
 * the finish date, or `now` while the sprint runs.
 */
export function computeSprintHistory(
  items: readonly ItemHistory[],
  sprint: SprintWindow,
  timeZone: string,
  nowMs: number,
  workingWeekdays: readonly number[] = [0, 1, 2, 3, 4],
): SprintHistoryRow {
  const sprintStart = zonedMidnight(sprint.startDate, timeZone);
  const start = zonedMidnight(
    nextDate(firstWorkingDay(sprint.startDate, workingWeekdays)),
    timeZone,
  );
  const end = zonedMidnight(nextDate(sprint.finishDate), timeZone);
  const status: SprintStatus =
    nowMs < sprintStart ? "future" : nowMs >= end ? "completed" : "current";
  const cutoff = Math.min(end, nowMs);
  // During the planning day itself, measure the commitment as of now.
  const commitAt = Math.min(start, cutoff);

  const committed: { id: number; estimate: number | null }[] = [];
  const added: { id: number; estimate: number | null }[] = [];
  const removed: { id: number; estimate: number | null }[] = [];
  const delivered: { id: number; estimate: number | null; committed: boolean }[] = [];
  const carried: { id: number; estimate: number | null }[] = [];
  const late: { id: number; estimate: number | null; daysLate: number }[] = [];
  let historyGaps = 0;

  for (const item of items) {
    if (!item.countsTowardScope) continue;
    const touches = item.revisions.some((r) => samePath(r.iterationPath, sprint.path));
    if (!touches) continue;
    if (!item.historyComplete) historyGaps += 1;

    const atStart = stateAt(item.revisions, commitAt);
    const atEnd = stateAt(item.revisions, cutoff);
    const wasCommitted = inSprint(atStart, sprint.path);
    const isIn = inSprint(atEnd, sprint.path);
    const joinedDuring = item.revisions.some((r) => {
      const at = Date.parse(r.revisedAt);
      return at > commitAt && at <= cutoff && inSprint(r, sprint.path);
    });

    if (wasCommitted) committed.push({ id: item.azureWorkItemId, estimate: atStart!.estimate });
    else if (joinedDuring || isIn)
      added.push({ id: item.azureWorkItemId, estimate: (atEnd ?? atStart)?.estimate ?? null });

    if ((wasCommitted || joinedDuring) && !isIn && status !== "future") {
      removed.push({ id: item.azureWorkItemId, estimate: atStart?.estimate ?? null });
    }
    if (isIn && atEnd!.stateCategory === "completed") {
      delivered.push({
        id: item.azureWorkItemId,
        estimate: atEnd!.estimate,
        committed: wasCommitted,
      });
    } else if (isIn && status === "completed") {
      carried.push({ id: item.azureWorkItemId, estimate: atEnd!.estimate });
      const closedLater = closedAfterEndInSprint(item.revisions, end, sprint.path);
      if (closedLater) {
        late.push({
          id: item.azureWorkItemId,
          estimate: closedLater.estimate,
          daysLate: (Date.parse(closedLater.revisedAt) - end) / 86_400_000,
        });
      }
    }
  }

  const committedTally = tally(committed);
  const deliveredCommitted = tally(delivered.filter((d) => d.committed));
  const pointsBasis = committedTally.count > 0 && committedTally.estimated === committedTally.count;
  const sayDo =
    status === "future" || committedTally.count === 0
      ? null
      : pointsBasis && committedTally.points
        ? {
            percent: round1(((deliveredCommitted.points ?? 0) / committedTally.points) * 100),
            basis: "points" as const,
          }
        : {
            percent: round1((deliveredCommitted.count / committedTally.count) * 100),
            basis: "count" as const,
          };
  const deliveredTally = tally(delivered);

  return {
    iterationId: sprint.iterationId,
    name: sprint.name,
    startDate: sprint.startDate,
    finishDate: sprint.finishDate,
    status,
    committed: committedTally,
    added: tally(added),
    removed: tally(removed),
    delivered: deliveredTally,
    deliveredCommitted,
    carriedOver: status === "completed" ? tally(carried) : null,
    deliveredAfterEnd: status === "completed" ? tally(late) : null,
    medianDaysLate: late.length > 0 ? round1(median(late.map((l) => l.daysLate))) : null,
    sayDo,
    // Nothing delivered is a real 0; delivered but unestimated is unknown, not 0.
    velocity: status === "future" ? null : delivered.length === 0 ? 0 : deliveredTally.points,
    historyGaps,
    carriedOverIds: carried.map((c) => c.id),
  };
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * The first completing revision after the sprint end, provided the item
 * stayed in the sprint the whole time until then; null otherwise.
 */
function closedAfterEndInSprint(
  revisions: readonly HistoryPoint[],
  end: number,
  path: string,
): HistoryPoint | null {
  const after = revisions
    .filter((r) => Date.parse(r.revisedAt) > end)
    .sort((a, b) => a.rev - b.rev);
  for (const revision of after) {
    if (!samePath(revision.iterationPath, path)) return null;
    if (revision.stateCategory === "completed") return revision;
  }
  return null;
}

/** Mean velocity of the last `window` completed sprints; null with fewer than 2. */
export function averageVelocity(
  rows: readonly SprintHistoryRow[],
  window = 3,
): { readonly mean: number; readonly sprints: number } | null {
  const completed = rows
    .filter((row) => row.status === "completed" && row.velocity !== null)
    .sort((a, b) => b.finishDate.localeCompare(a.finishDate))
    .slice(0, window);
  if (completed.length < 2) return null;
  const mean = completed.reduce((sum, row) => sum + (row.velocity ?? 0), 0) / completed.length;
  return { mean: round1(mean), sprints: completed.length };
}
