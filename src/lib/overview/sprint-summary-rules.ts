/**
 * Pure sprint summary for the top of the Overview (ADR-027): where the sprint
 * stands in the team's calendar, scope (stories) and task progress side by
 * side, and stories whose tasks have moved while the story itself has not.
 *
 * Units never mix (ADR-016): scope progress is by stories/points; task
 * progress is a separate, labelled count. Tasks never count toward scope.
 */
import { countWorkingDays, sprintCalendar } from "@/lib/calendar/cairo";
import { computeScopeCompletion, type RealWorkItemFact } from "./overview-rules";

export type SprintPhase = "running" | "ended" | "notStarted" | "undated";

export interface ProgressCounts {
  readonly total: number;
  readonly done: number;
  readonly inProgress: number;
  readonly notStarted: number;
}

export interface SprintSummary {
  readonly phase: SprintPhase;
  readonly startDate: string | null;
  readonly finishDate: string | null;
  /** Running: working days left including today. Null otherwise. */
  readonly workingDaysLeft: number | null;
  /** Ended: working days since the finish date. Null otherwise. */
  readonly workingDaysSinceEnd: number | null;
  /** Expected completion by today on a straight line; null when undated. */
  readonly expectedPercent: number | null;
  readonly stories: ProgressCounts & {
    readonly points: number | null;
    readonly pointsDone: number | null;
    /** Same rule as the scope KPI: by points when 60% are estimated, else by count. */
    readonly percent: number | null;
    readonly basis: "estimate" | "count" | null;
  };
  readonly tasks: ProgressCounts & { readonly percent: number | null };
  /** Stories still not started although some of their tasks are active or done. */
  readonly storiesBehindTasks: readonly {
    readonly azureId: number;
    readonly title: string;
    readonly azureUrl: string | null;
    readonly tasksDone: number;
    readonly tasks: number;
  }[];
}

const counts = (items: readonly RealWorkItemFact[]): ProgressCounts => ({
  total: items.length,
  done: items.filter((f) => f.stateCategory === "completed").length,
  inProgress: items.filter(
    (f) => f.stateCategory === "inProgress" || f.stateCategory === "resolved",
  ).length,
  notStarted: items.filter((f) => f.stateCategory === "proposed" || f.stateCategory === "unknown")
    .length,
});

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;

const round1 = (n: number) => Math.round(n * 10) / 10;

const addDays = (dateOnly: string, days: number): string =>
  new Date(Date.parse(`${dateOnly}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function summarizeSprint(input: {
  readonly facts: readonly RealWorkItemFact[];
  readonly startDate: string | null;
  readonly finishDate: string | null;
  /** Today in the team's time zone (YYYY-MM-DD). */
  readonly today: string;
  readonly workingWeekdays: readonly number[];
}): SprintSummary {
  const { startDate, finishDate, today, workingWeekdays } = input;
  const live = input.facts.filter((f) => f.stateCategory !== "removed");
  const scope = live.filter((f) => f.countsTowardScope);
  const tasks = live.filter((f) => f.alias === "task");

  const calendar = sprintCalendar(startDate, finishDate, today, workingWeekdays);
  const phase: SprintPhase = !calendar
    ? "undated"
    : today > calendar.finishDate
      ? "ended"
      : today < calendar.startDate
        ? "notStarted"
        : "running";

  const points = scope.reduce((s, f) => s + (f.estimate ?? 0), 0);
  const pointsDone = scope
    .filter((f) => f.stateCategory === "completed")
    .reduce((s, f) => s + (f.estimate ?? 0), 0);
  const storyCounts = counts(scope);
  const completion = computeScopeCompletion(scope);
  const anyEstimate = scope.some((f) => f.estimate !== null);

  const children = new Map<number, RealWorkItemFact[]>();
  for (const task of tasks) {
    if (task.parentAzureWorkItemId === null) continue;
    const list = children.get(task.parentAzureWorkItemId) ?? [];
    list.push(task);
    children.set(task.parentAzureWorkItemId, list);
  }
  const storiesBehindTasks = scope
    .filter((story) => story.stateCategory === "proposed")
    .map((story) => {
      const kids = children.get(story.azureWorkItemId) ?? [];
      return {
        azureId: story.azureWorkItemId,
        title: story.title,
        azureUrl: story.azureUrl,
        tasksDone: kids.filter((k) => k.stateCategory === "completed").length,
        tasks: kids.length,
        moving: kids.some((k) => k.stateCategory !== "proposed" && k.stateCategory !== "unknown"),
      };
    })
    .filter((s) => s.moving)
    .sort((a, b) => b.tasksDone - a.tasksDone || a.azureId - b.azureId)
    .map(({ moving: _moving, ...rest }) => rest);

  const taskCounts = counts(tasks);
  return {
    phase,
    startDate: calendar?.startDate ?? null,
    finishDate: calendar?.finishDate ?? null,
    workingDaysLeft:
      phase === "running" && calendar
        ? countWorkingDays(today, calendar.finishDate, workingWeekdays)
        : null,
    workingDaysSinceEnd:
      phase === "ended" && calendar
        ? countWorkingDays(addDays(calendar.finishDate, 1), today, workingWeekdays)
        : null,
    expectedPercent: calendar ? calendar.expectedCompletionPercent : null,
    stories: {
      ...storyCounts,
      points: anyEstimate ? round1(points) : null,
      pointsDone: anyEstimate ? round1(pointsDone) : null,
      percent: completion.percent,
      basis: completion.percent === null ? null : completion.basis,
    },
    tasks: { ...taskCounts, percent: pct(taskCounts.done, taskCounts.total) },
    storiesBehindTasks,
  };
}
