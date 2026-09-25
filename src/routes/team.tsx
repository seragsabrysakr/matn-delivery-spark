import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Users } from "lucide-react";
import { AppShell } from "@/components/matn/AppShell";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getRealTeamPage } from "@/lib/workspace/workspace.functions";
import type { TeamMemberRow, TeamPageContract, TeamWorkItemRow } from "@/lib/team/team-rules";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team Capacity — MATN Delivery Intelligence" },
      {
        name: "description",
        content:
          "Live team workload, work distribution, and estimate coverage for the selected sprint.",
      },
      { property: "og:title", content: "Team Capacity — MATN Delivery Intelligence" },
      {
        property: "og:description",
        content:
          "Live team workload, work distribution, and estimate coverage for the selected sprint.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

type SortKey = "name" | "assigned" | "active" | "blocked";

const stateKey = (c: string): TKey => `tp.state.${c}` as TKey;
const typeKey = (alias: string): TKey => `tp.type.${alias}` as TKey;

function TeamPage() {
  const { t, locale } = useI18n();
  const { mode, filters, loading: workspaceLoading } = useWorkspace();
  const enabled = mode === "real" && Boolean(filters.iterationId);

  const query = useQuery({
    queryKey: ["team", "page", filters.iterationId],
    queryFn: () => getRealTeamPage({ data: { teamIterationId: filters.iterationId } }),
    enabled,
    retry: false,
  });

  const payload = query.data?.ok ? query.data.team : null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        <header className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {t("tp.title")}
            </h1>
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
              {mode === "real" ? t("real.mode.badge") : t("real.mode.mock")}
            </span>
            {payload ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  <Iso className="font-medium text-foreground">
                    {payload.context.projectName[locale]}
                  </Iso>
                  <span aria-hidden>·</span>
                  <Iso>{payload.context.teamName[locale]}</Iso>
                  <span aria-hidden>·</span>
                  <Iso>{payload.context.sprintName[locale]}</Iso>
                </span>
                <StatusPill status={dataStatus(payload.context.dataState)}>
                  {t(`real.state.${payload.context.dataState}` as TKey)}
                </StatusPill>
                <span className="text-[11px] text-muted-foreground">
                  {t("tp.lastSync")}:{" "}
                  <Iso>
                    {payload.context.lastWorkItemSyncAt
                      ? new Date(payload.context.lastWorkItemSyncAt).toLocaleString(
                          locale === "ar" ? "ar-EG" : "en-GB",
                        )
                      : t("tp.lastSync.never")}
                  </Iso>
                </span>
              </>
            ) : null}
          </div>
          <p className="text-[13px] text-muted-foreground">{t("tp.subtitle")}</p>
        </header>

        {mode !== "real" ? (
          <Notice
            tone="neutral"
            title={t("tp.empty.noItems")}
            body={t("tp.notice.missingNotZero")}
          />
        ) : query.isLoading || workspaceLoading ? (
          <SectionCard title={t("tp.title")}>
            <LoadingBlock rows={6} />
          </SectionCard>
        ) : query.isError || query.data?.ok === false ? (
          <SectionCard title={t("tp.title")}>
            <ErrorBlock onRetry={() => void query.refetch()} />
          </SectionCard>
        ) : payload ? (
          <TeamBody payload={payload} />
        ) : null}
      </div>
    </AppShell>
  );
}

function dataStatus(state: string) {
  if (state === "current") return "healthy" as const;
  if (state === "stale" || state === "partial") return "atRisk" as const;
  if (state === "notSynced") return "neutral" as const;
  return "neutral" as const;
}

type Payload = TeamPageContract;

function TeamBody({ payload }: { payload: Payload }) {
  const { t, locale, n } = useI18n();
  const { summary, members, workItems, distribution, accessLevel, context } = payload;
  const [sort, setSort] = useState<SortKey>("name");
  const [selected, setSelected] = useState<TeamWorkItemRow | null>(null);

  const [search, setSearch] = useState("");
  const [member, setMember] = useState("all");
  const [state, setState] = useState("all");
  const [type, setType] = useState("all");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [unestimatedOnly, setUnestimatedOnly] = useState(false);

  const sortedMembers = useMemo(() => {
    const rows: TeamMemberRow[] = [...members];
    if (sort === "name") return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return rows.sort((a, b) => b[sort] - a[sort] || a.displayName.localeCompare(b.displayName));
  }, [members, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workItems.filter((w) => {
      if (q && !w.title.toLowerCase().includes(q) && !String(w.azureWorkItemId).includes(q))
        return false;
      if (member !== "all" && w.assignedMemberId !== member) return false;
      if (state !== "all" && w.stateCategory !== state) return false;
      if (type !== "all" && w.alias !== type) return false;
      if (blockedOnly && !w.isBlocked) return false;
      if (unassignedOnly && w.assignedMemberId) return false;
      if (unestimatedOnly && w.hasEstimate) return false;
      return true;
    });
  }, [workItems, search, member, state, type, blockedOnly, unassignedOnly, unestimatedOnly]);

  const notices = useMemo(() => {
    const out: { key: string; title: string; body: string; tone: "warning" | "neutral" }[] = [];
    if (!summary.capacityAvailable)
      out.push({
        key: "cap",
        tone: "neutral",
        title: t("tp.capacity.notConfigured"),
        body: t("tp.notice.capacity"),
      });
    if (summary.unassignedItems > 0)
      out.push({
        key: "assign",
        tone: "warning",
        title: t("tp.card.unassigned"),
        body: t("tp.notice.assignment", {
          a: n(summary.assignmentCoveragePercent ?? 0),
          b: n(summary.unassignedItems),
        }),
      });
    if (summary.estimateCoveragePercent !== null && summary.estimateCoveragePercent < 60)
      out.push({
        key: "est",
        tone: "warning",
        title: t("tp.card.estimateCoverage"),
        body: t("tp.notice.estimate", { a: n(summary.estimateCoveragePercent) }),
      });
    if (context.dataState === "partial")
      out.push({
        key: "partial",
        tone: "warning",
        title: t("real.state.partial"),
        body: t("tp.notice.partial"),
      });
    if (context.dataState === "stale")
      out.push({
        key: "stale",
        tone: "warning",
        title: t("real.state.stale"),
        body: t("tp.notice.stale"),
      });
    return out;
  }, [summary, context.dataState, t, n]);

  if (!context.completeness.hasWorkItems) {
    return (
      <SectionCard title={t("tp.title")}>
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Users className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">{t("tp.empty.noItems")}</p>
        </div>
      </SectionCard>
    );
  }

  const cards = [
    { key: "members", label: t("tp.card.members"), value: n(summary.memberCount), hint: "" },
    {
      key: "active",
      label: t("tp.card.active"),
      value: n(summary.activeItems),
      hint: t("tp.card.ofTotal", { a: n(summary.totalItems) }),
    },
    {
      key: "completed",
      label: t("tp.card.completed"),
      value: n(summary.completedItems),
      hint: t("tp.card.ofTotal", { a: n(summary.totalItems) }),
    },
    { key: "blocked", label: t("tp.card.blocked"), value: n(summary.blockedItems), hint: "" },
    {
      key: "unassigned",
      label: t("tp.card.unassigned"),
      value: n(summary.unassignedItems),
      hint: t("tp.card.ofTotal", { a: n(summary.totalItems) }),
    },
    {
      key: "coverage",
      label: t("tp.card.estimateCoverage"),
      value:
        summary.estimateCoveragePercent === null
          ? t("tp.na")
          : `${n(summary.estimateCoveragePercent)}%`,
      hint: t("tp.card.scoped", { a: n(summary.scopedItems) }),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.key} className="rounded-lg border border-border bg-card p-3 shadow-card">
            <p className="truncate text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              <Iso>{c.value}</Iso>
            </p>
            {c.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</p> : null}
          </div>
        ))}
      </div>

      {accessLevel === "aggregate" ? (
        <Notice tone="neutral" title={t("tp.exec.title")} body={t("tp.exec.body")} />
      ) : null}

      {notices.length > 0 ? (
        <div className="grid gap-2">
          {notices.map((notice) => (
            <Notice key={notice.key} tone={notice.tone} title={notice.title} body={notice.body} />
          ))}
        </div>
      ) : null}

      {accessLevel !== "aggregate" ? (
        <SectionCard
          title={t("tp.workload.title")}
          subtitle={t("tp.workload.subtitle")}
          action={
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("tp.sort.label")}
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="name">{t("tp.sort.name")}</option>
                <option value="assigned">{t("tp.col.assigned")}</option>
                <option value="active">{t("tp.col.active")}</option>
                <option value="blocked">{t("tp.col.blocked")}</option>
              </select>
            </label>
          }
          bodyClassName="p-0"
        >
          {sortedMembers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("tp.empty.noMembers")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-start font-medium">{t("tp.col.member")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.assigned")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.active")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.completed")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.blocked")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.capacity")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.utilization")}</th>
                    <th className="px-4 py-2 text-start font-medium">{t("tp.col.coverage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m) => (
                    <tr key={m.memberId} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {m.avatarUrl ? (
                            <img
                              src={m.avatarUrl}
                              alt=""
                              className="size-6 rounded-full"
                              loading="lazy"
                            />
                          ) : (
                            <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] text-muted-foreground">
                              <Iso>{m.displayName.slice(0, 2)}</Iso>
                            </span>
                          )}
                          <Iso className="font-medium text-foreground">{m.displayName}</Iso>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Iso>{n(m.assigned)}</Iso>
                      </td>
                      <td className="px-3 py-2.5">
                        <Iso>{n(m.active)}</Iso>
                      </td>
                      <td className="px-3 py-2.5">
                        <Iso>{n(m.completed)}</Iso>
                      </td>
                      <td className="px-3 py-2.5">
                        <Iso>{n(m.blocked)}</Iso>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {m.capacityHours === null ? (
                          t("tp.na")
                        ) : (
                          <Iso>{`${n(m.capacityHours)}h`}</Iso>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {m.utilizationPercent === null ? (
                          t("tp.na")
                        ) : (
                          <Iso>{`${n(m.utilizationPercent)}%`}</Iso>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                        <div>{t("tp.coverage.noEstimates", { a: n(m.unestimated) })}</div>
                        <div>
                          {m.currentStageAge.medianDays === null
                            ? t("tp.coverage.noStageAge")
                            : t("tp.coverage.stageAge", { a: n(m.currentStageAge.medianDays) })}
                        </div>
                        {!m.coverage.hasCapacity ? (
                          <div>{t("tp.capacity.notConfigured")}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title={t("tp.dist.title")} subtitle={t("tp.dist.subtitle")}>
        <div className="grid gap-6 md:grid-cols-3">
          <DistributionList
            title={t("tp.dist.byState")}
            total={summary.totalItems}
            rows={distribution.byStateCategory.map((r) => ({
              label: t(stateKey(r.key)),
              count: r.count,
            }))}
          />
          <DistributionList
            title={t("tp.dist.byType")}
            total={summary.totalItems}
            rows={distribution.byType.map((r) => ({
              label: `${t(typeKey(r.key))} · ${r.azureType}`,
              count: r.count,
            }))}
          />
          <DistributionList
            title={t("tp.dist.byAssignment")}
            total={summary.totalItems}
            rows={[
              { label: t("tp.dist.assigned"), count: distribution.assignment.assigned },
              { label: t("tp.dist.unassigned"), count: distribution.assignment.unassigned },
            ]}
          />
        </div>
      </SectionCard>

      {accessLevel !== "aggregate" ? (
        <SectionCard
          title={t("tp.items.title")}
          subtitle={t("tp.items.subtitle", { a: n(filtered.length) })}
          bodyClassName="p-0"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("tp.items.search")}
              className="h-8 w-full max-w-56 text-xs"
            />
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={member}
              onChange={(e) => setMember(e.target.value)}
            >
              <option value="all">{t("tp.filter.allMembers")}</option>
              {members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.displayName}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="all">{t("tp.filter.allStates")}</option>
              {distribution.byStateCategory.map((s) => (
                <option key={s.key} value={s.key}>
                  {t(stateKey(s.key))}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">{t("tp.filter.allTypes")}</option>
              {distribution.byType.map((s) => (
                <option key={s.key} value={s.key}>
                  {t(typeKey(s.key))}
                </option>
              ))}
            </select>
            <ToggleChip
              active={blockedOnly}
              onClick={() => setBlockedOnly((v) => !v)}
              label={t("tp.filter.blockedOnly")}
            />
            <ToggleChip
              active={unassignedOnly}
              onClick={() => setUnassignedOnly((v) => !v)}
              label={t("tp.filter.unassignedOnly")}
            />
            <ToggleChip
              active={unestimatedOnly}
              onClick={() => setUnestimatedOnly((v) => !v)}
              label={t("tp.filter.unestimatedOnly")}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("tp.empty.noFiltered")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-start font-medium">{t("tp.col.id")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.title")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.type")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.state")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("tp.col.assignee")}</th>
                    <th className="px-4 py-2 text-start font-medium">{t("tp.col.estimate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 300).map((w) => (
                    <tr
                      key={w.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => setSelected(w)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelected(w);
                      }}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface focus:bg-surface focus:outline-none"
                    >
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <Iso>{w.azureWorkItemId}</Iso>
                      </td>
                      <td className="max-w-80 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Iso className="truncate">{w.title}</Iso>
                          {w.isBlocked ? (
                            <StatusPill status="critical">{t("tp.blocked")}</StatusPill>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{t(typeKey(w.alias))}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {t(stateKey(w.stateCategory))} · <Iso>{w.state}</Iso>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {w.assignedMemberName ? (
                          <Iso>{w.assignedMemberName}</Iso>
                        ) : (
                          t("tp.unassigned")
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {w.hasEstimate ? <Iso>{n(w.estimate ?? 0)}</Iso> : t("tp.noEstimate")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent
          side={locale === "ar" ? "left" : "right"}
          className="w-full max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t("tp.detail.title")}</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-3 px-4 pb-6 text-sm">
              <p className="font-medium text-foreground">
                <Iso>{`#${selected.azureWorkItemId} — ${selected.title}`}</Iso>
              </p>
              <DetailRow label={t("tp.col.type")} value={`${t(typeKey(selected.alias))}`} />
              <DetailRow label={t("tp.detail.azureType")} value={selected.azureType} />
              <DetailRow label={t("tp.col.state")} value={t(stateKey(selected.stateCategory))} />
              <DetailRow label={t("tp.detail.azureState")} value={selected.state} />
              <DetailRow
                label={t("tp.col.assignee")}
                value={selected.assignedMemberName ?? t("tp.unassigned")}
              />
              <DetailRow
                label={t("tp.col.estimate")}
                value={
                  selected.hasEstimate
                    ? `${n(selected.estimate ?? 0)}${selected.estimateUnit ? ` ${selected.estimateUnit}` : ""}`
                    : t("tp.noEstimate")
                }
              />
              <DetailRow
                label={t("tp.blocked")}
                value={selected.isBlocked ? t("tp.blocked") : t("tp.na")}
              />
              <DetailRow
                label={t("tp.detail.changed")}
                value={
                  selected.changedAtSource
                    ? new Date(selected.changedAtSource).toLocaleString(
                        locale === "ar" ? "ar-EG" : "en-GB",
                      )
                    : t("tp.na")
                }
              />
              <DetailRow
                label={t("tp.detail.stageAge")}
                value={
                  selected.currentStageAgeDays === null
                    ? t("tp.na")
                    : `${n(selected.currentStageAgeDays)}`
                }
              />
              <p className="text-xs text-muted-foreground">{t("tp.detail.noDescription")}</p>
              {selected.azureUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={selected.azureUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="size-3.5" aria-hidden />
                    {t("tp.detail.openAzure")}
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border/60 pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Iso className="text-end text-xs text-foreground">{value}</Iso>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 rounded-full border px-3 text-xs transition-colors ${
        active
          ? "border-azure/40 bg-azure/10 text-azure"
          : "border-border bg-background text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function DistributionList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: readonly { label: string; count: number }[];
  total: number;
}) {
  const { n } = useI18n();
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <Iso className="truncate text-foreground">{r.label}</Iso>
              <Iso className="text-muted-foreground">{n(r.count)}</Iso>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-azure"
                style={{ width: `${total > 0 ? Math.round((r.count / total) * 100) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
