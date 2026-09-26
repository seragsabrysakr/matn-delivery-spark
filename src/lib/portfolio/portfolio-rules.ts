/**
 * Pure portfolio rules (ADR-028): one status per team's current sprint, so
 * the Overview can open on where every project stands. Every input is a
 * number already computed from Azure data; nothing here is estimated.
 */
import type { SprintPhase } from "@/lib/scheduler/scheduler-rules";

/** Stories this many points behind the straight-line pace mark a sprint as behind. */
export const BEHIND_PACE_POINTS = 15;

export type PortfolioStatus = "late" | "behind" | "attention" | "onTrack" | "idle";

export interface PortfolioSignals {
  readonly phase: SprintPhase;
  readonly storiesPercent: number | null;
  readonly expectedPercent: number | null;
  readonly stuck: number;
  readonly storiesBehindTasks: number;
}

/**
 * idle: no sprint for OVERDUE_LIMIT_DAYS (or none dated); late: past its
 * finish date with no new sprint; behind: stories under the pace; attention:
 * stuck work or stories not moved while their tasks did; otherwise on track.
 */
export function portfolioStatus(s: PortfolioSignals): PortfolioStatus {
  if (s.phase === "inactive" || s.phase === "undated" || s.phase === "ended") return "idle";
  if (s.phase === "overdue") return "late";
  if (
    s.phase === "running" &&
    s.storiesPercent !== null &&
    s.expectedPercent !== null &&
    s.expectedPercent - s.storiesPercent >= BEHIND_PACE_POINTS
  ) {
    return "behind";
  }
  if (s.stuck > 0 || s.storiesBehindTasks > 0) return "attention";
  return "onTrack";
}

const RANK: Record<PortfolioStatus, number> = {
  late: 0,
  behind: 1,
  attention: 2,
  onTrack: 3,
  idle: 4,
};

/** Problems first; within a status, more stuck work first, then by name. */
export function sortPortfolio<
  T extends { readonly status: PortfolioStatus; readonly stuck: number; readonly name: string },
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || b.stuck - a.stuck || a.name.localeCompare(b.name),
  );
}
