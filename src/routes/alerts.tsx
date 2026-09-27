import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Clock, ExternalLink, OctagonAlert, PackageX } from "lucide-react";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";
import { ErrorBlock, Iso, LoadingBlock, Notice, SectionCard } from "@/components/matn/primitives";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getAlerts } from "@/lib/workspace/workspace.functions";
import type { AlertKind } from "@/lib/alerts/alert-rules";
import type { AlertView } from "@/lib/alerts/alerts-read.server";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "Stuck work and late or at-risk deliverables, detected from Azure DevOps.",
      },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { mode } = useWorkspace();
  return (
    <AppShell>
      {mode === "real" ? (
        <AlertsView />
      ) : (
        <PlaceholderPage
          titleKey="al.title"
          subtitleKey="al.subtitle"
          bulletKeys={["al.kind.stuck", "al.kind.deliverable_late", "al.kind.deliverable_at_risk"]}
        />
      )}
    </AppShell>
  );
}

const KIND_ICON: Record<AlertKind, typeof OctagonAlert> = {
  stuck: OctagonAlert,
  deliverable_late: PackageX,
  deliverable_at_risk: Clock,
};
const KIND_TONE: Record<AlertKind, string> = {
  stuck: "text-critical bg-critical/10",
  deliverable_late: "text-critical bg-critical/10",
  deliverable_at_risk: "text-warning bg-warning/15",
};
const KINDS: AlertKind[] = ["stuck", "deliverable_late", "deliverable_at_risk"];

const formatInstant = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

function AlertsView() {
  const { t, locale } = useI18n();
  const query = useQuery({
    queryKey: ["alerts"],
    queryFn: () => getAlerts({ data: {} }),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.alerts : null;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          <BellRing className="size-5 text-primary" aria-hidden />
          {t("al.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("al.subtitle")}</p>
      </header>
      {query.isLoading ? (
        <LoadingBlock rows={5} />
      ) : query.isError || query.data?.ok === false || !payload ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : !payload.allowed ? (
        <Notice tone="neutral" title={t("al.title")} body={t("al.notAllowed")} />
      ) : !payload.active ? (
        <Notice tone="neutral" title={t("al.title")} body={t("al.notActive")} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {KINDS.map((kind) => {
              const Icon = KIND_ICON[kind];
              const n = payload.open.filter((a) => a.kind === kind).length;
              return (
                <div
                  key={kind}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
                >
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-lg",
                      n > 0 ? KIND_TONE[kind] : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <Iso className="block text-2xl font-semibold text-foreground">{String(n)}</Iso>
                    <span className="text-xs text-muted-foreground">
                      {t(`al.kind.${kind}` as TKey)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t("al.lastCheck")}:{" "}
              <Iso className="text-foreground">
                {payload.lastCheckAt ? formatInstant(payload.lastCheckAt, locale) : t("al.never")}
              </Iso>
            </span>
            <span>
              {t("al.lastDigest")}:{" "}
              <Iso className="text-foreground">
                {payload.lastDigest
                  ? `${payload.lastDigest.date} · Teams: ${t(`al.teams.${payload.lastDigest.teamsStatus}` as TKey)}`
                  : t("al.never")}
              </Iso>
            </span>
            {!payload.teamsConfigured ? (
              <span className="text-warning">{t("al.teamsMissing")}</span>
            ) : null}
          </div>

          <SectionCard title={t("al.open")} subtitle={t("al.openSubtitle")} bodyClassName="p-0">
            {payload.open.length === 0 ? (
              <p className="flex items-center gap-2 p-5 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                {t("al.noneOpen")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {payload.open.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            )}
          </SectionCard>

          {payload.resolved.length > 0 ? (
            <details className="rounded-lg border border-border bg-card shadow-card">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-foreground">
                {t("al.resolved", { a: payload.resolved.length })}
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {payload.resolved.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            </details>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{t("al.method")}</p>
        </>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertView }) {
  const { t, locale } = useI18n();
  const Icon = KIND_ICON[alert.kind];
  const resolved = alert.resolvedAt !== null;
  return (
    <li className={cn("flex items-start gap-3 px-5 py-3 text-sm", resolved && "opacity-70")}>
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          resolved ? "bg-muted text-muted-foreground" : KIND_TONE[alert.kind],
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground">
          <Iso>{alert.title}</Iso>
          {alert.azureWorkItemId ? (
            <Iso className="ms-1 text-[11px] text-muted-foreground">#{alert.azureWorkItemId}</Iso>
          ) : null}
          {alert.azureUrl ? (
            <a
              href={alert.azureUrl}
              target="_blank"
              rel="noreferrer"
              className="ms-1 inline-flex text-primary"
              aria-label="Azure DevOps"
            >
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          <span>{t(`al.kind.${alert.kind}` as TKey)}</span>
          <Iso>{[alert.projectName, alert.sprintName].filter(Boolean).join(" · ")}</Iso>
          {alert.assignee ? <Iso className="text-foreground">{alert.assignee}</Iso> : null}
          {alert.kind === "stuck" && alert.workingDaysInColumn !== null ? (
            <Iso className="text-critical">
              {t(alert.ageBasis === "state_change" ? "bd.daysApprox" : "bd.days", {
                a: alert.workingDaysInColumn,
              })}
            </Iso>
          ) : null}
          {alert.kind === "deliverable_late" && alert.daysLate !== null ? (
            <Iso className="text-critical">{t("al.daysLate", { a: alert.daysLate })}</Iso>
          ) : null}
          {alert.kind !== "stuck" && alert.committedDate ? (
            <Iso>{t("al.dates", { a: alert.committedDate, b: alert.forecastDate ?? "—" })}</Iso>
          ) : null}
        </p>
      </div>
      <Iso className="shrink-0 text-[11px] text-muted-foreground">
        {resolved
          ? t("al.resolvedAt", { a: formatInstant(alert.resolvedAt!, locale) })
          : t("al.since", { a: formatInstant(alert.detectedAt, locale) })}
      </Iso>
    </li>
  );
}
