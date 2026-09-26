import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";
import {
  ErrorBlock,
  Iso,
  LoadingBlock,
  Notice,
  SectionCard,
  StatusPill,
} from "@/components/matn/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getProjectHierarchy } from "@/lib/workspace/workspace.functions";
import { filterRows, type HierarchyRow } from "@/lib/hierarchy/hierarchy-rules";
import type { HierarchyPayload } from "@/lib/hierarchy/hierarchy.server";
import type { HealthStatus } from "@/data/types";

export const Route = createFileRoute("/hierarchy")({
  head: () => ({
    meta: [
      { title: "Hierarchy — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "Every work item as a tree, from epics to tasks and bugs, with roll-ups.",
      },
    ],
  }),
  component: HierarchyPage,
});

type LevelFilter = "all" | "portfolio" | "requirement" | "task" | "bug";

const LEVEL_BADGE: Record<string, string> = {
  portfolio: "bg-primary/10 text-primary border-primary/30",
  requirement: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  task: "bg-muted text-muted-foreground border-border",
  bug: "bg-critical/10 text-critical border-critical/30",
  none: "bg-muted text-muted-foreground border-dashed border-border",
};

const stateTone = (row: HierarchyRow): HealthStatus =>
  row.stateCategory === "completed"
    ? "healthy"
    : row.stateCategory === "removed"
      ? "neutral"
      : row.isBlocked
        ? "critical"
        : row.stateCategory === "inProgress" || row.stateCategory === "resolved"
          ? "watch"
          : "neutral";

const isOpen = (row: HierarchyRow) =>
  row.stateCategory !== "completed" && row.stateCategory !== "removed";

function HierarchyPage() {
  const { mode } = useWorkspace();
  return (
    <AppShell>
      {mode === "real" ? (
        <HierarchyView />
      ) : (
        <PlaceholderPage
          titleKey="hy.title"
          subtitleKey="hy.subtitle"
          bulletKeys={["hy.col.progress", "hy.col.tasks", "hy.col.bugs"]}
        />
      )}
    </AppShell>
  );
}

function HierarchyView() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const query = useQuery({
    queryKey: ["hierarchy", filters.iterationId],
    queryFn: () => getProjectHierarchy({ data: { teamIterationId: filters.iterationId } }),
    enabled: Boolean(filters.iterationId),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.hierarchy : null;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {t("hy.title")}
          {payload ? (
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              · {payload.projectName}
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">{t("hy.subtitle")}</p>
      </header>
      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError || query.data?.ok === false || !payload ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : (
        <>
          {!payload.levelsFromAzure ? (
            <Notice tone="neutral" title={t("hy.title")} body={t("hy.levelsFallback")} />
          ) : null}
          <Summary payload={payload} />
          <Tree payload={payload} />
          <p className="text-[11px] text-muted-foreground">{t("hy.method")}</p>
        </>
      )}
    </div>
  );
}

function Summary({ payload }: { payload: HierarchyPayload }) {
  const { t } = useI18n();
  const q = payload.stats.quality;
  const issues = (
    [
      ["requirementsWithoutParent", q.requirementsWithoutParent],
      ["tasksWithoutParent", q.tasksWithoutParent],
      ["bugsWithoutParent", q.bugsWithoutParent],
      ["parentMissing", q.parentMissing],
      ["unestimatedRequirements", q.unestimatedRequirements],
      ["tasksWithoutHours", q.tasksWithoutHours],
    ] as const
  ).filter(([, n]) => n > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <SectionCard title={t("hy.byType")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {payload.stats.byType.map((entry) => (
            <div key={entry.type} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{entry.type}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${LEVEL_BADGE[entry.level ?? "none"]}`}
                >
                  {t(`hy.level.${entry.level ?? "none"}` as TKey)}
                </span>
              </div>
              <Iso className="mt-1 block text-[11px] text-muted-foreground">
                {t("hy.type.total", { a: entry.total, b: entry.completed })}
              </Iso>
              {entry.scope > 0 ? (
                <Iso className="block text-[11px] text-muted-foreground">
                  {t("hy.type.scope", { a: entry.scope })}
                </Iso>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title={t("hy.quality.title")}>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hy.quality.ok")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {issues.map(([key, n]) => (
              <li key={key} className="text-warning">
                {t(`hy.quality.${key}` as TKey, { a: n })}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Tree({ payload }: { payload: HierarchyPayload }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [level, setLevel] = useState<LevelFilter>("all");
  // Collapsed ids; by default everything below the second level is collapsed.
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(payload.rows.filter((r) => r.depth >= 1).map((r) => r.azureId)),
  );

  const filtering = search.trim().length > 0 || openOnly || level !== "all";
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = (row: HierarchyRow) =>
      (!openOnly || isOpen(row)) &&
      (level === "all" || row.backlogLevel === level) &&
      (!needle ||
        row.title.toLowerCase().includes(needle) ||
        String(row.azureId).includes(needle) ||
        (row.assignee ?? "").toLowerCase().includes(needle));
    if (filtering) return filterRows(payload.rows, matches);
    // Tree mode: a row shows when none of its ancestors is collapsed.
    const byId = new Map(payload.rows.map((r) => [r.azureId, r]));
    return payload.rows.filter((row) => {
      for (
        let parent = row.effectiveParentId !== null ? byId.get(row.effectiveParentId) : undefined;
        parent;
        parent = parent.effectiveParentId !== null ? byId.get(parent.effectiveParentId) : undefined
      ) {
        if (collapsed.has(parent.azureId)) return false;
      }
      return true;
    });
  }, [payload.rows, search, openOnly, level, filtering, collapsed]);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: TKey[] = [
    "hy.col.item",
    "hy.col.state",
    "hy.col.assignee",
    "hy.col.sprint",
    "hy.col.progress",
    "hy.col.points",
    "hy.col.tasks",
    "hy.col.bugs",
    "hy.col.flags",
  ];

  return (
    <SectionCard
      title={t("hy.title")}
      bodyClassName="p-0"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set())}>
            {t("hy.expandAll")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setCollapsed(
                new Set(payload.rows.filter((r) => r.childIds.length > 0).map((r) => r.azureId)),
              )
            }
          >
            {t("hy.collapseAll")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Input
          className="h-9 max-w-xs"
          placeholder={t("hy.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={level} onValueChange={(v) => setLevel(v as LevelFilter)}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hy.allLevels")}</SelectItem>
            {(["portfolio", "requirement", "task", "bug"] as const).map((l) => (
              <SelectItem key={l} value={l}>
                {t(`hy.level.${l}` as TKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={openOnly} onCheckedChange={setOpenOnly} />
          {t("hy.openOnly")}
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("hy.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-start text-xs">
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
              {visible.map((row) => (
                <TreeRow
                  key={row.azureId}
                  row={row}
                  collapsible={!filtering && row.childIds.length > 0}
                  collapsed={collapsed.has(row.azureId)}
                  onToggle={() => toggle(row.azureId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function TreeRow({
  row,
  collapsible,
  collapsed,
  onToggle,
}: {
  row: HierarchyRow;
  collapsible: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const r = row.rollup;
  const hasScopeBelow = r.scopeItems > 0 && r.descendants > 0;
  const sprint =
    row.iterationPath && row.iterationPath.includes("\\")
      ? row.iterationPath.split("\\").pop()
      : null;
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="max-w-[520px] px-3 py-2 align-top">
        <div
          className="flex items-start gap-1.5"
          style={{ paddingInlineStart: `${row.depth * 18}px` }}
        >
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label={collapsed ? t("hy.expandAll") : t("hy.collapseAll")}
            >
              {collapsed ? (
                <ChevronRight className="size-3.5 rtl:rotate-180" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-block w-[18px]" />
          )}
          <span
            className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${LEVEL_BADGE[row.backlogLevel ?? "none"]}`}
          >
            {row.type}
          </span>
          <span className="min-w-0">
            <span className="font-medium text-foreground">{row.title}</span>{" "}
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
            {collapsible && collapsed && row.childIds.length > 0 ? (
              <Iso className="ms-1 text-[11px] text-muted-foreground">(+{r.descendants})</Iso>
            ) : null}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <StatusPill status={stateTone(row)} className="w-fit whitespace-nowrap">
          {row.state}
        </StatusPill>
        {row.boardColumn && row.boardColumn !== row.state ? (
          <div className="mt-0.5 text-[10px] text-muted-foreground">{row.boardColumn}</div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-foreground">{row.assignee ?? "—"}</td>
      <td className="px-3 py-2 align-top text-muted-foreground">{sprint ?? "—"}</td>
      <td className="min-w-[140px] px-3 py-2 align-top">
        {hasScopeBelow && r.progressPercent !== null ? (
          <div className="flex flex-col gap-1">
            <Iso className="font-semibold text-foreground">{`${r.progressPercent}%`}</Iso>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary"
                style={{ width: `${r.progressPercent}%` }}
              />
            </div>
            <Iso className="text-[10px] text-muted-foreground">
              {t("hy.scopeOf", { a: r.completedScope, b: r.scopeItems })}
            </Iso>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {hasScopeBelow && r.remainingPoints !== null ? (
          <Iso className="text-muted-foreground">{t("hy.remaining", { a: r.remainingPoints })}</Iso>
        ) : row.estimate !== null ? (
          <Iso className="text-foreground">{row.estimate}</Iso>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {r.tasks > 0 ? (
          <span className="flex flex-col">
            <Iso className="text-foreground">{`${r.tasksDone}/${r.tasks}`}</Iso>
            {r.remainingHours !== null ? (
              <Iso className="text-[10px] text-muted-foreground">
                {t("hy.hours", { a: r.remainingHours })}
              </Iso>
            ) : null}
          </span>
        ) : row.backlogLevel === "task" && row.remainingWork !== null ? (
          <Iso className="text-muted-foreground">{t("hy.hours", { a: row.remainingWork })}</Iso>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {r.bugs > 0 ? (
          <Iso className={r.openBugs > 0 ? "text-critical" : "text-muted-foreground"}>
            {`${r.openBugs}/${r.bugs}`}
          </Iso>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5 text-[11px]">
          {row.isBlocked && isOpen(row) ? (
            <span className="text-critical">{t("hy.flag.blockedSelf")}</span>
          ) : null}
          {r.blocked > 0 ? (
            <span className="text-critical">{t("hy.flag.blocked", { a: r.blocked })}</span>
          ) : null}
          {r.unassignedOpen > 0 ? (
            <span className="text-warning">{t("hy.flag.unassigned", { a: r.unassignedOpen })}</span>
          ) : null}
          {row.parentMissing ? (
            <span className="text-warning">{t("hy.flag.parentMissing")}</span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
