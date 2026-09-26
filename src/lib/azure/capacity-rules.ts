/**
 * Pure sprint capacity rules (ADR-019).
 *
 * Capacity comes from the team's own Azure DevOps capacity page: hours per
 * day per activity, personal days off, and team days off. Net capacity is
 * computed the way Azure does it: hours per day times the sprint's working
 * days (per the team's working weekdays) minus team and personal days off.
 * A member with no configured hours has unknown capacity (null), never 0.
 */

export interface DateRange {
  readonly start: string;
  readonly end: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DAY_MS = 86_400_000;

const dateOnly = (value: string): string | null => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1]! : null;
};

const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Team working weekdays (0 = Sunday) from Azure team settings; null when absent. */
export function weekdaysFromAzure(names: readonly string[] | null | undefined): number[] | null {
  if (!names || names.length === 0) return null;
  const days = [
    ...new Set(names.map((n) => WEEKDAYS.indexOf(n.trim().toLowerCase())).filter((d) => d >= 0)),
  ];
  return days.length > 0 ? days.sort((a, b) => a - b) : null;
}

/** Normalized date-only ranges (Azure sends midnight UTC timestamps, end inclusive). */
export function normalizeDateRanges(
  ranges: readonly { readonly start: string; readonly end: string }[] | null | undefined,
): DateRange[] {
  const out: DateRange[] = [];
  for (const range of ranges ?? []) {
    const start = dateOnly(range.start ?? "");
    const end = dateOnly(range.end ?? "") ?? start;
    if (!start || !end) continue;
    out.push(start <= end ? { start, end } : { start: end, end: start });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Every calendar date covered by the ranges. */
export function expandDateRanges(ranges: readonly DateRange[]): Set<string> {
  const days = new Set<string>();
  for (const range of ranges) {
    // Bounded: a single range never spans more than a year.
    for (let day = range.start, i = 0; day <= range.end && i < 366; day = addDays(day, 1), i += 1)
      days.add(day);
  }
  return days;
}

/** Working dates from `start` to `finish` inclusive, excluding `excluded`. */
export function workingDates(
  start: string,
  finish: string,
  workingWeekdays: readonly number[],
  excluded: ReadonlySet<string> = new Set(),
): string[] {
  const days: string[] = [];
  for (let day = start, i = 0; day <= finish && i < 366; day = addDays(day, 1), i += 1) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (workingWeekdays.includes(weekday) && !excluded.has(day)) days.push(day);
  }
  return days;
}

export interface MemberCapacityInput {
  readonly activities: readonly {
    readonly name: string | null;
    readonly capacityPerDay: number;
  }[];
  readonly daysOff: readonly { readonly start: string; readonly end: string }[];
}

export interface SprintCalendarInput {
  readonly startDate: string | null;
  readonly finishDate: string | null;
  readonly workingWeekdays: readonly number[];
  readonly teamDaysOff: readonly DateRange[];
}

export interface MemberCapacity {
  /** Sum of hours per day across activities. */
  readonly capacityPerDay: number;
  /** Activities with hours, e.g. "Development, Testing"; null when unnamed. */
  readonly activity: string | null;
  readonly daysOff: DateRange[];
  /** Sprint working days left after team and personal days off; null when undated. */
  readonly availableDays: number | null;
  /** capacityPerDay * availableDays; null when no hours are configured or undated. */
  readonly netHours: number | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function computeMemberCapacity(
  input: MemberCapacityInput,
  calendar: SprintCalendarInput,
): MemberCapacity {
  const active = input.activities.filter(
    (a) => Number.isFinite(a.capacityPerDay) && a.capacityPerDay > 0,
  );
  const capacityPerDay = round2(active.reduce((sum, a) => sum + a.capacityPerDay, 0));
  const names = [...new Set(active.map((a) => (a.name ?? "").trim()).filter((n) => n.length > 0))];
  const daysOff = normalizeDateRanges(input.daysOff);

  let availableDays: number | null = null;
  if (calendar.startDate && calendar.finishDate) {
    const excluded = expandDateRanges([...calendar.teamDaysOff, ...daysOff]);
    availableDays = workingDates(
      calendar.startDate,
      calendar.finishDate,
      calendar.workingWeekdays,
      excluded,
    ).length;
  }

  return {
    capacityPerDay,
    activity: names.length > 0 ? names.join(", ") : null,
    daysOff,
    availableDays,
    netHours:
      capacityPerDay > 0 && availableDays !== null ? round2(capacityPerDay * availableDays) : null,
  };
}

/**
 * Finds the synchronized member for an Azure identity: by descriptor or id
 * first, then by unique name (case-insensitive). Null when unknown.
 */
export function matchMember(
  identity: { readonly descriptor?: string; readonly id?: string; readonly uniqueName?: string },
  members: readonly {
    readonly id: string;
    readonly azureDescriptor: string;
    readonly azureUniqueName: string | null;
  }[],
): string | null {
  const keys = [identity.descriptor, identity.id].filter((k): k is string => Boolean(k));
  for (const key of keys) {
    const hit = members.find((m) => m.azureDescriptor === key);
    if (hit) return hit.id;
  }
  const unique = identity.uniqueName?.trim().toLowerCase();
  if (unique) {
    const hit = members.find((m) => m.azureUniqueName?.trim().toLowerCase() === unique);
    if (hit) return hit.id;
  }
  return null;
}
