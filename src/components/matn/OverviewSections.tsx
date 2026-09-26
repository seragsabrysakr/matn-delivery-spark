/**
 * Real-mode Overview sections (ADR-027): sprint status and story/task progress,
 * what needs attention now, and the project's delivery status. Every number
 * comes from a server payload; nothing is computed here beyond display.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Iso, LoadingBlock, Notice, SectionCard } from "@/components/matn/primitives";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { getDeliverySchedule, getStuckWork } from "@/lib/workspace/workspace.functions";
import type { SprintSummary } from "@/lib/overview/sprint-summary-rules";

const MAX_LISTED = 5;

function ItemLine({
  azureId,
  title,
  azureUrl,
  children,
}: {
  azureId: number;
  title: string;
  azureUrl: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-xs">
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
      {children ? <span className="shrink-0 text-muted-foreground">{children}</span> : null}
    </li>
  );
}

function MoreLink({ to, label }: { to: "/stuck" | "/delivery" | "/hierarchy"; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
      {label}
      <ChevronLeft className="size-3.5 ltr:rotate-180" aria-hidden />
    </Link>
  );
}

/** The sprint's phase as a notice when it is not running: the most important fact on the page. */
export function SprintPhaseNotice({
  summary,
  sprintName,
}: {
  summary: SprintSummary;
  sprintName: string;
}) {
  const { t } = useI18n();
  if (summary.phase === "ended") {
    return (
      <Notice
        tone="warning"
        title={t("ov.phase.ended.title")}
        body={t("ov.phase.ended.body", {
          a: sprintName,
          b: summary.finishDate ?? "—",
          c: summary.workingDaysSinceEnd ?? 0,
        })}
      />
    );
  }
  if (summary.phase === "notStarted") {
    return (
      <Notice
        tone="neutral"
        title={t("ov.phase.notStarted.title")}
        body={t("ov.phase.notStarted.body", { a: sprintName, b: summary.startDate ?? "—" })}
      />
    );
  }
  return null;
}

function Bar({ parts }: { parts: { value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {total > 0
        ? parts.map((p, i) => (
            <div key={i} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
          ))
        : null}
    </div>
  );
}

function Legend({ items }: { items: { key: TKey; value: number; dot: string }[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", i.dot)} aria-hidden />
          {t(i.key)} <Iso className="font-medium text-foreground">{String(i.value)}</Iso>
        </span>
      ))}
    </div>
  );
}

const DONE = "bg-emerald-500";
const DOING = "bg-primary";
const TODO = "bg-muted-foreground/30";

export function SprintSummaryCard({ summary }: { summary: SprintSummary }) {
  const { t } = useI18n();
  const s = summary.stories;
  const tk = summary.tasks;
  const behindExpected =
    summary.phase === "running" &&
    s.percent !== null &&
    summary.expectedPercent !== null &&
    s.percent < summary.expectedPercent;

  const timing =
    summary.phase === "running"
      ? t("ov.daysLeft", { a: summary.workingDaysLeft ?? 0 })
      : summary.phase === "ended"
        ? t("ov.endedOn", { a: summary.finishDate ?? "—" })
        : summary.phase === "notStarted"
          ? t("ov.startsOn", { a: summary.startDate ?? "—" })
          : t("real.sprintDates.unavailable");

  return (
    <SectionCard
      title={t("ov.sprint.title")}
      subtitle={t("ov.sprint.subtitle")}
      action={<Iso className="text-xs text-muted-foreground">{timing}</Iso>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{t("ov.stories")}</h3>
            {s.percent !== null ? (
              <Iso
                className={cn(
                  "text-2xl font-semibold",
                  behindExpected ? "text-critical" : "text-foreground",
                )}
              >
                {`${s.percent}%`}
              </Iso>
            ) : (
              <span className="text-sm text-muted-foreground">{t("common.na")}</span>
            )}
          </div>
          <Bar
            parts={[
              { value: s.done, className: DONE },
              { value: s.inProgress, className: DOING },
              { value: s.notStarted, className: TODO },
            ]}
          />
          <Legend
            items={[
              { key: "pp.done", value: s.done, dot: DONE },
              { key: "pp.inProgress", value: s.inProgress, dot: DOING },
              { key: "pp.notStarted", value: s.notStarted, dot: TODO },
            ]}
          />
          <p className="text-[11px] text-muted-foreground">
            <Iso>
              {s.points !== null
                ? t("ov.storiesPoints", {
                    a: s.done,
                    b: s.total,
                    c: s.pointsDone ?? 0,
                    d: s.points,
                  })
                : t("ov.storiesCount", { a: s.done, b: s.total })}
            </Iso>
            {summary.phase === "running" && summary.expectedPercent !== null ? (
              <Iso className={cn("ms-2", behindExpected ? "text-critical" : "")}>
                {t("ov.expected", { a: summary.expectedPercent })}
              </Iso>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">{t("ov.tasks")}</h3>
            {tk.percent !== null ? (
              <Iso className="text-2xl font-semibold text-foreground">{`${tk.percent}%`}</Iso>
            ) : (
              <span className="text-sm text-muted-foreground">{t("common.na")}</span>
            )}
          </div>
          <Bar
            parts={[
              { value: tk.done, className: DONE },
              { value: tk.inProgress, className: DOING },
              { value: tk.notStarted, className: TODO },
            ]}
          />
          <Legend
            items={[
              { key: "pp.done", value: tk.done, dot: DONE },
              { key: "pp.inProgress", value: tk.inProgress, dot: DOING },
              { key: "pp.notStarted", value: tk.notStarted, dot: TODO },
            ]}
          />
          <p className="text-[11px] text-muted-foreground">{t("ov.tasksNote")}</p>
        </div>
      </div>
      {summary.storiesBehindTasks.length > 0 ? (
        <div className="mt-5 rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs font-medium text-warning">
            {t("ov.behind.title", { a: summary.storiesBehindTasks.length, b: s.total })}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("ov.behind.body")}</p>
          <ul className="mt-1 divide-y divide-border">
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
      ) : null}
    </SectionCard>
  );
}

/** Stuck work of the selected sprint, oldest first, with who holds it. */
export function AttentionCard({ teamIterationId }: { teamIterationId: string }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["stuck-work"],
    queryFn: () => getStuckWork({ data: {} }),
    retry: false,
  });
  const rows = query.data?.ok
    ? query.data.stuck.rows.filter((r) => r.teamIterationId === teamIterationId)
    : null;
  return (
    <SectionCard
      title={t("ov.attention.title")}
      subtitle={t("ov.attention.subtitle")}
      action={
        rows && rows.length > 0 ? (
          <MoreLink to="/stuck" label={t("ov.all", { a: rows.length })} />
        ) : null
      }
    >
      {query.isLoading ? (
        <LoadingBlock rows={3} />
      ) : !rows ? (
        <p className="text-xs text-muted-foreground">{t("state.error.title")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("st.none")}</p>
      ) : (
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
                  <Iso className="text-[11px] text-critical">
                    {t(row.ageBasis === "state_change" ? "bd.daysApprox" : "bd.days", {
                      a: row.daysInColumn,
                    })}
                  </Iso>
                ) : null}
              </span>
            </ItemLine>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const STATUS_TONE: Record<string, string> = {
  late: "text-critical",
  at_risk: "text-warning",
  no_committed_date: "text-muted-foreground",
  on_track: "text-primary",
  delivered: "text-emerald-700 dark:text-emerald-300",
};
const STATUSES = ["late", "at_risk", "on_track", "no_committed_date", "delivered"] as const;

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
        {STATUSES.map((s) => (
          <div key={s} className="rounded-md border border-border p-2 text-center">
            <Iso className={cn("text-lg font-semibold", STATUS_TONE[s])}>{String(count(s))}</Iso>
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
              <span className={STATUS_TONE[d.status]}>
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
