/**
 * Pure scheduling rules (ADR-020): which sync is due for a current sprint.
 * The scheduler performs one bounded step per request, so a slow Azure
 * response never exceeds the Worker's limits; the caller repeats requests
 * until the tick reports idle.
 */

export type ScheduledSyncKind = "foundation" | "sprint" | "backlog" | "history" | "delivery";

/** Minimum time between completed runs of each kind. */
export const SYNC_INTERVAL_MS: Readonly<Record<ScheduledSyncKind, number>> = {
  // Projects, teams, iterations and members: picks up new sprints.
  foundation: 6 * 60 * 60_000,
  sprint: 15 * 60_000,
  backlog: 30 * 60_000,
  history: 30 * 60_000,
  delivery: 30 * 60_000,
};

/**
 * Per sprint, in order: history follows the items the sprint and backlog
 * syncs wrote; deliverables roll up everything before them.
 */
export const SPRINT_SYNC_ORDER: readonly ScheduledSyncKind[] = [
  "sprint",
  "backlog",
  "history",
  "delivery",
];

export interface LatestRun {
  readonly id: string;
  readonly status: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

/** An active (or interrupted) run is always resumed before a new one starts. */
export type SyncDecision =
  | { readonly action: "advance"; readonly runId: string }
  | { readonly action: "start" }
  | { readonly action: "wait" };

export function decideSync(
  latest: LatestRun | null,
  kind: ScheduledSyncKind,
  nowMs: number,
): SyncDecision {
  if (!latest) return { action: "start" };
  if (latest.status === "queued" || latest.status === "running")
    return { action: "advance", runId: latest.id };
  const finished = Date.parse(latest.finishedAt ?? latest.startedAt ?? "");
  if (!Number.isFinite(finished)) return { action: "start" };
  return nowMs - finished >= SYNC_INTERVAL_MS[kind] ? { action: "start" } : { action: "wait" };
}

export interface SprintCandidate {
  readonly tenantId: string;
  readonly teamId: string;
  readonly teamIterationId: string;
  readonly startDate: string | null;
  readonly finishDate: string | null;
}

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/**
 * A sprint past its finish date stays the team's current sprint — late —
 * until the next one starts in Azure (ADR-028). After this many calendar
 * days with no new sprint, the team is treated as having no active sprint.
 */
export const OVERDUE_LIMIT_DAYS = 30;

export type SprintPhase = "running" | "overdue" | "inactive" | "ended" | "notStarted" | "undated";

/**
 * Where a sprint stands today. `laterSprintStarted` is whether the same team
 * has a later dated sprint that has already started: a past sprint is then
 * history ("ended"); otherwise it is still the current sprint, running late
 * ("overdue"), up to OVERDUE_LIMIT_DAYS after its finish ("inactive" beyond).
 */
export function sprintPhase(input: {
  readonly startDate: string | null;
  readonly finishDate: string | null;
  readonly today: string;
  readonly laterSprintStarted: boolean;
}): SprintPhase {
  const { startDate, finishDate, today } = input;
  if (!startDate || !finishDate) return "undated";
  if (today < startDate) return "notStarted";
  if (today <= finishDate) return "running";
  if (input.laterSprintStarted) return "ended";
  return toMs(today) - toMs(finishDate) > OVERDUE_LIMIT_DAYS * DAY_MS ? "inactive" : "overdue";
}

/** Each team's latest dated sprint that has started, whatever its age. */
export function latestStartedSprints<T extends SprintCandidate>(
  candidates: readonly T[],
  today: string,
): T[] {
  const byTeam = new Map<string, T>();
  for (const sprint of candidates) {
    if (!sprint.startDate || !sprint.finishDate || sprint.startDate > today) continue;
    const key = `${sprint.tenantId}:${sprint.teamId}`;
    const current = byTeam.get(key);
    if (!current || sprint.startDate > (current.startDate ?? "")) byTeam.set(key, sprint);
  }
  return [...byTeam.values()];
}

/**
 * The sprint each team is working in: its latest dated sprint that has
 * started (dates from Azure), while it is running or overdue (ADR-028). A
 * team with no new sprint for OVERDUE_LIMIT_DAYS after the last one ended
 * has no scheduled sprint until Azure has a new one.
 */
export function pickScheduledSprints(
  candidates: readonly SprintCandidate[],
  today: string,
): SprintCandidate[] {
  return latestStartedSprints(candidates, today)
    .filter((sprint) => {
      const phase = sprintPhase({
        startDate: sprint.startDate,
        finishDate: sprint.finishDate,
        today,
        laterSprintStarted: false,
      });
      return phase === "running" || phase === "overdue";
    })
    .sort((a, b) =>
      `${a.tenantId}:${a.teamIterationId}`.localeCompare(`${b.tenantId}:${b.teamIterationId}`),
    );
}
