import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";
import { ErrorBlock, Iso, LoadingBlock, Notice, SectionCard } from "@/components/matn/primitives";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getSprintBoard } from "@/lib/workspace/workspace.functions";
import type { BoardCard, BoardColumnView } from "@/lib/board/board-rules";
import type { SprintBoardPayload } from "@/lib/board/board.server";

export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Sprint board — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "The team's Azure board with each card's age in its column and stuck work.",
      },
    ],
  }),
  component: BoardPage,
});

function BoardPage() {
  const { mode } = useWorkspace();
  return (
    <AppShell>
      {mode === "real" ? (
        <BoardView />
      ) : (
        <PlaceholderPage
          titleKey="bd.title"
          subtitleKey="bd.subtitle"
          bulletKeys={["bd.overLimit", "bd.offBoard", "st.reason.aged_in_column"]}
        />
      )}
    </AppShell>
  );
}

function BoardView() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const query = useQuery({
    queryKey: ["sprint-board", filters.iterationId],
    queryFn: () => getSprintBoard({ data: { teamIterationId: filters.iterationId } }),
    enabled: Boolean(filters.iterationId),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.board : null;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {t("bd.title")}
          {payload ? (
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              · <Iso>{payload.sprintName}</Iso>
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">{t("bd.subtitle")}</p>
      </header>
      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError || query.data?.ok === false || !payload ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : (
        <Board payload={payload} />
      )}
    </div>
  );
}

function Board({ payload }: { payload: SprintBoardPayload }) {
  const { t } = useI18n();
  const { view } = payload;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {view.boardName ? <span>{t("bd.board", { a: view.boardName })}</span> : null}
        <Iso>
          {t("bd.totals", { a: view.totals.cards, b: view.totals.points, c: view.totals.stuck })}
        </Iso>
      </div>
      {view.columns.length === 0 ? (
        <Notice tone="neutral" title={t("bd.title")} body={t("bd.noBoard")} />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-start gap-3">
            {view.columns.map((column) => (
              <Column key={column.id} column={column} />
            ))}
          </div>
        </div>
      )}
      {view.offBoard.length > 0 ? (
        <SectionCard
          title={view.columns.length === 0 ? t("bd.title") : t("bd.offBoard")}
          action={<Iso className="text-xs text-muted-foreground">{view.offBoard.length}</Iso>}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {view.offBoard.map((card) => (
              <Card key={card.azureId} card={card} />
            ))}
          </div>
        </SectionCard>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {t("bd.method", { a: payload.thresholdDays })}
      </p>
    </>
  );
}

function Column({ column }: { column: BoardColumnView }) {
  const { t } = useI18n();
  const hasLimit = column.itemLimit !== null && column.itemLimit > 0;
  return (
    <section className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-muted/30">
      <header
        className={cn(
          "flex flex-col gap-0.5 rounded-t-lg border-b px-3 py-2.5",
          column.overLimit ? "border-critical/40 bg-critical/10" : "border-border",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">
            <Iso>{column.name}</Iso>
          </h2>
          <Iso
            className={cn(
              "shrink-0 text-xs font-medium",
              column.overLimit ? "text-critical" : "text-muted-foreground",
            )}
          >
            {hasLimit
              ? t("bd.wip", { a: column.cards.length, b: column.itemLimit as number })
              : String(column.cards.length)}
          </Iso>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <Iso>{`${column.points} ${t("sh.points")}`}</Iso>
          {column.overLimit ? <span className="text-critical">{t("bd.overLimit")}</span> : null}
        </div>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {column.cards.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t("bd.empty")}</p>
        ) : (
          column.cards.map((card) => <Card key={card.azureId} card={card} />)
        )}
      </div>
    </section>
  );
}

function Card({ card }: { card: BoardCard }) {
  const { t } = useI18n();
  return (
    <article
      className={cn(
        "flex flex-col gap-1.5 rounded-md border bg-card p-2.5 text-xs shadow-sm",
        card.stuck ? "border-critical/50" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Iso>{card.type}</Iso>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Iso>#{card.azureId}</Iso>
          {card.azureUrl ? (
            <a
              href={card.azureUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-primary"
              aria-label="Azure DevOps"
            >
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </span>
      </div>
      <p className="font-medium leading-snug text-foreground">
        <Iso>{card.title}</Iso>
      </p>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{card.assignee ? <Iso>{card.assignee}</Iso> : "—"}</span>
        {card.estimate !== null ? (
          <Iso className="shrink-0">{`${card.estimate} ${t("sh.points")}`}</Iso>
        ) : null}
      </div>
      {card.daysInColumn !== null ? (
        <span
          className={cn(
            "w-fit rounded px-1.5 py-0.5 text-[10px]",
            card.stuck ? "bg-critical/10 text-critical" : "bg-muted text-muted-foreground",
          )}
        >
          <Iso>
            {t(card.ageBasis === "state_change" ? "bd.daysApprox" : "bd.days", {
              a: card.daysInColumn,
            })}
          </Iso>
        </span>
      ) : null}
      {card.stuckReasons.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {card.stuckReasons.map((reason) => (
            <span
              key={reason}
              className="rounded border border-critical/30 bg-critical/10 px-1.5 py-0.5 text-[10px] text-critical"
            >
              {t(`st.reason.${reason}` as TKey)}
            </span>
          ))}
        </div>
      ) : null}
      {card.tasks > 0 || card.openBugs > 0 || card.unassignedChildren > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
          {card.tasks > 0 ? (
            <Iso className="text-muted-foreground">
              {t("bd.tasks", { a: card.tasksDone, b: card.tasks })}
            </Iso>
          ) : null}
          {card.openBugs > 0 ? (
            <Iso className="text-critical">{t("bd.bugs", { a: card.openBugs })}</Iso>
          ) : null}
          {card.unassignedChildren > 0 ? (
            <Iso className="text-warning">
              {t("bd.unassignedKids", { a: card.unassignedChildren })}
            </Iso>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
