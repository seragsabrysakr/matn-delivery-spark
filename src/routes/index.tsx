import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/matn/AppShell";
import { KpiGrid } from "@/components/matn/KpiGrid";
import { TrajectoryCard } from "@/components/matn/Trajectory";
import { RisksCard } from "@/components/matn/Risks";
import { FunnelCard } from "@/components/matn/Funnel";
import { TeamLoadCard } from "@/components/matn/TeamLoad";
import { EngineeringHealthCard } from "@/components/matn/EngineeringHealth";
import { RecommendedActionsCard } from "@/components/matn/RecommendedActions";
import {
  AttentionCard,
  CommandHeader,
  DataHealthStrip,
  DeliveryStatusCard,
  DeliveryTrendCard,
  PortfolioGrid,
  SprintHeading,
  SprintPhaseNotice,
  SprintSummaryCard,
} from "@/components/matn/OverviewSections";
import { ErrorBlock, Iso, LoadingBlock, Notice, SectionCard } from "@/components/matn/primitives";
import { useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MATN Delivery Intelligence — Executive Overview" },
      {
        name: "description",
        content:
          "Executive delivery command center: sprint status, stuck work, risks, delivery status and team load in Arabic and English.",
      },
      { property: "og:title", content: "MATN Delivery Intelligence — Executive Overview" },
      {
        property: "og:description",
        content: "Sprint status, stuck work, risks and delivery status in one executive view.",
      },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { t, locale } = useI18n();
  const { iteration, mode, unavailable, syncMessage, sprintDatesUnavailable } = useWorkspace();
  const noSprintDates = sprintDatesUnavailable;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        {mode === "real" ? (
          <CommandHeader />
        ) : (
          <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="min-w-0 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {t("overview.title")}
                </h1>
                <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t("real.mode.mock")}
                </span>
                {iteration ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{iteration.name[locale]}</span>
                    <span aria-hidden>·</span>
                    <Iso>
                      {t("overview.sprintDay", { a: iteration.currentDay, b: iteration.totalDays })}
                    </Iso>
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{t("overview.subtitle")}</p>
            </div>
          </header>
        )}

        {syncMessage ? (
          <Notice tone="warning" title={t("state.error.title")} body={syncMessage} />
        ) : null}
        {mode === "real" && unavailable["workItems"] ? (
          <Notice
            tone="neutral"
            title={t("real.unavailable.title")}
            body={t("real.unavailable.noWorkItems")}
          />
        ) : null}
        {noSprintDates ? (
          <Notice
            tone="warning"
            title={t("real.unavailable.title")}
            body={t("real.unavailable.noSprintDates")}
          />
        ) : null}

        {mode === "real" ? <RealOverview /> : <DemoOverview />}
      </div>
    </AppShell>
  );
}

function FreshnessNotices() {
  const { t } = useI18n();
  const { snapshot, loading } = useWorkspace();
  if (loading || !snapshot) return null;
  if (snapshot.freshness === "stale") {
    return (
      <Notice
        tone="warning"
        title={t("state.stale.title")}
        body={t("state.stale.body", {
          a: t("common.minutes", { a: snapshot.lastSyncMinutesAgo }),
        })}
      />
    );
  }
  if (snapshot.freshness === "partial") {
    return (
      <Notice tone="neutral" title={t("state.partial.title")} body={t("state.partial.body")} />
    );
  }
  return null;
}

/**
 * Live data (ADR-027): what the sprint looks like, what needs attention, what
 * is at risk and how delivery stands. Cards with no synchronized source are
 * left out instead of shown as "unavailable".
 */
function RealOverview() {
  const { t, locale } = useI18n();
  const { snapshot, iteration, loading, error, refresh, unavailable, sprintSummary, filters } =
    useWorkspace();

  if (error) {
    return (
      <SectionCard title={t("state.error.title")}>
        <ErrorBlock onRetry={refresh} />
      </SectionCard>
    );
  }
  if (loading || !snapshot || !sprintSummary) {
    return (
      <>
        <SectionCard title={t("ov.sprint.title")}>
          <LoadingBlock rows={4} />
        </SectionCard>
        <SectionCard title={t("ov.attention.title")}>
          <LoadingBlock rows={3} />
        </SectionCard>
      </>
    );
  }

  const sprintName = iteration?.name[locale] ?? "";
  return (
    <>
      <FreshnessNotices />
      <PortfolioGrid />
      <SprintHeading summary={sprintSummary} sprintName={sprintName} />
      <SprintPhaseNotice summary={sprintSummary} sprintName={sprintName} />
      <SprintSummaryCard summary={sprintSummary} />
      <div className="grid gap-4 xl:grid-cols-2">
        <AttentionCard teamIterationId={filters.iterationId} />
        <DeliveryTrendCard teamIterationId={filters.iterationId} />
      </div>
      <DeliveryStatusCard teamIterationId={filters.iterationId} />
      <DataHealthStrip summary={sprintSummary} />
      <SyncDetails />
    </>
  );
}

/** The last sync's counters, folded away: useful for support, noise for a manager. */
function SyncDetails() {
  const { t } = useI18n();
  const { syncReport, backlogReport, historyReport } = useWorkspace();
  if (!syncReport && !backlogReport && !historyReport) return null;
  const failed =
    (syncReport && (syncReport.status !== "succeeded" || syncReport.truncated)) ||
    (backlogReport && (backlogReport.status !== "succeeded" || backlogReport.truncated)) ||
    (historyReport && historyReport.status !== "succeeded");
  return (
    <details
      className="rounded-lg border border-border bg-card px-4 py-3 text-xs"
      open={Boolean(failed)}
    >
      <summary className="cursor-pointer text-muted-foreground">
        {t("ov.syncDetails")}
        {failed ? <span className="ms-2 text-warning">⚠</span> : null}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {syncReport ? (
          <Notice
            tone={
              syncReport.status === "succeeded" && !syncReport.truncated ? "neutral" : "warning"
            }
            title={t("real.sync.reportTitle")}
            body={`${t("real.sync.report", {
              a: syncReport.discoveredIds,
              b: syncReport.read,
              c: syncReport.inserted,
              d: syncReport.updated,
              e: syncReport.unchanged,
              f: syncReport.detached,
              g: syncReport.failed,
            })}${syncReport.truncated ? ` — ${t("real.sync.truncated")}` : ""} · ${
              syncReport.capacity
                ? t("real.sync.capacity", {
                    a: syncReport.capacity.configured,
                    b: syncReport.capacity.members,
                    c: syncReport.capacity.teamDaysOff,
                  })
                : t("real.sync.capacityUnavailable")
            }`}
          />
        ) : null}
        {backlogReport ? (
          <Notice
            tone={
              backlogReport.status === "succeeded" && !backlogReport.truncated
                ? "neutral"
                : "warning"
            }
            title={t("real.backlog.reportTitle")}
            body={
              backlogReport.status === "failed"
                ? (backlogReport.message ?? t("real.backlog.failed"))
                : `${t(
                    backlogReport.mode === "full"
                      ? "real.backlog.modeFull"
                      : "real.backlog.modeIncremental",
                  )} · ${t("real.backlog.report", {
                    a: backlogReport.discoveredIds,
                    b: backlogReport.inserted,
                    c: backlogReport.updated,
                    d: backlogReport.unchanged,
                    e: backlogReport.rechecked,
                    f: backlogReport.unavailable,
                    g: backlogReport.failed,
                  })}${backlogReport.truncated ? ` — ${t("real.backlog.truncated")}` : ""}`
            }
          />
        ) : null}
        {historyReport ? (
          <Notice
            tone={historyReport.status === "succeeded" ? "neutral" : "warning"}
            title={t("real.history.reportTitle")}
            body={
              historyReport.status === "failed"
                ? (historyReport.message ?? t("real.history.failed"))
                : `${t("real.history.report", {
                    a: historyReport.items,
                    b: historyReport.revisions,
                    c: historyReport.transitions,
                    d: historyReport.scopeChanges,
                    e: historyReport.failed,
                  })}${
                    historyReport.remaining > 0
                      ? ` — ${t("real.history.remaining", { a: historyReport.remaining })}`
                      : ""
                  }`
            }
          />
        ) : null}
      </div>
    </details>
  );
}

/** Demo data shown only before any sprint is synchronized. */
function DemoOverview() {
  const { t } = useI18n();
  const { snapshot, iteration, loading, error, refresh } = useWorkspace();
  if (error) {
    return (
      <SectionCard title={t("state.error.title")}>
        <ErrorBlock onRetry={refresh} />
      </SectionCard>
    );
  }
  return (
    <>
      <FreshnessNotices />
      <KpiGrid kpis={snapshot?.kpis ?? []} loading={loading} />
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {loading || !snapshot ? (
          <SectionCard title={t("trajectory.title")}>
            <LoadingBlock rows={5} />
          </SectionCard>
        ) : (
          <TrajectoryCard
            trajectory={snapshot.trajectory}
            currentDay={iteration?.currentDay ?? 0}
            totalDays={iteration?.totalDays ?? 0}
          />
        )}
        {loading || !snapshot ? (
          <SectionCard title={t("risks.title")}>
            <LoadingBlock rows={5} />
          </SectionCard>
        ) : (
          <RisksCard risks={snapshot.risks} />
        )}
      </div>
      {loading || !snapshot ? null : <FunnelCard stages={snapshot.funnel} />}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        {loading || !snapshot ? null : <TeamLoadCard members={snapshot.teamLoad} />}
        {loading || !snapshot ? null : <EngineeringHealthCard data={snapshot.engineering} />}
      </div>
      {loading || !snapshot ? null : <RecommendedActionsCard actions={snapshot.actions} />}
    </>
  );
}
