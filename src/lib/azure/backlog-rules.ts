/**
 * Pure rules for the project backlog sync (ADR-014).
 *
 * The backlog is every open work item in the areas the project's teams own,
 * regardless of iteration. "Open" comes from the synchronized Azure state
 * metadata (ADR-013), per work item type — never from hardcoded state names.
 * After the first full pass, runs are incremental on `System.ChangedDate`;
 * a full reconcile runs at most once a day to catch items that left scope.
 */
import type { StateCategory } from "@/types/domain/work-item";
import { escapeWiqlLiteral } from "./wiql";

/** A full reconcile is forced when the last one is older than this. */
export const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60_000;
/** Incremental queries re-read this much before the watermark (clock skew, in-flight saves). */
export const WATERMARK_OVERLAP_MS = 5 * 60_000;
/** `ops_sync_cursors.entity_kind` for the per-project backlog watermark. */
export const BACKLOG_CURSOR_KIND = "work_items_backlog";

export interface TeamArea {
  readonly teamId: string;
  readonly path: string;
  readonly includeChildren: boolean;
}

export type BacklogMode = "full" | "incremental";

const CLOSED_CATEGORIES: readonly StateCategory[] = ["completed", "removed"];

/**
 * Open states per work item type from synced metadata. A state whose category
 * is unknown counts as open, so nothing is silently dropped from the backlog.
 * Types with no synced states are absent: they cannot be filtered safely.
 */
export function openStatesByType(
  rows: readonly {
    readonly workItemType: string;
    readonly stateName: string;
    readonly stateCategory: StateCategory;
  }[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const known = new Set<string>();
  for (const row of rows) {
    known.add(row.workItemType);
    if (CLOSED_CATEGORIES.includes(row.stateCategory)) continue;
    (result[row.workItemType] ??= []).push(row.stateName);
  }
  // A type whose every state is closed keeps an empty list: nothing of it is open.
  for (const type of known) result[type] ??= [];
  return result;
}

/** Deduplicates areas; a child area already covered by an including parent is dropped. */
export function normalizeTeamAreas(areas: readonly TeamArea[]): TeamArea[] {
  const unique = new Map<string, TeamArea>();
  for (const area of areas) {
    const path = area.path.trim();
    if (!path) continue;
    const key = path.toLowerCase();
    const prior = unique.get(key);
    if (!prior || (area.includeChildren && !prior.includeChildren)) {
      unique.set(key, { ...area, path });
    }
  }
  const list = [...unique.values()];
  return list.filter(
    (area) =>
      !list.some(
        (other) =>
          other !== area &&
          other.includeChildren &&
          isUnder(area.path, other.path) &&
          other.path.toLowerCase() !== area.path.toLowerCase(),
      ),
  );
}

const isUnder = (path: string, ancestor: string): boolean => {
  const p = path.toLowerCase();
  const a = ancestor.toLowerCase();
  return p === a || p.startsWith(`${a}\\`);
};

export interface BacklogWiqlInput {
  readonly projectName: string;
  readonly areas: readonly TeamArea[];
  readonly workItemTypes: readonly string[];
  readonly mode: BacklogMode;
  /** Full mode: open states per type. Types missing here are skipped. */
  readonly openStates?: Readonly<Record<string, readonly string[]>> | undefined;
  /** Incremental mode: ISO instant; items changed strictly after it. */
  readonly changedSince?: string | undefined;
}

export interface BacklogWiql {
  readonly query: string;
  /** Types left out of a full query because no state metadata was synced for them. */
  readonly skippedTypes: readonly string[];
}

/**
 * Full mode: open items (per-type open states) in the team areas.
 * Incremental mode: anything changed since the watermark in those areas, with
 * no state filter, so closures and removals are picked up too.
 */
export function buildBacklogWiql(input: BacklogWiqlInput): BacklogWiql | null {
  const areas = normalizeTeamAreas(input.areas);
  if (areas.length === 0 || input.workItemTypes.length === 0) return null;

  const areaClause = areas
    .map(
      (area) =>
        `[System.AreaPath] ${area.includeChildren ? "UNDER" : "="} '${escapeWiqlLiteral(area.path)}'`,
    )
    .join(" OR ");

  const where: string[] = [
    `[System.TeamProject] = '${escapeWiqlLiteral(input.projectName)}'`,
    `(${areaClause})`,
  ];
  const skippedTypes: string[] = [];

  if (input.mode === "incremental") {
    if (!input.changedSince || !Number.isFinite(Date.parse(input.changedSince))) return null;
    const types = input.workItemTypes.map((type) => `'${escapeWiqlLiteral(type)}'`).join(", ");
    where.push(`[System.WorkItemType] IN (${types})`);
    where.push(
      `[System.ChangedDate] > '${escapeWiqlLiteral(new Date(input.changedSince).toISOString())}'`,
    );
  } else {
    const perType: string[] = [];
    for (const type of input.workItemTypes) {
      const states = lookupCaseInsensitive(input.openStates ?? {}, type);
      if (states === undefined) {
        skippedTypes.push(type);
        continue;
      }
      if (states.length === 0) continue;
      const list = states.map((state) => `'${escapeWiqlLiteral(state)}'`).join(", ");
      perType.push(
        `([System.WorkItemType] = '${escapeWiqlLiteral(type)}' AND [System.State] IN (${list}))`,
      );
    }
    if (perType.length === 0) return { query: "", skippedTypes };
    where.push(`(${perType.join(" OR ")})`);
  }

  return {
    query: `SELECT [System.Id] FROM WorkItems WHERE ${where.join(" AND ")} ORDER BY [System.Id]`,
    skippedTypes,
  };
}

const lookupCaseInsensitive = <T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined => {
  if (key in record) return record[key];
  const lower = key.toLowerCase();
  const match = Object.keys(record).find((k) => k.toLowerCase() === lower);
  return match === undefined ? undefined : record[match];
};

/**
 * The team that owns an area path: the most specific matching team area.
 * On a tie the current owner is kept when it is one of the candidates;
 * otherwise the lowest team id wins, so the choice is deterministic.
 */
export function resolveOwningTeam(
  areaPath: string,
  areas: readonly TeamArea[],
  currentTeamId: string | null = null,
): string | null {
  let bestDepth = -1;
  let candidates: string[] = [];
  for (const area of areas) {
    const matches = area.includeChildren
      ? isUnder(areaPath, area.path)
      : areaPath.toLowerCase() === area.path.toLowerCase();
    if (!matches) continue;
    const depth = area.path.split("\\").length;
    if (depth > bestDepth) {
      bestDepth = depth;
      candidates = [area.teamId];
    } else if (depth === bestDepth && !candidates.includes(area.teamId)) {
      candidates.push(area.teamId);
    }
  }
  if (candidates.length === 0) return null;
  if (currentTeamId && candidates.includes(currentTeamId)) return currentTeamId;
  return [...candidates].sort()[0]!;
}

export interface BacklogCursorState {
  readonly watermarkAt: string | null;
  readonly lastFullReconcileAt: string | null;
}

/** `ops_sync_cursors.watermark_token` carries the last full reconcile instant. */
export function parseBacklogToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const value = (JSON.parse(token) as { lastFullReconcileAt?: unknown }).lastFullReconcileAt;
    return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export const serializeBacklogToken = (lastFullReconcileAt: string): string =>
  JSON.stringify({ lastFullReconcileAt });

/** Full on the first run and at most once a day after that; incremental otherwise. */
export function decideBacklogMode(state: BacklogCursorState | null, nowMs: number): BacklogMode {
  if (!state?.watermarkAt || !Number.isFinite(Date.parse(state.watermarkAt))) return "full";
  const full = state.lastFullReconcileAt ? Date.parse(state.lastFullReconcileAt) : Number.NaN;
  if (!Number.isFinite(full) || nowMs - full >= FULL_RECONCILE_INTERVAL_MS) return "full";
  return "incremental";
}

/** The instant an incremental query starts from: the watermark minus the overlap. */
export function incrementalSince(watermarkAt: string): string {
  return new Date(Date.parse(watermarkAt) - WATERMARK_OVERLAP_MS).toISOString();
}

/** The later of two ISO instants; null-safe. */
export function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

export type BacklogPlacement = "in_sprint" | "in_backlog" | "closed";

/**
 * Where an item sits for a team right now: in one of its current sprints, in
 * the backlog (open, not in a current sprint), or closed.
 */
export function classifyPlacement(
  item: { readonly iterationId: string | null; readonly stateCategory: StateCategory },
  currentIterationIds: ReadonlySet<string>,
): BacklogPlacement {
  if (CLOSED_CATEGORIES.includes(item.stateCategory)) return "closed";
  if (item.iterationId && currentIterationIds.has(item.iterationId)) return "in_sprint";
  return "in_backlog";
}
