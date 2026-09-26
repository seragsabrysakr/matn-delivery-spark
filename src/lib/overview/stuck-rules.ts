/**
 * Pure stuck-work detection (ADR-015).
 *
 * Every signal is read from Azure DevOps data already synchronized: the
 * Blocked field, the item's tags, the board column it sits in (and that
 * column's type), and when it entered that column. The only parameter that is
 * not Azure data is the time-in-column threshold, an analysis setting like a
 * KPI threshold; it is counted in the team's own working days.
 */
import { CAIRO_TIME_ZONE, CAIRO_WORKING_WEEKDAYS, countWorkingDays } from "@/lib/calendar/cairo";
import type { StateCategory } from "@/types/domain/work-item";

/** Working days an item may sit in one in-progress column before it is stuck. */
export const DEFAULT_STUCK_THRESHOLD_WORKING_DAYS = 3;
/** Tags that mark an item blocked, compared case-insensitively. */
export const DEFAULT_BLOCKED_TAGS: readonly string[] = ["Blocked"];

export type StuckReason = "blocked_field" | "blocked_tag" | "aged_in_column";
export type AgeBasis = "column_entry" | "state_change";
export type ColumnKind = "incoming" | "inProgress" | "outgoing" | "unknown";

export interface StuckCandidate {
  readonly stateCategory: StateCategory;
  readonly isBlocked: boolean;
  readonly tags: readonly string[];
  /** The kind of board column the item sits in, when it is on the team's board. */
  readonly columnKind: ColumnKind | null;
  readonly boardColumnEnteredAt: string | null;
  readonly stateChangeDate: string | null;
}

export interface StuckSettings {
  readonly thresholdWorkingDays: number;
  readonly blockedTags: readonly string[];
  readonly workingWeekdays: readonly number[];
  readonly timeZone: string;
}

export const defaultStuckSettings = (over: Partial<StuckSettings> = {}): StuckSettings => ({
  thresholdWorkingDays: DEFAULT_STUCK_THRESHOLD_WORKING_DAYS,
  blockedTags: DEFAULT_BLOCKED_TAGS,
  workingWeekdays: CAIRO_WORKING_WEEKDAYS,
  timeZone: CAIRO_TIME_ZONE,
  ...over,
});

export interface StuckAssessment {
  readonly stuck: boolean;
  readonly reasons: readonly StuckReason[];
  /** Working days in the current column; null when no entry time is known. */
  readonly workingDaysInColumn: number | null;
  /** What the age was measured from; state change is an upper-bound estimate. */
  readonly ageBasis: AgeBasis | null;
}

const localDate = (iso: string, timeZone: string): string | null => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
};

const nextDay = (dateOnly: string): string =>
  new Date(Date.parse(`${dateOnly}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Working days elapsed since an instant, in the team's calendar: the day of
 * entry does not count, today does. Null when the instant is unusable.
 */
export function workingDaysSince(
  fromIso: string | null,
  nowIso: string,
  settings: Pick<StuckSettings, "workingWeekdays" | "timeZone">,
): number | null {
  if (!fromIso) return null;
  const from = localDate(fromIso, settings.timeZone);
  const today = localDate(nowIso, settings.timeZone);
  if (!from || !today) return null;
  if (today <= from) return 0;
  return countWorkingDays(nextDay(from), today, settings.workingWeekdays);
}

const CLOSED: readonly StateCategory[] = ["completed", "removed"];

/**
 * Why an open item is stuck, if it is. Blocked (field or tag) applies to any
 * open item. Age applies only to items in an in-progress column — or, off the
 * board, to items whose state is in progress/resolved — so work waiting in
 * "New" or finished work is never reported as stuck.
 */
export function assessStuck(
  item: StuckCandidate,
  nowIso: string,
  settings: StuckSettings,
): StuckAssessment {
  if (CLOSED.includes(item.stateCategory)) {
    return { stuck: false, reasons: [], workingDaysInColumn: null, ageBasis: null };
  }

  const reasons: StuckReason[] = [];
  if (item.isBlocked) reasons.push("blocked_field");
  const blockedTags = new Set(settings.blockedTags.map((tag) => tag.trim().toLowerCase()));
  if (item.tags.some((tag) => blockedTags.has(tag.trim().toLowerCase()))) {
    reasons.push("blocked_tag");
  }

  const ageBasis: AgeBasis | null = item.boardColumnEnteredAt
    ? "column_entry"
    : item.stateChangeDate
      ? "state_change"
      : null;
  const workingDaysInColumn = workingDaysSince(
    item.boardColumnEnteredAt ?? item.stateChangeDate,
    nowIso,
    settings,
  );

  const inFlight =
    item.columnKind !== null && item.columnKind !== "unknown"
      ? item.columnKind === "inProgress"
      : item.stateCategory === "inProgress" || item.stateCategory === "resolved";
  if (
    inFlight &&
    workingDaysInColumn !== null &&
    workingDaysInColumn > settings.thresholdWorkingDays
  ) {
    reasons.push("aged_in_column");
  }

  return { stuck: reasons.length > 0, reasons, workingDaysInColumn, ageBasis };
}
