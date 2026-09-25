import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/matn/AppShell";
import { useI18n, type TKey } from "@/lib/i18n";
import { Iso } from "@/components/matn/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  discoverAzureProjects,
  getAzureSyncStatus,
  startAzureFoundationSync,
  advanceAzureFoundationSync,
  cancelAzureFoundationSync,
  validateAzureConnection,
} from "@/lib/azure/azure.functions";
import { deriveAzureUiState } from "@/lib/azure/ui-state";
import { SYNC_DOMAINS, type SyncDomain, type SyncRunReport } from "@/lib/azure/contracts";

export const Route = createFileRoute("/_authenticated/settings/azure")({
  head: () => ({
    meta: [
      { title: "Azure DevOps Connection — MATN Delivery Intelligence" },
      {
        name: "description",
        content:
          "Validate the read-only Azure DevOps connection and run the foundation synchronization.",
      },
      { property: "og:title", content: "Azure DevOps Connection — MATN Delivery Intelligence" },
      {
        property: "og:description",
        content:
          "Validate the read-only Azure DevOps connection and run the foundation synchronization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AzureSettingsPage,
});

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const tone =
    status === "connected"
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : status === "error"
        ? "bg-destructive/12 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {t(`azure.status.${status}` as TKey)}
    </span>
  );
}

function ReportTable({ report }: { report: SyncRunReport }) {
  const { t, locale } = useI18n();
  const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB") : "—";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">{t("azure.lastRun")}</caption>
        <thead>
          <tr className="text-start text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 text-start">
              {t("azure.domain")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.discovered")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.inserted")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.updated")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.unchanged")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.missing")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.failed")}
            </th>
            <th scope="col" className="py-2 text-start">
              {t("azure.freshness")}
            </th>
          </tr>
        </thead>
        <tbody>
          {SYNC_DOMAINS.map((domain: SyncDomain) => {
            const counts = report.domains[domain];
            return (
              <tr key={domain} className="border-t border-border/60">
                <th scope="row" className="py-2 text-start font-medium">
                  {t(`azure.domain.${domain}` as TKey)}{" "}
                  <Badge
                    variant={
                      counts.complete ? "secondary" : counts.blocked ? "outline" : "destructive"
                    }
                    className="ms-1 align-middle"
                  >
                    {counts.complete
                      ? t("azure.complete")
                      : counts.blocked
                        ? t("azure.blocked")
                        : t("azure.partial")}
                  </Badge>
                  {counts.blocked && counts.blockedBy ? (
                    <span className="ms-2 block text-xs font-normal text-muted-foreground">
                      {t("azure.skippedBecause").replace(
                        "{domain}",
                        t(`azure.domain.${counts.blockedBy}` as TKey),
                      )}
                    </span>
                  ) : null}
                </th>
                <td className="py-2">
                  <Iso>{counts.discovered}</Iso>
                </td>
                <td className="py-2">
                  <Iso>{counts.inserted}</Iso>
                </td>
                <td className="py-2">
                  <Iso>{counts.updated}</Iso>
                </td>
                <td className="py-2">
                  <Iso>{counts.unchanged}</Iso>
                </td>
                <td className="py-2">
                  <Iso>{counts.missing}</Iso>
                </td>
                <td className="py-2">
                  <Iso>{counts.failed}</Iso>
                </td>
                <td className="py-2 text-muted-foreground">
                  <Iso>{fmt(counts.freshnessAt)}</Iso>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AzureSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getAzureSyncStatus);
  const validate = useServerFn(validateAzureConnection);
  const discover = useServerFn(discoverAzureProjects);
  const startSync = useServerFn(startAzureFoundationSync);
  const advanceSync = useServerFn(advanceAzureFoundationSync);
  const cancelSync = useServerFn(cancelAzureFoundationSync);
  const [runId, setRunId] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["azure", "status"],
    queryFn: () => fetchStatus({ data: { tenantId: null } }),
  });

  const validateMutation = useMutation({
    mutationFn: () => validate({ data: { tenantId: null } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["azure", "status"] }),
  });
  const discoverMutation = useMutation({
    mutationFn: () => discover({ data: { tenantId: null } }),
  });
  const syncMutation = useMutation({
    mutationFn: () => startSync({ data: { tenantId: null } }),
    onSuccess: (state) => {
      setRunId(state.runId);
      void queryClient.invalidateQueries({ queryKey: ["azure", "status"] });
    },
  });

  // The interactive request only starts the job; progress is made by short,
  // checkpointed advance calls driven from here.
  const jobQuery = useQuery({
    queryKey: ["azure", "job", runId],
    enabled: Boolean(runId),
    queryFn: () => advanceSync({ data: { tenantId: null, runId: runId! } }),
    refetchInterval: (query) => {
      const state = query.state.data;
      return state && (state.status === "queued" || state.status === "running") ? 1500 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSync({ data: { tenantId: null, runId: runId! } }),
    onSuccess: () => {
      setRunId(null);
      void queryClient.invalidateQueries({ queryKey: ["azure", "status"] });
    },
  });

  const status = statusQuery.data;
  const job = jobQuery.data ?? syncMutation.data ?? null;
  const busy = validateMutation.isPending || discoverMutation.isPending || syncMutation.isPending;
  const jobActive = Boolean(job && (job.status === "queued" || job.status === "running"));
  const report = job ?? status?.lastRun ?? null;

  const ui = deriveAzureUiState({
    statusConnection: status?.connectionStatus ?? "unconfigured",
    validation: validateMutation.data ?? null,
    discovery: discoverMutation.data ?? null,
    discoveryFailed: discoverMutation.isError,
    sync: report,
    syncFailed: syncMutation.isError,
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("azure.title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("azure.subtitle")}</p>
        </header>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">{t("azure.status")}</CardTitle>
              <CardDescription>
                {t("azure.organization")}: <Iso>{status?.organization ?? "—"}</Iso>
              </CardDescription>
            </div>
            <StatusBadge status={ui.connectionStatus} />
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("azure.lastVerified")}:{" "}
              <Iso>
                {status?.lastVerifiedAt
                  ? new Date(status.lastVerifiedAt).toLocaleString()
                  : t("azure.never")}
              </Iso>
            </p>

            {status && !status.configured ? (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {t("azure.notConfigured")}
              </p>
            ) : null}
            {status && status.configured && !status.canSync ? (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {t("azure.noPermission")}
              </p>
            ) : null}
            {status?.activeRun ? (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {t("azure.activeRun")}
              </p>
            ) : null}
            {ui.connectionError ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {t(`azure.error.${ui.connectionError}` as TKey)}
              </p>
            ) : null}
            {ui.discoveryError ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {t("azure.discoveryFailed")}: {t(`azure.error.${ui.discoveryError}` as TKey)}
              </p>
            ) : null}
            {ui.syncError ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {t(`azure.error.${ui.syncError}` as TKey)}
              </p>
            ) : null}
            {job ? (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {t(`azure.run.${job.status}` as TKey)}
              </p>
            ) : null}
            {report ? (
              <p className="text-sm text-muted-foreground">
                {t(`azure.next.${report.nextSafeAction}` as TKey)}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => validateMutation.mutate()}
                disabled={busy || !status?.canValidate}
              >
                {validateMutation.isPending ? t("azure.running") : t("azure.validate")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => discoverMutation.mutate()}
                disabled={busy || !status?.canSync}
              >
                {discoverMutation.isPending ? t("azure.running") : t("azure.discover")}
              </Button>
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={busy || jobActive || !status?.canSync}
              >
                {syncMutation.isPending || jobActive ? t("azure.running") : t("azure.sync")}
              </Button>
              {jobActive ? (
                <Button
                  variant="ghost"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {t("azure.cancel")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {discoverMutation.data && !ui.discoveryError ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("azure.projects")}</CardTitle>
            </CardHeader>
            <CardContent>
              {ui.showEmptyProjects ? (
                <p className="text-sm text-muted-foreground">{t("azure.projectsEmpty")}</p>
              ) : (
                <>
                  {ui.showPartialDiscovery ? (
                    <p role="status" className="mb-3 rounded-md bg-muted p-3 text-sm">
                      {t("azure.discoveryPartial")}
                    </p>
                  ) : null}
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {discoverMutation.data.projects.map((project) => (
                      <li
                        key={project.azureProjectId}
                        className="rounded-md border border-border/60 p-3 text-sm"
                      >
                        <span className="font-medium">
                          <Iso>{project.name}</Iso>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          <Iso>{project.state}</Iso>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {report ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("azure.lastRun")}</CardTitle>
              <CardDescription>
                <Iso>{report.runId}</Iso>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReportTable report={report} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
