/**
 * Pure work item hierarchy rules (ADR-024).
 *
 * The project's full tree from Azure parent links — Epic → Feature → Story →
 * Task / Bug (whatever the process defines) — with a roll-up at every node
 * built from the same scope rule the analytics use (ADR-021/023): only scope
 * items with no scope below them count, so containers never double count
 * and tasks never count. Items whose parent is not synchronized are kept as
 * roots and flagged, never hidden.
 */
import type { StateCategory } from "@/types/domain/work-item";
import {
  deliverableScope,
  descendantsOf,
  rollUpProgress,
  type HierarchyItem,
} from "@/lib/delivery/deliverable-rules";

export type BacklogLevel = "portfolio" | "requirement" | "task" | "bug";

export interface HierarchyInput extends HierarchyItem {
  readonly state: string;
  readonly backlogLevel: BacklogLevel | null;
  readonly assignee: string | null;
  readonly remainingWork: number | null;
  readonly boardColumn: string | null;
  readonly isBlocked: boolean;
  readonly tags: readonly string[];
  readonly azureUrl: string | null;
  readonly changedAt: string | null;
}

export interface NodeRollup {
  /** Every item below, at any depth. */
  readonly descendants: number;
  readonly scopeItems: number;
  readonly completedScope: number;
  readonly progressPercent: number | null;
  readonly progressBasis: "points" | "count" | null;
  readonly remainingPoints: number | null;
  readonly tasks: number;
  readonly tasksDone: number;
  readonly bugs: number;
  readonly openBugs: number;
  readonly blocked: number;
  /** Open stories, tasks and bugs below with nobody assigned. */
  readonly unassignedOpen: number;
  /** Remaining hours on open tasks below; null when none has any. */
  readonly remainingHours: number | null;
}

export interface HierarchyRow extends HierarchyInput {
  /** Parent as synchronized; null for a root or when the parent is missing. */
  readonly effectiveParentId: number | null;
  /** True when Azure names a parent that is not synchronized. */
  readonly parentMissing: boolean;
  readonly depth: number;
  readonly childIds: readonly number[];
  readonly rollup: NodeRollup;
}

export interface HierarchyPayloadStats {
  readonly byType: readonly {
    readonly type: string;
    readonly level: BacklogLevel | null;
    readonly total: number;
    readonly completed: number;
    readonly scope: number;
  }[];
  readonly quality: {
    /** Requirement-level items with no parent (not under any Feature/Epic). */
    readonly requirementsWithoutParent: number;
    readonly tasksWithoutParent: number;
    readonly bugsWithoutParent: number;
    readonly parentMissing: number;
    readonly unestimatedRequirements: number;
    readonly tasksWithoutHours: number;
  };
}

const LEVEL_ORDER: Record<string, number> = { portfolio: 0, requirement: 1, bug: 2, task: 3 };
const levelRank = (level: BacklogLevel | null) => (level ? LEVEL_ORDER[level]! : 4);

const isOpen = (item: HierarchyInput) =>
  item.stateCategory !== "completed" && item.stateCategory !== "removed";

/** Tree rows in display order (depth-first), each with its roll-up. */
export function buildHierarchy(items: readonly HierarchyInput[]): {
  rows: HierarchyRow[];
  stats: HierarchyPayloadStats;
} {
  const byId = new Map(items.map((item) => [item.azureId, item]));
  const children = new Map<number, HierarchyInput[]>();
  const roots: HierarchyInput[] = [];
  for (const item of items) {
    const parent = item.parentAzureId !== null ? byId.get(item.parentAzureId) : undefined;
    if (parent && parent.azureId !== item.azureId) {
      const list = children.get(parent.azureId) ?? [];
      list.push(item);
      children.set(parent.azureId, list);
    } else {
      roots.push(item);
    }
  }
  const order = (a: HierarchyInput, b: HierarchyInput) =>
    levelRank(a.backlogLevel) - levelRank(b.backlogLevel) || a.azureId - b.azureId;

  const rows: HierarchyRow[] = [];
  const seen = new Set<number>();
  const visit = (item: HierarchyInput, depth: number) => {
    if (seen.has(item.azureId)) return;
    seen.add(item.azureId);
    const kids = [...(children.get(item.azureId) ?? [])].sort(order);
    rows.push({
      ...item,
      effectiveParentId:
        item.parentAzureId !== null && byId.has(item.parentAzureId) && depth > 0
          ? item.parentAzureId
          : null,
      parentMissing: item.parentAzureId !== null && !byId.has(item.parentAzureId),
      depth,
      childIds: kids.map((k) => k.azureId),
      rollup: rollupFor(item, items),
    });
    for (const kid of kids) visit(kid, depth + 1);
  };
  for (const root of [...roots].sort(order)) visit(root, 0);
  // Parent cycles leave items unreached; show them as roots rather than drop them.
  for (const item of items) if (!seen.has(item.azureId)) visit(item, 0);

  return { rows, stats: statsFor(items) };
}

function rollupFor(root: HierarchyInput, items: readonly HierarchyInput[]): NodeRollup {
  const below = descendantsOf(root.azureId, items) as HierarchyInput[];
  const scope = deliverableScope(root, below);
  const progress = rollUpProgress(scope);
  const tasks = below.filter((d) => d.backlogLevel === "task");
  const bugs = below.filter((d) => d.backlogLevel === "bug");
  const withHours = tasks.filter((d) => isOpen(d) && typeof d.remainingWork === "number");
  return {
    descendants: below.length,
    scopeItems: progress.scopeItems,
    completedScope: progress.completedItems,
    progressPercent: progress.percent,
    progressBasis: progress.basis,
    remainingPoints: progress.remainingPoints,
    tasks: tasks.length,
    tasksDone: tasks.filter((d) => d.stateCategory === "completed").length,
    bugs: bugs.length,
    openBugs: bugs.filter(isOpen).length,
    blocked: below.filter((d) => d.isBlocked && isOpen(d)).length,
    // Containers are rarely assigned; only work items count here.
    unassignedOpen: below.filter(
      (d) =>
        isOpen(d) &&
        !d.assignee &&
        (d.backlogLevel === "requirement" || d.backlogLevel === "task" || d.backlogLevel === "bug"),
    ).length,
    remainingHours:
      withHours.length > 0
        ? Math.round(withHours.reduce((sum, d) => sum + (d.remainingWork ?? 0), 0) * 10) / 10
        : null,
  };
}

function statsFor(items: readonly HierarchyInput[]): HierarchyPayloadStats {
  const byType = new Map<
    string,
    { type: string; level: BacklogLevel | null; total: number; completed: number; scope: number }
  >();
  for (const item of items) {
    const entry = byType.get(item.type) ?? {
      type: item.type,
      level: item.backlogLevel,
      total: 0,
      completed: 0,
      scope: 0,
    };
    entry.total += 1;
    if (item.stateCategory === "completed") entry.completed += 1;
    if (item.countsTowardScope && item.stateCategory !== "removed") entry.scope += 1;
    byType.set(item.type, entry);
  }
  const ids = new Set(items.map((i) => i.azureId));
  const noParent = (level: BacklogLevel) =>
    items.filter((i) => i.backlogLevel === level && i.parentAzureId === null).length;
  return {
    byType: [...byType.values()].sort(
      (a, b) => levelRank(a.level) - levelRank(b.level) || a.type.localeCompare(b.type),
    ),
    quality: {
      requirementsWithoutParent: noParent("requirement"),
      tasksWithoutParent: noParent("task"),
      bugsWithoutParent: noParent("bug"),
      parentMissing: items.filter((i) => i.parentAzureId !== null && !ids.has(i.parentAzureId))
        .length,
      unestimatedRequirements: items.filter(
        (i) =>
          i.backlogLevel === "requirement" &&
          i.stateCategory !== "removed" &&
          !(typeof i.estimate === "number" && i.estimate > 0),
      ).length,
      tasksWithoutHours: items.filter(
        (i) => i.backlogLevel === "task" && isOpen(i) && i.remainingWork === null,
      ).length,
    },
  };
}

/** Rows to show for a search: every match plus its ancestors, in tree order. */
export function filterRows(
  rows: readonly HierarchyRow[],
  predicate: (row: HierarchyRow) => boolean,
): HierarchyRow[] {
  const byId = new Map(rows.map((r) => [r.azureId, r]));
  const keep = new Set<number>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    for (let at: HierarchyRow | undefined = row; at && !keep.has(at.azureId);) {
      keep.add(at.azureId);
      at = at.effectiveParentId !== null ? byId.get(at.effectiveParentId) : undefined;
    }
  }
  return rows.filter((r) => keep.has(r.azureId));
}

export type { StateCategory };
