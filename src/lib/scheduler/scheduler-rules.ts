/**
 * Pure scheduling rules (ADR-020): which sync is due for a current sprint.
 * The scheduler performs one bounded step per request, so a slow Azure
 * response never exceeds the Worker's limits; the caller repeats requests
 * until the tick reports idle.
 */

export type ScheduledSyncKind = "foundation" | "sprint" | "backlog" | "history";

/** Minimum time between completed runs of each kind. */
export const SYNC_INTERVAL_MS: Readonly<Record<ScheduledSyncKind, number>> = {
  // Projects, teams, iterations and members: picks up new sprints.
  foundation: 6 * 60 * 60_000,
  sprint: 15 * 60_000,
  backlog: 30 * 60_000,
  history: 30 * 60_000,
};

/** Per sprint, in order: history follows the items the sprint and backlog syncs wrote. */
export const SPRINT_SYNC_ORDER: readonly ScheduledSyncKind[] = ["sprint", "backlog", "history"];

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
 * The sprint each team is working in: its latest dated sprint that has
 * started (dates from Azure). Teams often keep working in a sprint past its
 * finish date before the next one is created, so a finished sprint stays
 * scheduled for one more sprint length — the team's own cadence — after
 * which the team has no scheduled sprint until Azure has a new one.
 */
export function pickScheduledSprints(
  candidates: readonly SprintCandidate[],
  today: string,
): SprintCandidate[] {
  const byTeam = new Map<string, SprintCandidate>();
  for (const sprint of candidates) {
    if (!sprint.startDate || !sprint.finishDate || sprint.startDate > today) continue;
    const key = `${sprint.tenantId}:${sprint.teamId}`;
    const current = byTeam.get(key);
    if (!current || sprint.startDate > (current.startDate ?? "")) byTeam.set(key, sprint);
  }
  const todayMs = toMs(today);
  return [...byTeam.values()]
    .filter((sprint) => {
      const finish = toMs(sprint.finishDate!);
      const length = finish - toMs(sprint.startDate!) + DAY_MS;
      return todayMs <= finish + length;
    })
    .sort((a, b) =>
      `${a.tenantId}:${a.teamIterationId}`.localeCompare(`${b.tenantId}:${b.teamIterationId}`),
    );
}
