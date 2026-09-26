/**
 * Pure sprint board rules (ADR-025): the team's own Azure board — columns in
 * Azure's order, named as in Azure, with WIP limits — filled with the
 * sprint's items that live on it. Each card carries its age in the column in
 * the team's working days, whether it is stuck and why (ADR-015), and a
 * roll-up of its children (tasks done, open bugs).
 */
import { boardColumnIndexFor, choosePrimaryBoard } from "@/lib/azure/metadata-rules";
import {
  stuckCandidate,
  type BoardFact,
  type RealWorkItemFact,
} from "@/lib/overview/overview-rules";
import {
  assessStuck,
  type AgeBasis,
  type ColumnKind,
  type StuckReason,
  type StuckSettings,
} from "@/lib/overview/stuck-rules";

export interface BoardCard {
  readonly azureId: number;
  readonly title: string;
  readonly type: string;
  readonly state: string;
  readonly assignee: string | null;
  readonly estimate: number | null;
  readonly azureUrl: string | null;
  readonly tags: readonly string[];
  readonly daysInColumn: number | null;
  readonly ageBasis: AgeBasis | null;
  readonly stuck: boolean;
  readonly stuckReasons: readonly StuckReason[];
  readonly tasks: number;
  readonly tasksDone: number;
  /** Children that are open and assigned to nobody. */
  readonly unassignedChildren: number;
  readonly openBugs: number;
}

export interface BoardColumnView {
  readonly id: string;
  readonly name: string;
  readonly kind: ColumnKind;
  readonly itemLimit: number | null;
  readonly overLimit: boolean;
  readonly points: number;
  readonly cards: readonly BoardCard[];
}

export interface SprintBoardView {
  readonly boardName: string | null;
  readonly columns: readonly BoardColumnView[];
  /** Sprint scope items the board does not show (e.g. no board column yet). */
  readonly offBoard: readonly BoardCard[];
  readonly totals: {
    readonly cards: number;
    readonly stuck: number;
    readonly points: number;
  };
}

const OPEN = (f: RealWorkItemFact) =>
  f.stateCategory !== "completed" && f.stateCategory !== "removed";

/** Cards needing attention first: stuck, then oldest in column, then by id. */
const byAttention = (a: BoardCard, b: BoardCard) =>
  Number(b.stuck) - Number(a.stuck) ||
  (b.daysInColumn ?? -1) - (a.daysInColumn ?? -1) ||
  a.azureId - b.azureId;

export function buildSprintBoard(input: {
  readonly facts: readonly RealWorkItemFact[];
  readonly boards: readonly BoardFact[];
  readonly memberNames: ReadonlyMap<string, string>;
  readonly nowIso: string;
  readonly settings: StuckSettings;
}): SprintBoardView {
  const { facts, boards, nowIso, settings } = input;
  const children = new Map<number, RealWorkItemFact[]>();
  for (const fact of facts) {
    if (fact.parentAzureWorkItemId === null) continue;
    const list = children.get(fact.parentAzureWorkItemId) ?? [];
    list.push(fact);
    children.set(fact.parentAzureWorkItemId, list);
  }

  const card = (fact: RealWorkItemFact, kind: ColumnKind | null): BoardCard => {
    const assessment = assessStuck(stuckCandidate(fact, kind), nowIso, settings);
    const kids = children.get(fact.azureWorkItemId) ?? [];
    const tasks = kids.filter((k) => k.alias === "task");
    return {
      azureId: fact.azureWorkItemId,
      title: fact.title,
      type: fact.azureType,
      state: fact.state,
      assignee: fact.assignedToMemberId
        ? (input.memberNames.get(fact.assignedToMemberId) ?? null)
        : null,
      estimate: fact.estimate,
      azureUrl: fact.azureUrl,
      tags: fact.tags,
      daysInColumn: assessment.workingDaysInColumn,
      ageBasis: assessment.ageBasis,
      stuck: assessment.stuck,
      stuckReasons: assessment.reasons,
      tasks: tasks.length,
      tasksDone: tasks.filter((k) => k.stateCategory === "completed").length,
      unassignedChildren: kids.filter((k) => OPEN(k) && !k.assignedToMemberId).length,
      openBugs: kids.filter((k) => k.alias === "bug" && OPEN(k)).length,
    };
  };

  const board = choosePrimaryBoard(
    boards,
    facts.map((f) => f.azureType),
  );
  const scope = facts.filter((f) => f.countsTowardScope && f.stateCategory !== "removed");

  if (!board || board.columns.length === 0) {
    const offBoard = scope.map((f) => card(f, null)).sort(byAttention);
    return {
      boardName: null,
      columns: [],
      offBoard,
      totals: {
        cards: offBoard.length,
        stuck: offBoard.filter((c) => c.stuck).length,
        points: sum(offBoard),
      },
    };
  }

  const buckets = board.columns.map(() => [] as BoardCard[]);
  const placed = new Set<number>();
  for (const fact of facts) {
    if (fact.stateCategory === "removed") continue;
    const index = boardColumnIndexFor(fact, board.columns);
    if (index === null) continue;
    buckets[index]!.push(card(fact, board.columns[index]!.columnType));
    placed.add(fact.azureWorkItemId);
  }
  const columns = board.columns.map((column, index) => {
    const cards = buckets[index]!.sort(byAttention);
    return {
      id: column.id,
      name: column.name,
      kind: column.columnType,
      itemLimit: column.itemLimit,
      overLimit:
        column.itemLimit !== null && column.itemLimit > 0 && cards.length > column.itemLimit,
      points: sum(cards),
      cards,
    };
  });
  const offBoard = scope
    .filter((f) => !placed.has(f.azureWorkItemId))
    .map((f) => card(f, null))
    .sort(byAttention);
  const all = [...columns.flatMap((c) => c.cards), ...offBoard];
  return {
    boardName: board.name,
    columns,
    offBoard,
    totals: {
      cards: all.length,
      stuck: all.filter((c) => c.stuck).length,
      points: sum(all),
    },
  };
}

const sum = (cards: readonly BoardCard[]) =>
  Math.round(cards.reduce((total, c) => total + (c.estimate ?? 0), 0) * 10) / 10;
