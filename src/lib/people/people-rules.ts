/**
 * Pure rules for the People page (ADR-026): for each person, the sprint work
 * they hold (done / in progress / not started / stuck) and what they did in
 * Azure on the team's previous working day, from revision history (ADR-017).
 * Activity is attributed to whoever made the change (the mover), ownership to
 * the assignee. A person holding work in progress who has changed nothing in
 * Azure for a while gets a no-update alert.
 */
import { weekdayOf } from "@/lib/calendar/cairo";
import {
  computeStuckItems,
  type BoardFact,
  type RealWorkItemFact,
} from "@/lib/overview/overview-rules";
import { workingDaysSince, type StuckSettings } from "@/lib/overview/stuck-rules";

/** Working days without any change in Azure before a person with open work is flagged. */
export const NO_UPDATE_WORKING_DAYS = 2;
/** At most this many items are listed per person for the previous working day. */
export const MAX_ACTIVITY_ITEMS = 25;

export interface PersonFact {
  readonly id: string;
  readonly displayName: string;
}

/** One stored Azure revision, made by `memberId`. */
export interface RevisionFact {
  readonly memberId: string;
  readonly azureId: number;
  readonly title: string;
  readonly azureUrl: string | null;
  readonly revisedAt: string;
}

/** One stored state transition, made by `memberId`. */
export interface TransitionFact {
  readonly memberId: string;
  readonly azureId: number;
  readonly occurredAt: string;
  readonly fromState: string | null;
  readonly toState: string;
}

export interface ActivityItem {
  readonly azureId: number;
  readonly title: string;
  readonly azureUrl: string | null;
  readonly moves: readonly { readonly from: string | null; readonly to: string }[];
  /** Revisions that day, state moves included. */
  readonly changes: number;
}

export interface PersonItemRef {
  readonly azureId: number;
  readonly title: string;
  readonly azureUrl: string | null;
}

export interface PersonRow {
  readonly memberId: string;
  readonly displayName: string;
  readonly total: number;
  readonly done: number;
  readonly inProgress: number;
  readonly notStarted: number;
  /** Items whose state category Azure did not map; counted in total only. */
  readonly unknownState: number;
  readonly stuck: readonly PersonItemRef[];
  readonly lastActivityAt: string | null;
  /** Working days since the last change; null when none is in the window read. */
  readonly idleWorkingDays: number | null;
  readonly noUpdate: boolean;
  readonly yesterday: readonly ActivityItem[];
  /** True when the list was cut at MAX_ACTIVITY_ITEMS. */
  readonly yesterdayTruncated: boolean;
}

export interface PeopleView {
  /** The team's previous working day (local date) the activity refers to. */
  readonly previousWorkingDay: string | null;
  readonly people: readonly PersonRow[];
  readonly unassignedOpen: number;
}

/** Calendar date of an instant in a time zone (YYYY-MM-DD); null when unusable. */
export function localDateOf(iso: string, timeZone: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

const addDays = (dateOnly: string, days: number): string =>
  new Date(Date.parse(`${dateOnly}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The last working day strictly before `today`; null when none within two weeks. */
export function previousWorkingDay(
  today: string,
  workingWeekdays: readonly number[],
): string | null {
  for (let back = 1; back <= 14; back += 1) {
    const day = addDays(today, -back);
    if (workingWeekdays.includes(weekdayOf(day))) return day;
  }
  return null;
}

const OPEN = (f: RealWorkItemFact) =>
  f.stateCategory !== "completed" && f.stateCategory !== "removed";

export function buildPeople(input: {
  readonly members: readonly PersonFact[];
  readonly facts: readonly RealWorkItemFact[];
  readonly boards: readonly BoardFact[];
  readonly revisions: readonly RevisionFact[];
  readonly transitions: readonly TransitionFact[];
  readonly nowIso: string;
  readonly settings: StuckSettings;
}): PeopleView {
  const { facts, nowIso, settings } = input;
  const tz = settings.timeZone;
  const today = localDateOf(nowIso, tz);
  const prevDay = today ? previousWorkingDay(today, settings.workingWeekdays) : null;

  const live = facts.filter((f) => f.stateCategory !== "removed");
  const stuckByMember = new Map<string, PersonItemRef[]>();
  for (const { fact } of computeStuckItems(live, input.boards, nowIso, settings)) {
    if (!fact.assignedToMemberId) continue;
    const list = stuckByMember.get(fact.assignedToMemberId) ?? [];
    list.push({ azureId: fact.azureWorkItemId, title: fact.title, azureUrl: fact.azureUrl });
    stuckByMember.set(fact.assignedToMemberId, list);
  }

  const lastActivity = new Map<string, string>();
  const dayRevisions = new Map<string, RevisionFact[]>();
  for (const rev of input.revisions) {
    const prior = lastActivity.get(rev.memberId);
    if (!prior || Date.parse(rev.revisedAt) > Date.parse(prior)) {
      lastActivity.set(rev.memberId, rev.revisedAt);
    }
    if (prevDay && localDateOf(rev.revisedAt, tz) === prevDay) {
      const list = dayRevisions.get(rev.memberId) ?? [];
      list.push(rev);
      dayRevisions.set(rev.memberId, list);
    }
  }
  const dayMoves = new Map<string, TransitionFact[]>();
  for (const move of input.transitions) {
    if (!prevDay || localDateOf(move.occurredAt, tz) !== prevDay) continue;
    const key = `${move.memberId}:${move.azureId}`;
    const list = dayMoves.get(key) ?? [];
    list.push(move);
    dayMoves.set(key, list);
  }

  // Team members plus anyone holding sprint work, so every item has an owner row.
  const names = new Map(input.members.map((m) => [m.id, m.displayName]));
  const ids = new Set(input.members.map((m) => m.id));
  for (const f of live)
    if (f.assignedToMemberId && names.has(f.assignedToMemberId)) ids.add(f.assignedToMemberId);

  const people = [...ids].map<PersonRow>((memberId) => {
    const mine = live.filter((f) => f.assignedToMemberId === memberId);
    const inProgress = mine.filter(
      (f) => f.stateCategory === "inProgress" || f.stateCategory === "resolved",
    ).length;
    const last = lastActivity.get(memberId) ?? null;
    const idle = last ? workingDaysSince(last, nowIso, settings) : null;

    const byItem = new Map<number, RevisionFact[]>();
    for (const rev of dayRevisions.get(memberId) ?? []) {
      const list = byItem.get(rev.azureId) ?? [];
      list.push(rev);
      byItem.set(rev.azureId, list);
    }
    const activity = [...byItem.entries()]
      .map<ActivityItem>(([azureId, revs]) => ({
        azureId,
        title: revs[0]!.title,
        azureUrl: revs[0]!.azureUrl,
        moves: (dayMoves.get(`${memberId}:${azureId}`) ?? [])
          .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
          .map((m) => ({ from: m.fromState, to: m.toState })),
        changes: revs.length,
      }))
      // Items that changed state first, then the most edited.
      .sort(
        (a, b) => b.moves.length - a.moves.length || b.changes - a.changes || a.azureId - b.azureId,
      );

    return {
      memberId,
      displayName: names.get(memberId) ?? "—",
      total: mine.length,
      done: mine.filter((f) => f.stateCategory === "completed").length,
      inProgress,
      notStarted: mine.filter((f) => f.stateCategory === "proposed").length,
      unknownState: mine.filter((f) => f.stateCategory === "unknown").length,
      stuck: stuckByMember.get(memberId) ?? [],
      lastActivityAt: last,
      idleWorkingDays: idle,
      noUpdate: inProgress > 0 && (idle === null || idle >= NO_UPDATE_WORKING_DAYS),
      yesterday: activity.slice(0, MAX_ACTIVITY_ITEMS),
      yesterdayTruncated: activity.length > MAX_ACTIVITY_ITEMS,
    };
  });

  // Who needs attention first: no-update alerts, then stuck work, then by name.
  people.sort(
    (a, b) =>
      Number(b.noUpdate) - Number(a.noUpdate) ||
      b.stuck.length - a.stuck.length ||
      a.displayName.localeCompare(b.displayName),
  );

  return {
    previousWorkingDay: prevDay,
    people,
    unassignedOpen: live.filter((f) => OPEN(f) && !f.assignedToMemberId).length,
  };
}
