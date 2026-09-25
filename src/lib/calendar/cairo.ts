/**
 * Africa/Cairo working calendar (Sun–Thu).
 *
 * Pure and date-only: every helper works on `YYYY-MM-DD` strings so no
 * timezone drift can happen between the browser, the worker and Postgres.
 */

export const CAIRO_TIME_ZONE = "Africa/Cairo";

/** Sunday..Thursday, expressed as JS `getUTCDay()` values. */
export const CAIRO_WORKING_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const cairoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current Cairo calendar date as `YYYY-MM-DD`. */
export function cairoToday(now: Date = new Date()): string {
  return cairoFormatter.format(now);
}

export function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY.test(value);
}

const toUtc = (dateOnly: string): number => Date.parse(`${dateOnly}T00:00:00Z`);

export function weekdayOf(dateOnly: string): number {
  return new Date(toUtc(dateOnly)).getUTCDay();
}

export function isWorkingDay(
  dateOnly: string,
  weekdays: readonly number[] = CAIRO_WORKING_WEEKDAYS,
): boolean {
  return weekdays.includes(weekdayOf(dateOnly));
}

/** Inclusive count of working days between two date-only values. */
export function countWorkingDays(
  start: string,
  end: string,
  weekdays: readonly number[] = CAIRO_WORKING_WEEKDAYS,
): number {
  if (!isDateOnly(start) || !isDateOnly(end)) return 0;
  const from = toUtc(start);
  const to = toUtc(end);
  if (to < from) return 0;
  let count = 0;
  for (let ms = from; ms <= to; ms += 86_400_000) {
    if (weekdays.includes(new Date(ms).getUTCDay())) count += 1;
  }
  return count;
}

export interface SprintCalendar {
  readonly startDate: string;
  readonly finishDate: string;
  readonly totalWorkingDays: number;
  /** Working days already elapsed, clamped to the sprint window. */
  readonly elapsedWorkingDays: number;
  readonly currentWorkingDay: number;
  readonly expectedCompletionPercent: number;
}

/**
 * Returns null whenever the sprint dates are missing or invalid — callers must
 * surface "unavailable" rather than inventing a schedule.
 */
export function sprintCalendar(
  start: string | null | undefined,
  finish: string | null | undefined,
  today: string,
  weekdays: readonly number[] = CAIRO_WORKING_WEEKDAYS,
): SprintCalendar | null {
  if (!isDateOnly(start) || !isDateOnly(finish) || !isDateOnly(today)) return null;
  if (toUtc(finish) < toUtc(start)) return null;
  const totalWorkingDays = countWorkingDays(start, finish, weekdays);
  if (totalWorkingDays <= 0) return null;

  const clampedToday =
    toUtc(today) < toUtc(start) ? start : toUtc(today) > toUtc(finish) ? finish : today;
  const elapsed = toUtc(today) < toUtc(start) ? 0 : countWorkingDays(start, clampedToday, weekdays);
  const currentWorkingDay = Math.min(Math.max(elapsed, 0), totalWorkingDays);

  return {
    startDate: start,
    finishDate: finish,
    totalWorkingDays,
    elapsedWorkingDays: currentWorkingDay,
    currentWorkingDay,
    expectedCompletionPercent: Math.round((currentWorkingDay / totalWorkingDays) * 100),
  };
}

/** True when `today` falls inside the sprint window (inclusive). */
export function containsDate(start: string | null, finish: string | null, today: string): boolean {
  if (!isDateOnly(start) || !isDateOnly(finish) || !isDateOnly(today)) return false;
  return toUtc(start) <= toUtc(today) && toUtc(today) <= toUtc(finish);
}
