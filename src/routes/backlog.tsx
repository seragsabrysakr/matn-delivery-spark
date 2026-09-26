import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";
import { ErrorBlock, Iso, LoadingBlock, SectionCard } from "@/components/matn/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getBacklog } from "@/lib/workspace/workspace.functions";
import {
  matchesFilter,
  type BacklogFilter,
  type BacklogRow,
} from "@/lib/backlog/backlog-page-rules";
import type { BacklogPayload } from "@/lib/backlog/backlog-page.server";

export const Route = createFileRoute("/backlog")({
  head: () => ({
    meta: [
      { title: "Backlog — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "The team's open backlog with estimate, owner, staleness and readiness checks.",
      },
    ],
  }),
  component: BacklogPage,
});

function BacklogPage() {
  const { mode } = useWorkspace();
  return (
    <AppShell>
      {mode === "real" ? (
        <BacklogView />
      ) : (
        <PlaceholderPage
          titleKey="bl.title"
          subtitleKey="bl.subtitle"
          bulletKeys={["bl.flag.unestimated", "bl.flag.unassigned", "bl.flag.stale"]}
        />
      )}
    </AppShell>
  );
}

function BacklogView() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const query = useQuery({
    queryKey: ["backlog", filters.iterationId],
    queryFn: () => getBacklog({ data: { teamIterationId: filters.iterationId } }),
    enabled: Boolean(filters.iterationId),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.backlog : null;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {t("bl.title")}
          {payload?.teamName ? (
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              · <Iso>{payload.teamName}</Iso>
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">{t("bl.subtitle")}</p>
      </header>
      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError || query.data?.ok === false || !payload ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Stats payload={payload} />
          <BacklogTable payload={payload} />
          <p className="text-[11px] text-muted-foreground">
            {t("bl.method", { a: payload.staleAfterDays })}
          </p>
        </>
      )}
    </div>
  );
}

function Stats({ payload }: { payload: BacklogPayload }) {
  const { t } = useI18n();
  const s = payload.stats;
  const tiles: { value: number; key: TKey; tone?: string }[] = [
    { value: s.total, key: "bl.stat.total" },
    { value: s.points, key: "bl.stat.points" },
    { value: s.notReady, key: "bl.stat.notReady", tone: s.notReady > 0 ? "text-warning" : "" },
    {
      value: s.inPastSprint,
      key: "bl.stat.pastSprint",
      tone: s.inPastSprint > 0 ? "text-critical" : "",
    },
    { value: s.inFutureSprint, key: "bl.stat.futureSprint" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.key} className="rounded-lg border border-border bg-card p-3 shadow-card">
          <Iso className={cn("text-xl font-semibold text-foreground", tile.tone)}>
            {String(tile.value)}
          </Iso>
          <p className="mt-0.5 text-xs text-muted-foreground">{t(tile.key)}</p>
        </div>
      ))}
    </div>
  );
}

const FILTERS: BacklogFilter[] = ["all", "notReady", "unestimated", "unassigned", "stale"];

function BacklogTable({ payload }: { payload: BacklogPayload }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<BacklogFilter>("all");
  const [search, setSearch] = useState("");

  const counts: Record<BacklogFilter, number> = {
    all: payload.stats.total,
    notReady: payload.stats.notReady,
    unestimated: payload.stats.unestimated,
    unassigned: payload.stats.unassigned,
    stale: payload.stats.stale,
  };
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return payload.rows.filter(
      (row) =>
        matchesFilter(row, filter) &&
        (!needle ||
          row.title.toLowerCase().includes(needle) ||
          String(row.azureId).includes(needle) ||
          (row.assignee ?? "").toLowerCase().includes(needle) ||
          row.tags.some((tag) => tag.toLowerCase().includes(needle))),
    );
  }, [payload.rows, filter, search]);

  const columns: TKey[] = [
    "bl.col.priority",
    "bl.col.item",
    "bl.col.state",
    "bl.col.sprint",
    "bl.col.points",
    "bl.col.assignee",
    "bl.col.age",
    "bl.col.checks",
  ];

  return (
    <SectionCard title={t("bl.title")} bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            <Iso>{t(`bl.filter.${f}` as TKey, { a: counts[f] })}</Iso>
          </Button>
        ))}
        <Input
          className="ms-auto h-9 max-w-xs"
          placeholder={t("bl.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {payload.rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("bl.empty")}</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("hy.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-start text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {columns.map((key) => (
                  <th key={key} className="px-3 py-2.5 text-start font-medium">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.azureId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function Row({ row }: { row: BacklogRow }) {
  const { t } = useI18n();
  const FLAG_TONE: Record<string, string> = {
    unestimated: "border-warning/40 bg-warning/10 text-warning",
    noParent: "border-warning/40 bg-warning/10 text-warning",
    unassigned: "border-border bg-muted text-muted-foreground",
    stale: "border-border bg-muted text-muted-foreground",
  };
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-3 py-2 align-top text-muted-foreground">
        <Iso>{row.priority === null ? "—" : String(row.priority)}</Iso>
      </td>
      <td className="max-w-[460px] px-3 py-2 align-top">
        <span className="me-1.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Iso>{row.type}</Iso>
        </span>
        <span className="font-medium text-foreground">
          <Iso>{row.title}</Iso>
        </span>{" "}
        <Iso className="text-[11px] text-muted-foreground">#{row.azureId}</Iso>
        {row.azureUrl ? (
          <a
            href={row.azureUrl}
            target="_blank"
            rel="noreferrer"
            className="ms-1 inline-flex text-primary"
            aria-label="Azure DevOps"
          >
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {row.tags.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {row.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
              >
                <Iso>{tag}</Iso>
              </span>
            ))}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-foreground">
        <Iso>{row.state}</Iso>
      </td>
      <td className="px-3 py-2 align-top">
        {row.placement === "noSprint" || !row.sprintName ? (
          <span className="text-muted-foreground">{t("bl.noSprint")}</span>
        ) : (
          <span className={row.placement === "pastSprint" ? "text-critical" : "text-foreground"}>
            <Iso>{row.sprintName}</Iso>
            {row.placement === "pastSprint" ? ` (${t("bl.pastSprint")})` : ""}
          </span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {row.estimate !== null && row.estimate > 0 ? (
          <Iso className="text-foreground">{String(row.estimate)}</Iso>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-foreground">
        {row.assignee ? <Iso>{row.assignee}</Iso> : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top text-muted-foreground">
        {row.ageDays !== null && row.idleDays !== null ? (
          <Iso>{t("bl.age", { a: row.ageDays, b: row.idleDays })}</Iso>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-1">
          {row.ready ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
              {t("bl.ready")}
            </span>
          ) : null}
          {row.flags.map((flag) => (
            <span
              key={flag}
              className={cn("rounded border px-1.5 py-0.5 text-[10px]", FLAG_TONE[flag])}
            >
              {t(`bl.flag.${flag}` as TKey)}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}
