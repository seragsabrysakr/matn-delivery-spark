/**
 * Pure delivery-schedule rules (ADR-021).
 *
 * A deliverable is one Azure work item (per the project's mapping) and its
 * whole descendant tree. Progress rolls up from the scope items under it
 * (stories, and bugs planned as requirements — ADR-016), so a story's tasks
 * are never counted twice. The forecast uses the deliverable's own recent
 * burn rate — what was actually completed under it per sprint — so work the
 * team spends elsewhere is already accounted for. Missing data gives null
 * with a reason, never a guessed date.
 */
import type { StateCategory } from "@/types/domain/work-item";

export interface HierarchyItem {
  readonly azureId: number;
  readonly parentAzureId: number | null;
  readonly type: string;
  readonly title: string;
  readonly countsTowardScope: boolean;
  readonly stateCategory: StateCategory;
  readonly estimate: number | null;
  readonly iterationPath: string | null;
  readonly closedDate: string | null;
  readonly teamId: string | null;
}

/** Every item below `rootId`, at any depth (cycle-safe). */
export function descendantsOf(rootId: number, items: readonly HierarchyItem[]): HierarchyItem[] {
  const children = new Map<number, HierarchyItem[]>();
  for (const item of items) {
    if (item.parentAzureId === null) continue;
    const list = children.get(item.parentAzureId) ?? [];
    list.push(item);
    children.set(item.parentAzureId, list);
  }
  const seen = new Set<number>([rootId]);
  const out: HierarchyItem[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (seen.has(child.azureId)) continue;
      seen.add(child.azureId);
      out.push(child);
      queue.push(child.azureId);
    }
  }
  return out;
}

/** Share of scope items that must carry an estimate for a points-based roll-up. */
export const ESTIMATE_COVERAGE_FOR_POINTS = 0.6;

export type ProgressBasis = "points" | "count";

export interface Progress {
  readonly percent: number | null;
  readonly basis: ProgressBasis | null;
  readonly scopeItems: number;
  readonly completedItems: number;
  /** Open estimated points (points basis) — null on a count basis. */
  readonly remainingPoints: number | null;
  readonly remainingItems: number;
}

const isEstimated = (item: HierarchyItem) => typeof item.estimate === "number" && item.estimate > 0;

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Scope under the deliverable: its scope descendants that were not removed
 * and have no scope below them. Containers (an Epic's Features, a Feature
 * with stories) are never counted next to their own children, so nothing is
 * counted twice; a Feature not yet broken down counts as one item. A
 * deliverable with no scope below it counts as its own scope.
 */
export function deliverableScope(
  root: HierarchyItem,
  descendants: readonly HierarchyItem[],
): HierarchyItem[] {
  const live = descendants.filter((d) => d.countsTowardScope && d.stateCategory !== "removed");
  const parents = new Set(live.map((d) => d.parentAzureId).filter((id) => id !== null));
  const scope = live.filter((d) => !parents.has(d.azureId));
  if (scope.length === 0 && root.countsTowardScope && root.stateCategory !== "removed")
    return [root];
  return scope;
}

export function rollUpProgress(scope: readonly HierarchyItem[]): Progress {
  if (scope.length === 0) {
    return {
      percent: null,
      basis: null,
      scopeItems: 0,
      completedItems: 0,
      remainingPoints: null,
      remainingItems: 0,
    };
  }
  const done = scope.filter((s) => s.stateCategory === "completed");
  const estimated = scope.filter(isEstimated);
  const byPoints = estimated.length / scope.length >= ESTIMATE_COVERAGE_FOR_POINTS;
  if (byPoints) {
    const total = estimated.reduce((sum, s) => sum + s.estimate!, 0);
    const completed = estimated
      .filter((s) => s.stateCategory === "completed")
      .reduce((sum, s) => sum + s.estimate!, 0);
    return {
      percent: round1((completed / total) * 100),
      basis: "points",
      scopeItems: scope.length,
      completedItems: done.length,
      remainingPoints: Math.round((total - completed) * 100) / 100,
      remainingItems: scope.length - done.length,
    };
  }
  return {
    percent: round1((done.length / scope.length) * 100),
    basis: "count",
    scopeItems: scope.length,
    completedItems: done.length,
    remainingPoints: null,
    remainingItems: scope.length - done.length,
  };
}

/** Sprint paths the deliverable's work was planned in, in the given sprint order. */
export function contributingSprints(
  items: readonly HierarchyItem[],
  orderedSprintPaths: readonly string[],
): string[] {
  const used = new Set(
    items.map((i) => (i.iterationPath ?? "").trim().toLowerCase()).filter((p) => p.length > 0),
  );
  return orderedSprintPaths.filter((path) => used.has(path.trim().toLowerCase()));
}

const dateOf = (iso: string | null): string | null =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;

/**
 * When the deliverable was delivered: the root's closed date once it is
 * completed, or — when every scope item is completed — the last of their
 * closed dates. Null while anything is open or a date is missing.
 */
export function actualDeliveryDate(
  root: HierarchyItem,
  scope: readonly HierarchyItem[],
): string | null {
  if (root.stateCategory === "completed") {
    return (
      dateOf(root.closedDate) ??
      latest(scope.filter((s) => s.stateCategory === "completed").map((s) => dateOf(s.closedDate)))
    );
  }
  if (scope.length === 0 || scope.some((s) => s.stateCategory !== "completed")) return null;
  const dates = scope.map((s) => dateOf(s.closedDate));
  return dates.some((d) => d === null) ? null : latest(dates);
}

const latest = (dates: readonly (string | null)[]): string | null =>
  dates.reduce<string | null>((max, d) => (d && (!max || d > max) ? d : max), null);

export interface SprintSpan {
  readonly startDate: string;
  readonly finishDate: string;
}

export interface Completion {
  /** Date the scope item was completed (date-only or ISO). */
  readonly date: string;
  /** Points (points basis) or 1 (count basis). */
  readonly amount: number;
}

export type ForecastReason =
  "no_scope" | "insufficient_history" | "no_recent_progress" | "unestimated";

export interface Forecast {
  readonly date: string | null;
  /** Optimistic end: at the best recent sprint rate. */
  readonly low: string | null;
  /** Pessimistic end: at the worst recent sprint rate; null when that rate was 0. */
  readonly high: string | null;
  readonly reason: ForecastReason | null;
  readonly ratePerSprint: number | null;
  readonly sprintsUsed: number;
}

export const FORECAST_WINDOW_SPRINTS = 6;
export const FORECAST_MIN_SPRINTS = 2;

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day: string, days: number) =>
  new Date(toMs(day) + days * DAY_MS).toISOString().slice(0, 10);
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const noForecast = (reason: ForecastReason, sprintsUsed = 0): Forecast => ({
  date: null,
  low: null,
  high: null,
  reason,
  ratePerSprint: null,
  sprintsUsed,
});

/**
 * Forecast from the deliverable's own completions per sprint over the last
 * FORECAST_WINDOW_SPRINTS completed sprints of the owning team. Each sprint's
 * bucket runs from its start to the next sprint's start, so work closed in
 * the gap between sprints still counts. The team's cadence (days between
 * sprint starts) turns remaining sprints into a date.
 */
export function forecastDelivery(input: {
  readonly remaining: number | null;
  readonly completions: readonly Completion[];
  readonly sprints: readonly SprintSpan[];
  readonly today: string;
}): Forecast {
  if (input.remaining === null) return noForecast("unestimated");
  const ordered = [...input.sprints].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const completedIdx = ordered
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.finishDate < input.today)
    .slice(-FORECAST_WINDOW_SPRINTS);
  if (completedIdx.length < FORECAST_MIN_SPRINTS)
    return noForecast("insufficient_history", completedIdx.length);

  const rates = completedIdx.map(({ s, i }) => {
    const next = ordered[i + 1];
    const endExclusive =
      next && next.startDate <= input.today ? next.startDate : addDays(s.finishDate, 1);
    return input.completions
      .filter((c) => {
        const day = c.date.slice(0, 10);
        return day >= s.startDate && day < endExclusive;
      })
      .reduce((sum, c) => sum + c.amount, 0);
  });

  if (input.remaining <= 0) {
    return {
      date: input.today,
      low: input.today,
      high: input.today,
      reason: null,
      ratePerSprint: null,
      sprintsUsed: rates.length,
    };
  }
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  if (mean <= 0) return noForecast("no_recent_progress", rates.length);

  const starts = completedIdx.map(({ s }) => toMs(s.startDate));
  const gaps = starts.slice(1).map((ms, i) => (ms - starts[i]!) / DAY_MS);
  const lengths = completedIdx.map(
    ({ s }) => (toMs(s.finishDate) - toMs(s.startDate)) / DAY_MS + 1,
  );
  const cadence = Math.max(median(gaps.length > 0 ? gaps : lengths), median(lengths));
  const at = (rate: number) =>
    addDays(input.today, Math.ceil(input.remaining! / rate) * Math.round(cadence));

  const best = Math.max(...rates);
  const worst = Math.min(...rates);
  return {
    date: at(mean),
    low: at(best),
    high: worst > 0 ? at(worst) : null,
    reason: null,
    ratePerSprint: Math.round(mean * 10) / 10,
    sprintsUsed: rates.length,
  };
}

export type DeliveryStatus = "delivered" | "no_committed_date" | "late" | "at_risk" | "on_track";

export interface StatusResult {
  readonly status: DeliveryStatus;
  /** Why it is at risk, or how late a delivery was. */
  readonly reason: "forecast_after_commitment" | "forecast_unavailable" | null;
  /** Days past the committed date (late, or delivered late); null otherwise. */
  readonly daysLate: number | null;
}

export function deliveryStatus(input: {
  readonly actualDate: string | null;
  readonly committedDate: string | null;
  readonly forecastDate: string | null;
  readonly today: string;
}): StatusResult {
  const late = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY_MS);
  if (input.actualDate) {
    const days = input.committedDate ? late(input.committedDate, input.actualDate) : null;
    return { status: "delivered", reason: null, daysLate: days !== null && days > 0 ? days : null };
  }
  if (!input.committedDate) return { status: "no_committed_date", reason: null, daysLate: null };
  if (input.today > input.committedDate)
    return { status: "late", reason: null, daysLate: late(input.committedDate, input.today) };
  if (!input.forecastDate)
    return { status: "at_risk", reason: "forecast_unavailable", daysLate: null };
  if (input.forecastDate > input.committedDate)
    return { status: "at_risk", reason: "forecast_after_commitment", daysLate: null };
  return { status: "on_track", reason: null, daysLate: null };
}
