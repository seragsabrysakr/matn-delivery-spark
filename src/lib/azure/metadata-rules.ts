/**
 * Pure rules for Azure DevOps process and board metadata (ADR-013).
 *
 * Nothing here names a state, a board column or a work item type: every
 * value comes from what Azure returned and was persisted by the metadata sync.
 */
import type { StateCategory } from "@/types/domain/work-item";
import type { AzureBoardColumn, AzureWorkItemStateColor } from "@/types/azure";

/** Metadata older than this is refreshed before the next work item sync. */
export const METADATA_MAX_AGE_MS = 6 * 60 * 60_000;

const AZURE_STATE_CATEGORY: Readonly<Record<string, StateCategory>> = {
  proposed: "proposed",
  inprogress: "inProgress",
  resolved: "resolved",
  completed: "completed",
  removed: "removed",
};

/** Maps Azure's own state category; anything unexpected is "unknown", never guessed. */
export function mapAzureStateCategory(category: string | null | undefined): StateCategory {
  if (!category) return "unknown";
  return AZURE_STATE_CATEGORY[category.trim().toLowerCase()] ?? "unknown";
}

export interface NormalizedTypeState {
  readonly stateName: string;
  readonly azureCategory: string;
  readonly stateCategory: StateCategory;
  readonly color: string | null;
  readonly sortOrder: number;
}

/** Keeps Azure's order, drops blank names and case-insensitive duplicates. */
export function normalizeTypeStates(
  states: readonly AzureWorkItemStateColor[] | null | undefined,
): NormalizedTypeState[] {
  const seen = new Set<string>();
  const result: NormalizedTypeState[] = [];
  for (const state of states ?? []) {
    const name = typeof state?.name === "string" ? state.name.trim() : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push({
      stateName: name,
      azureCategory: state.category?.trim() || "Unknown",
      stateCategory: mapAzureStateCategory(state.category),
      color: state.color ?? null,
      sortOrder: result.length,
    });
  }
  return result;
}

export type BoardColumnType = "incoming" | "inProgress" | "outgoing" | "unknown";

export interface NormalizedBoardColumn {
  readonly azureColumnId: string;
  readonly name: string;
  readonly columnOrder: number;
  readonly columnType: BoardColumnType;
  readonly itemLimit: number | null;
  readonly isSplit: boolean;
  readonly description: string | null;
  readonly stateMappings: Readonly<Record<string, string>>;
}

const COLUMN_TYPES: Readonly<Record<string, BoardColumnType>> = {
  incoming: "incoming",
  inprogress: "inProgress",
  outgoing: "outgoing",
};

/** Columns in Azure's left-to-right order; a missing WIP limit is null, not 0. */
export function normalizeBoardColumns(
  columns: readonly AzureBoardColumn[] | null | undefined,
): NormalizedBoardColumn[] {
  const result: NormalizedBoardColumn[] = [];
  for (const column of columns ?? []) {
    if (!column?.id || !column.name) continue;
    const mappings: Record<string, string> = {};
    for (const [type, state] of Object.entries(column.stateMappings ?? {})) {
      if (typeof type === "string" && typeof state === "string" && type && state) {
        mappings[type] = state;
      }
    }
    result.push({
      azureColumnId: column.id,
      name: column.name,
      columnOrder: result.length,
      columnType: COLUMN_TYPES[(column.columnType ?? "").toLowerCase()] ?? "unknown",
      itemLimit:
        typeof column.itemLimit === "number" && column.itemLimit > 0 ? column.itemLimit : null,
      isSplit: column.isSplit === true,
      description: column.description?.trim() || null,
      stateMappings: mappings,
    });
  }
  return result;
}

export interface PersistedTypeState {
  readonly workItemType: string;
  readonly stateName: string;
  readonly stateCategory: StateCategory;
}

/** Lookup of persisted Azure state categories. */
export interface AzureStateIndex {
  /** Key: `${type}\u0000${state}`, both lower-cased. */
  readonly byTypeAndState: ReadonlyMap<string, StateCategory>;
  /** Only states whose category is the same for every type that has them. */
  readonly byState: ReadonlyMap<string, StateCategory>;
}

const typeStateKey = (type: string, state: string): string =>
  `${type.trim().toLowerCase()}\u0000${state.trim().toLowerCase()}`;

export function buildAzureStateIndex(rows: readonly PersistedTypeState[]): AzureStateIndex {
  const byTypeAndState = new Map<string, StateCategory>();
  const candidates = new Map<string, Set<StateCategory>>();
  for (const row of rows) {
    if (!row.workItemType || !row.stateName || row.stateCategory === "unknown") continue;
    byTypeAndState.set(typeStateKey(row.workItemType, row.stateName), row.stateCategory);
    const key = row.stateName.trim().toLowerCase();
    const set = candidates.get(key) ?? new Set<StateCategory>();
    set.add(row.stateCategory);
    candidates.set(key, set);
  }
  const byState = new Map<string, StateCategory>();
  for (const [state, categories] of candidates) {
    if (categories.size === 1) byState.set(state, [...categories][0]!);
  }
  return { byTypeAndState, byState };
}

export function lookupAzureStateCategory(
  index: AzureStateIndex | null | undefined,
  type: string | null | undefined,
  state: string,
): StateCategory | null {
  if (!index) return null;
  if (type) {
    const exact = index.byTypeAndState.get(typeStateKey(type, state));
    if (exact) return exact;
  }
  return index.byState.get(state.trim().toLowerCase()) ?? null;
}

export interface BoardWithColumns {
  readonly id: string;
  readonly name: string;
  readonly columns: readonly Pick<NormalizedBoardColumn, "name" | "stateMappings">[];
}

const boardTypes = (board: BoardWithColumns): Set<string> => {
  const types = new Set<string>();
  for (const column of board.columns) {
    for (const type of Object.keys(column.stateMappings)) types.add(type.toLowerCase());
  }
  return types;
};

/**
 * The board that shows most of the given items (by their work item type).
 * Ties keep Azure's board order. Null when no board covers any item.
 */
export function choosePrimaryBoard<B extends BoardWithColumns>(
  boards: readonly B[],
  itemTypes: readonly string[],
): B | null {
  let best: B | null = null;
  let bestCount = 0;
  for (const board of boards) {
    const types = boardTypes(board);
    const count = itemTypes.filter((type) => types.has(type.toLowerCase())).length;
    if (count > bestCount) {
      best = board;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Index of the board column an item sits in: its synced `System.BoardColumn`
 * first, else the first column whose state mapping for the item's type
 * matches its state. Null when the item does not belong on this board.
 */
export function boardColumnIndexFor(
  item: {
    readonly azureType: string;
    readonly state: string;
    readonly boardColumn: string | null;
  },
  columns: readonly Pick<NormalizedBoardColumn, "name" | "stateMappings">[],
): number | null {
  const type = item.azureType.toLowerCase();
  const onBoard = columns.some((column) =>
    Object.keys(column.stateMappings).some((t) => t.toLowerCase() === type),
  );
  if (!onBoard) return null;

  if (item.boardColumn) {
    const wanted = item.boardColumn.trim().toLowerCase();
    const byName = columns.findIndex((column) => column.name.trim().toLowerCase() === wanted);
    if (byName >= 0) return byName;
  }

  const state = item.state.trim().toLowerCase();
  const byState = columns.findIndex((column) =>
    Object.entries(column.stateMappings).some(
      ([t, s]) => t.toLowerCase() === type && s.trim().toLowerCase() === state,
    ),
  );
  return byState >= 0 ? byState : null;
}

/**
 * When an item entered its current board column. A move between two observed
 * columns is stamped with the item's own change time; an unchanged column
 * keeps the earlier stamp. The first sighting — including items synced before
 * the column was read at all — is unknown (null), never guessed.
 */
export function boardColumnEnteredAt(
  prior: {
    readonly boardColumn: string | null | undefined;
    readonly enteredAt: string | null | undefined;
  } | null,
  next: { readonly boardColumn: string | null; readonly changedAtSource: string },
): string | null {
  if (!prior || !prior.boardColumn) return null;
  const before = (prior.boardColumn ?? "").trim().toLowerCase();
  const after = (next.boardColumn ?? "").trim().toLowerCase();
  if (before === after) return prior.enteredAt ?? null;
  return next.boardColumn ? next.changedAtSource : null;
}

export function isMetadataStale(
  lastSyncedAt: string | null | undefined,
  nowMs: number,
  maxAgeMs: number = METADATA_MAX_AGE_MS,
): boolean {
  if (!lastSyncedAt) return true;
  const at = Date.parse(lastSyncedAt);
  return !Number.isFinite(at) || nowMs - at >= maxAgeMs;
}
