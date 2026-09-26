/**
 * Pure rules for work item revision history (ADR-017).
 *
 * Revisions are Azure DevOps's own immutable change log. From them we derive
 * who changed what and when (ChangedBy, distinct from AssignedTo), every state
 * transition with the time spent in the previous state, sprint scope changes
 * (added / removed / re-estimated) and the exact moment an item entered its
 * current board column.
 */
import type { StateCategory } from "@/types/domain/work-item";

export interface RevisionRecord {
  readonly rev: number;
  /** `System.ChangedDate` of this revision (the creation time for rev 1). */
  readonly revisedAt: string;
  readonly revisedByMemberId: string | null;
  readonly state: string | null;
  readonly stateCategory: StateCategory;
  readonly iterationPath: string | null;
  readonly areaPath: string | null;
  readonly estimate: number | null;
  readonly assignedToMemberId: string | null;
  readonly boardColumn: string | null;
}

/** Revisions in rev order, one per rev (a later duplicate wins). */
export function normalizeRevisions(revisions: readonly RevisionRecord[]): RevisionRecord[] {
  const byRev = new Map<number, RevisionRecord>();
  for (const revision of revisions) {
    if (Number.isInteger(revision.rev) && revision.rev > 0) byRev.set(revision.rev, revision);
  }
  return [...byRev.values()].sort((a, b) => a.rev - b.rev);
}

/** True when the history starts at rev 1 and has no gaps up to `latestRev`. */
export function isCompleteHistory(
  revisions: readonly RevisionRecord[],
  latestRev: number,
): boolean {
  const sorted = normalizeRevisions(revisions);
  if (sorted.length === 0 || sorted[0]!.rev !== 1) return false;
  for (let i = 0; i < sorted.length; i += 1) if (sorted[i]!.rev !== i + 1) return false;
  return sorted[sorted.length - 1]!.rev >= latestRev;
}

export interface Transition {
  readonly occurredAt: string;
  readonly fromState: string | null;
  readonly toState: string;
  readonly fromStateCategory: StateCategory;
  readonly toStateCategory: StateCategory;
  /** Seconds spent in `fromState`; null for the initial state. */
  readonly durationSeconds: number | null;
  readonly changedByMemberId: string | null;
  readonly sourceRev: number;
}

const seconds = (fromIso: string, toIso: string): number | null => {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return Number.isFinite(from) && Number.isFinite(to)
    ? Math.max(0, Math.round((to - from) / 1000))
    : null;
};

const same = (a: string | null, b: string | null): boolean =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * One transition per state change, including the initial state at creation.
 * Only a complete history (from rev 1) yields the initial transition and a
 * trustworthy first duration.
 */
export function deriveTransitions(revisions: readonly RevisionRecord[]): Transition[] {
  const sorted = normalizeRevisions(revisions);
  const transitions: Transition[] = [];
  let previous: RevisionRecord | null = null;
  let enteredAt: string | null = null;
  for (const revision of sorted) {
    if (!revision.state) {
      previous = revision;
      continue;
    }
    if (!previous || !previous.state) {
      if (revision.rev === 1) {
        transitions.push({
          occurredAt: revision.revisedAt,
          fromState: null,
          toState: revision.state,
          fromStateCategory: "unknown",
          toStateCategory: revision.stateCategory,
          durationSeconds: null,
          changedByMemberId: revision.revisedByMemberId,
          sourceRev: revision.rev,
        });
        enteredAt = revision.revisedAt;
      }
    } else if (!same(previous.state, revision.state)) {
      transitions.push({
        occurredAt: revision.revisedAt,
        fromState: previous.state,
        toState: revision.state,
        fromStateCategory: previous.stateCategory,
        toStateCategory: revision.stateCategory,
        durationSeconds: enteredAt ? seconds(enteredAt, revision.revisedAt) : null,
        changedByMemberId: revision.revisedByMemberId,
        sourceRev: revision.rev,
      });
      enteredAt = revision.revisedAt;
    }
    previous = revision;
  }
  return transitions;
}

export interface ScopeChange {
  readonly iterationId: string;
  readonly occurredAt: string;
  readonly changeType: "added" | "removed" | "reestimated";
  readonly estimateDelta: number | null;
  readonly sourceRev: number;
}

/**
 * Sprint membership changes from the iteration path history, plus
 * re-estimates while the item stays in a sprint. Paths that are not a
 * synchronized iteration (e.g. the backlog root) produce no rows.
 */
export function deriveScopeChanges(
  revisions: readonly RevisionRecord[],
  iterationIdByPath: ReadonlyMap<string, string>,
): ScopeChange[] {
  const sorted = normalizeRevisions(revisions);
  const iterationOf = (path: string | null) =>
    path ? (iterationIdByPath.get(path.trim().toLowerCase()) ?? null) : null;
  const changes: ScopeChange[] = [];
  let previous: RevisionRecord | null = null;
  for (const revision of sorted) {
    const current = iterationOf(revision.iterationPath);
    const before = previous ? iterationOf(previous.iterationPath) : null;
    if (!previous) {
      if (revision.rev === 1 && current) {
        changes.push({
          iterationId: current,
          occurredAt: revision.revisedAt,
          changeType: "added",
          estimateDelta: revision.estimate,
          sourceRev: revision.rev,
        });
      }
    } else if (before !== current) {
      if (before) {
        changes.push({
          iterationId: before,
          occurredAt: revision.revisedAt,
          changeType: "removed",
          estimateDelta: previous.estimate === null ? null : -previous.estimate,
          sourceRev: revision.rev,
        });
      }
      if (current) {
        changes.push({
          iterationId: current,
          occurredAt: revision.revisedAt,
          changeType: "added",
          estimateDelta: revision.estimate,
          sourceRev: revision.rev,
        });
      }
    } else if (current && (previous.estimate ?? null) !== (revision.estimate ?? null)) {
      changes.push({
        iterationId: current,
        occurredAt: revision.revisedAt,
        changeType: "reestimated",
        estimateDelta: (revision.estimate ?? 0) - (previous.estimate ?? 0),
        sourceRev: revision.rev,
      });
    }
    previous = revision;
  }
  return changes;
}

/**
 * When the item entered its latest board column, from a complete history.
 * Null when the history is incomplete or the item was never on a board.
 */
export function deriveColumnEntry(
  revisions: readonly RevisionRecord[],
  latestRev: number,
): { readonly column: string; readonly enteredAt: string } | null {
  if (!isCompleteHistory(revisions, latestRev)) return null;
  let column: string | null = null;
  let enteredAt: string | null = null;
  for (const revision of normalizeRevisions(revisions)) {
    if (!same(column, revision.boardColumn)) {
      column = revision.boardColumn;
      enteredAt = revision.boardColumn ? revision.revisedAt : null;
    }
  }
  return column && enteredAt ? { column, enteredAt } : null;
}
