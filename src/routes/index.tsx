import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/matn/AppShell";
import { KpiGrid } from "@/components/matn/KpiGrid";
import { TrajectoryCard } from "@/components/matn/Trajectory";
import { RisksCard } from "@/components/matn/Risks";
import { FunnelCard } from "@/components/matn/Funnel";
import { TeamLoadCard } from "@/components/matn/TeamLoad";
import { EngineeringHealthCard } from "@/components/matn/EngineeringHealth";
import { RecommendedActionsCard } from "@/components/matn/RecommendedActions";
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
          "Executive delivery command center: sprint confidence, trajectory forecast, risks, team load, and recommended actions in Arabic and English.",
      },
      { property: "og:title", content: "MATN Delivery Intelligence — Executive Overview" },
      {
        property: "og:description",
        content:
          "Sprint confidence, trajectory forecast, risks, team load, and recommended actions in one executive view.",
      },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const { t, locale } = useI18n();
  const {
    snapshot,
    iteration,
    loading,
    error,
    refresh,
    mode,
    unavailable,
    syncing,
    syncMessage,
    runSync,
    syncReport,
    sprintDatesUnavailable,
  } = useWorkspace();

  const engineeringUnavailable = mode === "real" && Boolean(unavailable["engineering"]);
  const noWorkItems = mode === "real" && Boolean(unavailable["workItems"]);
  const noSprintDates = sprintDatesUnavailable;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {t("overview.title")}
              </h1>
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                {mode === "real" ? t("real.mode.badge") : t("real.mode.mock")}
              </span>
              {iteration ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{iteration.name[locale]}</span>
                  <span aria-hidden>·</span>
                  {noSprintDates || (mode === "real" && !iteration.totalDays) ? (
                    <span>{t("real.sprintDates.unavailable")}</span>
                  ) : (
                    <Iso>
                      {t("overview.sprintDay", { a: iteration.currentDay, b: iteration.totalDays })}
                    </Iso>
                  )}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{t("overview.subtitle")}</p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            {mode === "real" ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full min-h-11 shrink-0 sm:min-h-9 sm:w-auto"
                disabled={syncing}
                onClick={runSync}
              >
                <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                {syncing ? t("real.sync.running") : t("real.sync.action")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled
              title={t("overview.copilot.comingSoon")}
              className="w-full min-h-11 shrink-0 sm:min-h-9 sm:w-auto"
            >
              <Sparkles className="size-3.5" aria-hidden />
              {t("overview.askCopilot")}
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {t("overview.copilot.comingSoon")}
              </span>
            </Button>
          </div>
        </header>

        {syncMessage ? (
          <Notice tone="warning" title={t("state.error.title")} body={syncMessage} />
        ) : null}
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
            })}${syncReport.truncated ? ` — ${t("real.sync.truncated")}` : ""}`}
          />
        ) : null}
        {noWorkItems ? (
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

        {error ? (
          <SectionCard title={t("state.error.title")}>
            <ErrorBlock onRetry={refresh} />
          </SectionCard>
        ) : (
          <>
            {!loading && snapshot && snapshot.freshness === "stale" ? (
              <Notice
                tone="warning"
                title={t("state.stale.title")}
                body={t("state.stale.body", {
                  a: t("common.minutes", { a: snapshot.lastSyncMinutesAgo }),
                })}
              />
            ) : null}
            {!loading && snapshot && snapshot.freshness === "partial" ? (
              <Notice
                tone="neutral"
                title={t("state.partial.title")}
                body={t("state.partial.body")}
              />
            ) : null}

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

            {loading || !snapshot ? (
              <SectionCard title={t("funnel.title")}>
                <LoadingBlock rows={2} />
              </SectionCard>
            ) : (
              <FunnelCard stages={snapshot.funnel} />
            )}

            <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
              {loading || !snapshot ? (
                <SectionCard title={t("team.title")}>
                  <LoadingBlock rows={5} />
                </SectionCard>
              ) : (
                <TeamLoadCard members={snapshot.teamLoad} />
              )}

              {loading || !snapshot ? (
                <SectionCard title={t("eng.title")}>
                  <LoadingBlock rows={4} />
                </SectionCard>
              ) : engineeringUnavailable ? (
                <SectionCard title={t("eng.title")}>
                  <p className="text-[13px] text-muted-foreground">
                    {t("real.unavailable.engineering")}
                  </p>
                </SectionCard>
              ) : (
                <EngineeringHealthCard data={snapshot.engineering} />
              )}
            </div>

            {loading || !snapshot ? (
              <SectionCard title={t("actions.title")}>
                <LoadingBlock rows={3} />
              </SectionCard>
            ) : (
              <RecommendedActionsCard actions={snapshot.actions} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
