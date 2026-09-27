/**
 * Real-mode Overview (ADR-027, ADR-028): the command center opens on every
 * project, then the selected sprint — its status, what needs attention, how
 * the team delivers over time, deliverables and data health. Every number
 * comes from a server payload; nothing is computed here beyond display.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  ExternalLink,
  Gauge,
  Layers,
  OctagonAlert,
  RefreshCw,
  UserX,
} from "lucide-react";
import { Iso, LoadingBlock, SectionCard } from "@/components/matn/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import {
  getDeliverySchedule,
  getPeople,
  getPortfolio,
  getSprintHistory,
  getStuckWork,
} from "@/lib/workspace/workspace.functions";
import type { SprintSummary } from "@/lib/overview/sprint-summary-rules";
import type { PortfolioRow } from "@/lib/portfolio/portfolio.server";
import type { PortfolioStatus } from "@/lib/portfolio/portfolio-rules";

const MAX_LISTED = 5;

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function ItemLine({
  azureId,
  title,
  azureUrl,
  children,
}: {
  azureId: number;
  title: string;
  azureUrl: string | null;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 text-xs">
      <span className="min-w-0">
        <span className="text-foreground">
          <Iso>{title}</Iso>
        </span>{" "}
        <Iso className="text-[11px] text-muted-foreground">#{azureId}</Iso>
        {azureUrl ? (
          <a
            href={azureUrl}
            target="_blank"
            rel="noreferrer"
            className="ms-1 inline-flex text-primary"
            aria-label="Azure DevOps"
          >
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </span>
      {children ? (
        <span className="shrink-0 text-end text-muted-foreground">{children}</span>
      ) : null}
    </li>
  );
}

function MoreLink({
  to,
  label,
}: {
  to: "stuck" | "/delivery" | "/hierarchy" | "/team" | "/backlog";
  label: string;
}) {
  // Stuck work is a tab of the Sprint board page (ADR-029).
  const target =
    to === "stuck" ? ({ to: "/board", search: { tab: "stuck" } } as const) : ({ to } as const);
  return (
    <Link
      {...target}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {label}
      <ChevronLeft className="size-3.5 ltr:rotate-180" aria-hidden />
    </Link>
  );
}

/** A progress ring; `value` is 0–100, null draws an empty track. */
function Ring({
  value,
  size = 64,
  stroke = 7,
  className,
  children,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  className: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className={cn("transition-[stroke-dashoffset] duration-700", className)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

const STATUS_STYLE: Record<
  PortfolioStatus,
  { dot: string; pill: string; ring: string; key: TKey }
> = {
  late: {
    dot: "bg-critical",
    pill: "bg-critical/10 text-critical border-critical/30",
    ring: "stroke-critical",
    key: "ov.status.late",
  },
  behind: {
    dot: "bg-warning",
    pill: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
    ring: "stroke-warning",
    key: "ov.status.behind",
  },
  attention: {
    dot: "bg-warning",
    pill: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
    ring: "stroke-warning",
    key: "ov.status.attention",
  },
  onTrack: {
    dot: "bg-success",
    pill: "bg-success/10 text-success border-success/30",
    ring: "stroke-success",
    key: "ov.status.onTrack",
  },
  idle: {
    dot: "bg-muted-foreground/40",
    pill: "bg-muted text-muted-foreground border-border",
    ring: "stroke-muted-foreground/40",
    key: "ov.status.idle",
  },
};

function phaseLine(
  t: ReturnType<typeof useI18n>["t"],
  p: {
    phase: string;
    workingDaysLeft: number | null;
    workingDaysSinceEnd: number | null;
    finishDate: string | null;
    startDate: string | null;
  },
): string {
  switch (p.phase) {
    case "running":
      return t("ov.daysLeft", { a: p.workingDaysLeft ?? 0 });
    case "overdue":
      return t("ov.lateBy", { a: p.workingDaysSinceEnd ?? 0 });
    case "inactive":
      return t("ov.inactiveSince", { a: p.finishDate ?? "—" });
    case "ended":
      return t("ov.endedOn", { a: p.finishDate ?? "—" });
    case "notStarted":
      return t("ov.startsOn", { a: p.startDate ?? "—" });
    default:
      return t("real.sprintDates.unavailable");
  }
}

/* ------------------------------------------------------------------ */
/* Command header + portfolio                                          */
/* ------------------------------------------------------------------ */

function HeroStat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Activity;
  value: number | string;
  label: string;
  tone?: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
      <span className={cn("grid size-9 place-items-center rounded-lg bg-white/10", tone)}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <Iso className="block text-2xl font-semibold leading-none text-white">{String(value)}</Iso>
        <span className="mt-1 block truncate text-[11px] text-white/70">{label}</span>
      </span>
    </div>
  );
}

/**
 * The top of the page: title, live state and sync, then four portfolio
 * numbers that say at once whether anything is on fire.
 */
export function CommandHeader() {
  const { t } = useI18n();
  const { syncing, runSync } = useWorkspace();
  const query = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => getPortfolio({ data: {} }),
    retry: false,
  });
  const rows = query.data?.ok ? query.data.portfolio.rows : [];
  const active = rows.filter((r) => r.status !== "idle");
  const late = rows.filter((r) => r.phase === "overdue").length;
  const stuck = active.reduce((s, r) => s + r.stuck, 0);
  const behind = active.reduce((s, r) => s + r.storiesBehindTasks, 0);

  return (
    <section className="relative overflow-hidden rounded-2xl bg-navy px-5 py-6 text-navy-foreground shadow-card sm:px-7 sm:py-7">
      <div
        className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full bg-white/5 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 start-1/3 size-80 rounded-full bg-primary/30 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/60">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              {t("real.mode.badge")} · Azure DevOps
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {t("ov.hero.title")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/70">{t("ov.hero.subtitle")}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="min-h-10 shrink-0 bg-white/15 text-white hover:bg-white/25"
            disabled={syncing}
            onClick={runSync}
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} aria-hidden />
            {syncing ? t("real.sync.running") : t("real.sync.action")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat icon={Activity} value={active.length} label={t("ov.hero.active")} />
          <HeroStat
            icon={Clock}
            value={late}
            label={t("ov.hero.late")}
            tone={late > 0 ? "text-red-300" : undefined}
          />
          <HeroStat
            icon={OctagonAlert}
            value={stuck}
            label={t("ov.hero.stuck")}
            tone={stuck > 0 ? "text-amber-300" : undefined}
          />
          <HeroStat
            icon={Layers}
            value={behind}
            label={t("ov.hero.behind")}
            tone={behind > 0 ? "text-amber-300" : undefined}
          />
        </div>
      </div>
    </section>
  );
}

function PortfolioCard({ row, selected }: { row: PortfolioRow; selected: boolean }) {
  const { t } = useI18n();
  const { setFilter } = useWorkspace();
  const style = STATUS_STYLE[row.status];
  const select = () => {
    setFilter("organizationId", row.organizationId);
    setFilter("projectId", row.projectId);
    setFilter("teamId", row.teamId);
    setFilter("iterationId", row.teamIterationId);
  };
  return (
    <button
      type="button"
      onClick={select}
      aria-pressed={selected}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-card p-4 text-start shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            <Iso>{row.projectName}</Iso>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            <Iso>{`${row.teamName} · ${row.sprintName}`}</Iso>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            style.pill,
          )}
        >
          <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
          {t(style.key)}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Ring value={row.stories.percent} className={style.ring} size={58} stroke={6}>
          <Iso className="text-xs font-semibold text-foreground">
            {row.stories.percent === null ? "—" : `${Math.round(row.stories.percent)}%`}
          </Iso>
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[11px]">
          <Metric label={t("ov.stories")} a={row.stories.done} b={row.stories.total} />
          <Metric label={t("ov.tasks")} a={row.tasks.done} b={row.tasks.total} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px]">
        <span
          className={cn(
            "inline-flex items-center gap-1",
            row.phase === "overdue" ? "font-medium text-critical" : "text-muted-foreground",
          )}
        >
          <Clock className="size-3" aria-hidden />
          <Iso>{phaseLine(t, row)}</Iso>
        </span>
        {row.stuck > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-critical">
            <OctagonAlert className="size-3" aria-hidden />
            <Iso>{t("ov.stuckCount", { a: row.stuck })}</Iso>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-success">
            <CheckCircle2 className="size-3" aria-hidden />
            {t("ov.noStuck")}
          </span>
        )}
      </div>
    </button>
  );
}

function Metric({ label, a, b }: { label: string; a: number; b: number }) {
  const pct = b > 0 ? (a / b) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>{label}</span>
        <Iso className="font-medium text-foreground">{`${a}/${b}`}</Iso>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Every project's current sprint, problems first; idle teams folded into one line. */
export function PortfolioGrid() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const query = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => getPortfolio({ data: {} }),
    retry: false,
  });
  if (query.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }
  const rows = query.data?.ok ? query.data.portfolio.rows : [];
  const active = rows.filter((r) => r.status !== "idle");
  const idle = rows.filter((r) => r.status === "idle");
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("ov.portfolio.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("ov.portfolio.subtitle")}</p>
        </div>
      </div>
      {active.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((row) => (
            <PortfolioCard
              key={row.teamIterationId}
              row={row}
              selected={row.teamIterationId === filters.iterationId}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ov.portfolio.none")}</p>
      )}
      {idle.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium">{t("ov.portfolio.idle")}</span>{" "}
          <Iso>{idle.map((r) => `${r.projectName} (${phaseLine(t, r)})`).join(" · ")}</Iso>
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Selected sprint                                                     */
/* ------------------------------------------------------------------ */

/** Title of the selected-sprint section, with its phase in plain words. */
export function SprintHeading({
  summary,
  sprintName,
}: {
  summary: SprintSummary;
  sprintName: string;
}) {
  const { t } = useI18n();
  const late = summary.phase === "overdue";
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("ov.selected")}
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          <Iso>{sprintName}</Iso>
        </h2>
      </div>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
          late
            ? "border-critical/30 bg-critical/10 text-critical"
            : "border-border bg-surface text-muted-foreground",
        )}
      >
        <Clock className="size-3.5" aria-hidden />
        <Iso>{phaseLine(t, summary)}</Iso>
      </span>
    </div>
  );
}

/** Explains a late or finished sprint once, in plain words. */
export function SprintPhaseNotice({
  summary,
  sprintName,
}: {
  summary: SprintSummary;
  sprintName: string;
}) {
  const { t } = useI18n();
  const text =
    summary.phase === "overdue"
      ? t("ov.phase.overdue.body", {
          a: sprintName,
          b: summary.finishDate ?? "—",
          c: summary.workingDaysSinceEnd ?? 0,
          d: summary.stories.total - summary.stories.done,
        })
      : summary.phase === "inactive"
        ? t("ov.phase.inactive.body", { a: sprintName, b: summary.finishDate ?? "—" })
        : summary.phase === "ended"
          ? t("ov.phase.ended.body", { a: sprintName, b: summary.finishDate ?? "—" })
          : null;
  if (!text) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        summary.phase === "overdue"
          ? "border-critical/30 bg-critical/5"
          : "border-border bg-surface",
      )}
      role="status"
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          summary.phase === "overdue" ? "text-critical" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <p className="text-foreground">{text}</p>
    </div>
  );
}

function StackBar({ done, doing, todo }: { done: number; doing: number; todo: number }) {
  const total = done + doing + todo;
  const w = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="bg-success" style={{ width: w(done) }} />
      <div className="bg-primary/70" style={{ width: w(doing) }} />
      <div className="bg-muted-foreground/25" style={{ width: w(todo) }} />
    </div>
  );
}

function ProgressBlock({
  title,
  percent,
  counts,
  ringClass,
  caption,
}: {
  title: string;
  percent: number | null;
  counts: { done: number; inProgress: number; notStarted: number; total: number };
  ringClass: string;
  caption: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-5">
      <Ring value={percent} className={ringClass} size={96} stroke={9}>
        <span className="flex flex-col items-center">
          <Iso className="text-xl font-semibold text-foreground">
            {percent === null ? "—" : `${Math.round(percent)}%`}
          </Iso>
          <span className="text-[10px] text-muted-foreground">{t("pp.done")}</span>
        </span>
      </Ring>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Iso className="text-xs text-muted-foreground">{`${counts.done}/${counts.total}`}</Iso>
        </div>
        <StackBar done={counts.done} doing={counts.inProgress} todo={counts.notStarted} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <Legend dot="bg-success" label={t("pp.done")} value={counts.done} />
          <Legend dot="bg-primary/70" label={t("pp.inProgress")} value={counts.inProgress} />
          <Legend
            dot="bg-muted-foreground/25"
            label={t("pp.notStarted")}
            value={counts.notStarted}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {label} <Iso className="font-medium text-foreground">{String(value)}</Iso>
    </span>
  );
}

export function SprintSummaryCard({ summary }: { summary: SprintSummary }) {
  const { t } = useI18n();
  const s = summary.stories;
  const behindPace =
    summary.phase === "running" &&
    s.percent !== null &&
    summary.expectedPercent !== null &&
    s.percent < summary.expectedPercent;
  return (
    <SectionCard title={t("ov.sprint.title")} subtitle={t("ov.sprint.subtitle")}>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProgressBlock
          title={t("ov.stories")}
          percent={s.percent}
          counts={s}
          ringClass={
            behindPace || summary.phase === "overdue" ? "stroke-critical" : "stroke-success"
          }
          caption={
            <>
              {s.points !== null ? (
                <Iso>{t("ov.pointsOf", { a: s.pointsDone ?? 0, b: s.points })}</Iso>
              ) : null}
              {summary.phase === "running" && summary.expectedPercent !== null ? (
                <Iso className={cn("ms-2", behindPace && "font-medium text-critical")}>
                  {t("ov.expected", { a: summary.expectedPercent })}
                </Iso>
              ) : null}
            </>
          }
        />
        <ProgressBlock
          title={t("ov.tasks")}
          percent={summary.tasks.percent}
          counts={summary.tasks}
          ringClass="stroke-primary"
          caption={t("ov.tasksNote")}
        />
      </div>
      {summary.storiesBehindTasks.length > 0 ? (
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <Layers className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {t("ov.behind.title", { a: summary.storiesBehindTasks.length, b: s.total })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("ov.behind.body")}</p>
              <ul className="mt-2 divide-y divide-border">
                {summary.storiesBehindTasks.slice(0, MAX_LISTED).map((story) => (
                  <ItemLine key={story.azureId} {...story}>
                    <Iso>{t("bd.tasks", { a: story.tasksDone, b: story.tasks })}</Iso>
                  </ItemLine>
                ))}
              </ul>
              {summary.storiesBehindTasks.length > MAX_LISTED ? (
                <MoreLink
                  to="/hierarchy"
                  label={t("ov.more", { a: summary.storiesBehindTasks.length - MAX_LISTED })}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

/** Stuck work and people who stopped updating Azure: who to talk to today. */
export function AttentionCard({ teamIterationId }: { teamIterationId: string }) {
  const { t } = useI18n();
  const stuckQuery = useQuery({
    queryKey: ["stuck-work"],
    queryFn: () => getStuckWork({ data: {} }),
    retry: false,
  });
  const peopleQuery = useQuery({
    queryKey: ["people", teamIterationId],
    queryFn: () => getPeople({ data: { teamIterationId } }),
    retry: false,
  });
  const rows = stuckQuery.data?.ok
    ? stuckQuery.data.stuck.rows.filter((r) => r.teamIterationId === teamIterationId)
    : null;
  const silent = peopleQuery.data?.ok
    ? peopleQuery.data.people.people.filter((p) => p.noUpdate)
    : [];
  return (
    <SectionCard
      title={t("ov.attention.title")}
      subtitle={t("ov.attention.subtitle")}
      action={
        rows && rows.length > 0 ? (
          <MoreLink to="stuck" label={t("ov.all", { a: rows.length })} />
        ) : null
      }
    >
      {stuckQuery.isLoading ? (
        <LoadingBlock rows={3} />
      ) : (
        <div className="flex flex-col gap-4">
          {rows && rows.length > 0 ? (
            <ul className="divide-y divide-border">
              {rows.slice(0, MAX_LISTED).map((row) => (
                <ItemLine
                  key={row.azureId}
                  azureId={row.azureId}
                  title={row.title}
                  azureUrl={row.azureUrl}
                >
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-foreground">
                      {row.assignee ? <Iso>{row.assignee}</Iso> : "—"}
                    </span>
                    {row.daysInColumn !== null ? (
                      <Iso className="text-[11px] font-medium text-critical">
                        {t(row.ageBasis === "state_change" ? "bd.daysApprox" : "bd.days", {
                          a: row.daysInColumn,
                        })}
                      </Iso>
                    ) : null}
                  </span>
                </ItemLine>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              {t("st.none")}
            </p>
          )}
          {silent.length > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                <UserX className="size-3.5 text-warning" aria-hidden />
                {t("ov.silent.title", { a: silent.length })}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {silent.map((p) => (
                  <li
                    key={p.memberId}
                    className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground"
                  >
                    <Iso>{p.displayName}</Iso>
                    {p.idleWorkingDays !== null ? (
                      <Iso className="ms-1 text-muted-foreground">{`· ${p.idleWorkingDays}d`}</Iso>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <MoreLink to="/team" label={t("nav.team")} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

/** Say/do and velocity of the team's recent finished sprints (ADR-018). */
export function DeliveryTrendCard({ teamIterationId }: { teamIterationId: string }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["sprint-history", teamIterationId],
    queryFn: () => getSprintHistory({ data: { teamIterationId } }),
    retry: false,
  });
  const history = query.data?.ok ? query.data.history : null;
  const sprints = (history?.rows ?? [])
    .filter((r) => r.status === "completed")
    .slice(0, 6)
    .reverse();
  return (
    <SectionCard
      title={t("ov.trend.title")}
      subtitle={t("ov.trend.subtitle")}
      action={<MoreLink to="/delivery" label={t("nav.delivery")} />}
    >
      {query.isLoading ? (
        <LoadingBlock rows={3} />
      ) : sprints.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ov.trend.none")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-3" style={{ height: 132 }}>
            {sprints.map((r) => {
              const v = r.sayDo?.percent ?? null;
              const tone =
                v === null
                  ? "bg-muted"
                  : v >= 80
                    ? "bg-success"
                    : v >= 50
                      ? "bg-warning"
                      : "bg-critical";
              return (
                <div
                  key={r.iterationId}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                >
                  <Iso className="text-[11px] font-semibold text-foreground">
                    {v === null ? "—" : `${Math.round(v)}%`}
                  </Iso>
                  <div className="flex w-full max-w-12 flex-1 items-end rounded-md bg-muted/60">
                    <div
                      className={cn("w-full rounded-md transition-all", tone)}
                      style={{ height: `${Math.max(v ?? 0, 3)}%` }}
                    />
                  </div>
                  <Iso className="max-w-full truncate text-[10px] text-muted-foreground">
                    {r.name}
                  </Iso>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <TrendFact
              label={t("ov.trend.velocity")}
              value={history?.averageVelocity ? `${history.averageVelocity.mean}` : "—"}
            />
            <TrendFact
              label={t("ov.trend.lastSayDo")}
              value={sprints.at(-1)?.sayDo ? `${Math.round(sprints.at(-1)!.sayDo!.percent)}%` : "—"}
            />
            <TrendFact
              label={t("ov.trend.carried")}
              value={sprints.at(-1)?.carriedOver ? `${sprints.at(-1)!.carriedOver!.count}` : "—"}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function TrendFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Iso className="block text-lg font-semibold text-foreground">{value}</Iso>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

const DELIVERY_TONE: Record<string, string> = {
  late: "text-critical",
  at_risk: "text-warning",
  no_committed_date: "text-muted-foreground",
  on_track: "text-primary",
  delivered: "text-success",
};
const DELIVERY_STATUSES = [
  "late",
  "at_risk",
  "on_track",
  "no_committed_date",
  "delivered",
] as const;

/** The selected project's deliverables by status (ADR-021), problems first. */
export function DeliveryStatusCard({ teamIterationId }: { teamIterationId: string }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["delivery-schedule", teamIterationId],
    queryFn: () => getDeliverySchedule({ data: { teamIterationId } }),
    retry: false,
  });
  const schedule = query.data?.ok ? query.data.schedule : null;
  if (query.isLoading) {
    return (
      <SectionCard title={t("ov.delivery.title")}>
        <LoadingBlock rows={3} />
      </SectionCard>
    );
  }
  // Nothing to show until a delivery mapping exists; the Delivery page sets it up.
  if (!schedule || !schedule.mapping || schedule.deliverables.length === 0) return null;
  const count = (s: string) => schedule.deliverables.filter((d) => d.status === s).length;
  const problems = schedule.deliverables.filter(
    (d) => d.status === "late" || d.status === "at_risk",
  );
  return (
    <SectionCard
      title={t("ov.delivery.title")}
      subtitle={schedule.projectName}
      action={<MoreLink to="/delivery" label={t("ov.all", { a: schedule.deliverables.length })} />}
    >
      <div className="grid grid-cols-5 gap-2">
        {DELIVERY_STATUSES.map((s) => (
          <div key={s} className="rounded-lg border border-border bg-surface p-2.5 text-center">
            <Iso className={cn("text-xl font-semibold", DELIVERY_TONE[s])}>{String(count(s))}</Iso>
            <p className="text-[10px] leading-tight text-muted-foreground">
              {t(`dl.status.${s}` as TKey)}
            </p>
          </div>
        ))}
      </div>
      {problems.length > 0 ? (
        <ul className="mt-3 divide-y divide-border">
          {problems.slice(0, MAX_LISTED).map((d) => (
            <ItemLine key={d.id} azureId={d.azureWorkItemId} title={d.title} azureUrl={d.azureUrl}>
              <span className={DELIVERY_TONE[d.status]}>
                {t(`dl.status.${d.status}` as TKey)}
                {d.progressPercent !== null ? (
                  <Iso className="ms-1">{`· ${d.progressPercent}%`}</Iso>
                ) : null}
              </span>
            </ItemLine>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}

/** Gaps in the Azure data behind the numbers, each one a count. */
export function DataHealthStrip({ summary }: { summary: SprintSummary }) {
  const { t } = useI18n();
  const h = summary.dataHealth;
  const items: { key: TKey; value: number; to?: "/backlog" | "/team" | "/hierarchy" }[] = [
    { key: "ov.health.unestimated", value: h.storiesUnestimated, to: "/hierarchy" },
    { key: "ov.health.unowned", value: h.storiesUnowned, to: "/hierarchy" },
    { key: "ov.health.tasksUnassigned", value: h.openTasksUnassigned, to: "/team" },
    { key: "ov.health.capacity", value: h.membersWithoutCapacity, to: "/team" },
  ];
  const issues = items.filter((i) => i.value > 0);
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
          {t("ov.health.title")}
        </span>
        {issues.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {t("ov.health.ok")}
          </span>
        ) : (
          issues.map((i) => (
            <span
              key={i.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/5 px-2.5 py-1 text-xs text-foreground"
            >
              <Iso className="font-semibold text-warning">{String(i.value)}</Iso>
              {t(i.key, { a: h.members })}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * A sprint a later one has replaced shows only what happened in it, as it
 * stood at its end (ADR-018, ADR-029) — never today's state of its items.
 */
export function SprintResultCard({
  teamIterationId,
  summary,
  sprintName,
}: {
  teamIterationId: string;
  summary: SprintSummary;
  sprintName: string;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["sprint-history", teamIterationId],
    queryFn: () => getSprintHistory({ data: { teamIterationId } }),
    retry: false,
  });
  const row = query.data?.ok
    ? query.data.history.rows.find(
        (r) => r.startDate === summary.startDate && r.finishDate === summary.finishDate,
      )
    : undefined;
  const tally = (v: { count: number; points: number | null } | null) =>
    v === null
      ? "—"
      : v.points !== null
        ? `${v.count} · ${v.points} ${t("sh.points")}`
        : String(v.count);
  return (
    <SectionCard
      title={t("ov.result.title")}
      subtitle={t("ov.result.subtitle", { a: sprintName, b: summary.finishDate ?? "—" })}
      action={<MoreLink to="/delivery" label={t("nav.delivery")} />}
    >
      {query.isLoading ? (
        <LoadingBlock rows={3} />
      ) : !row ? (
        <p className="text-sm text-muted-foreground">{t("ov.result.none")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-5">
            <Ring
              value={row.sayDo?.percent ?? null}
              className={
                (row.sayDo?.percent ?? 0) >= 80
                  ? "stroke-success"
                  : (row.sayDo?.percent ?? 0) >= 50
                    ? "stroke-warning"
                    : "stroke-critical"
              }
              size={96}
              stroke={9}
            >
              <span className="flex flex-col items-center">
                <Iso className="text-xl font-semibold text-foreground">
                  {row.sayDo ? `${Math.round(row.sayDo.percent)}%` : "—"}
                </Iso>
                <span className="text-[10px] text-muted-foreground">Say/Do</span>
              </span>
            </Ring>
            <p className="text-sm text-muted-foreground">{t("ov.result.sayDo")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["ov.result.committed", tally(row.committed)],
                ["ov.result.added", tally(row.added)],
                ["ov.result.removed", tally(row.removed)],
                ["ov.result.delivered", tally(row.delivered)],
                ["ov.result.carried", tally(row.carriedOver)],
                ["ov.result.velocity", row.velocity === null ? "—" : `${row.velocity}`],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-border bg-surface p-3">
                <Iso className="block text-base font-semibold text-foreground">{value}</Iso>
                <span className="text-[11px] text-muted-foreground">{t(key)}</span>
              </div>
            ))}
          </div>
          {row.deliveredAfterEnd && row.deliveredAfterEnd.count > 0 ? (
            <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-foreground">
              {t("ov.result.lateClosed", {
                a: row.deliveredAfterEnd.count,
                b: row.medianDaysLate ?? "—",
              })}
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

/** On pages that show live items, says once that an old sprint is history (ADR-029). */
export function EndedSprintNotice() {
  const { t, locale } = useI18n();
  const { sprintSummary, iteration } = useWorkspace();
  if (sprintSummary?.phase !== "ended") return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-foreground">
        {t("ov.phase.ended.live", {
          a: iteration?.name[locale] ?? "",
          b: sprintSummary.finishDate ?? "—",
        })}{" "}
        <MoreLink to="/delivery" label={t("nav.delivery")} />
      </p>
    </div>
  );
}
