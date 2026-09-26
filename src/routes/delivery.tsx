import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getSprintHistory } from "@/lib/workspace/workspace.functions";
import type { SprintHistoryRow, Tally } from "@/lib/delivery/sprint-history-rules";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery Flow — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "Track sprint scope, cycle time, and release commitments across delivery teams.",
      },
      { property: "og:title", content: "Delivery Flow — MATN Delivery Intelligence" },
      {
        property: "og:description",
        content: "Track sprint scope, cycle time, and release commitments across delivery teams.",
      },
    ],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  const { mode } = useWorkspace();
  return (
    <AppShell>
      {mode === "real" ? (
        <SprintHistorySection />
      ) : (
        <PlaceholderPage
          titleKey="delivery.title"
          subtitleKey="delivery.subtitle"
          bulletKeys={["delivery.p1", "delivery.p2", "delivery.p3"]}
        />
      )}
    </AppShell>
  );
}

function TallyCell({ value }: { value: Tally | null }) {
  const { t } = useI18n();
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col">
      <Iso className="font-medium text-foreground">
        {value.points === null ? "—" : `${value.points} ${t("sh.points")}`}
      </Iso>
      <Iso className="text-[11px] text-muted-foreground">{`${value.count} ${t("sh.items")}`}</Iso>
    </span>
  );
}

const statusTone = (row: SprintHistoryRow) =>
  row.status === "current" ? "watch" : row.status === "future" ? "neutral" : "healthy";

function SprintHistorySection() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const query = useQuery({
    queryKey: ["delivery", "sprint-history", filters.iterationId],
    queryFn: () => getSprintHistory({ data: { teamIterationId: filters.iterationId } }),
    enabled: Boolean(filters.iterationId),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.history : null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {t("delivery.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("sh.subtitle")}</p>
      </header>

      {payload && payload.coverage.complete < payload.coverage.items ? (
        <Notice
          tone="warning"
          title={t("sh.coverage.title")}
          body={t("sh.coverage.body", {
            a: payload.coverage.items - payload.coverage.complete,
            b: payload.coverage.items,
          })}
        />
      ) : null}

      <SectionCard
        title={t("sh.title")}
        subtitle={
          payload?.averageVelocity
            ? t("sh.avgVelocity", {
                a: payload.averageVelocity.mean,
                b: payload.averageVelocity.sprints,
              })
            : t("sh.avgVelocity.none")
        }
        bodyClassName="p-0"
      >
        {query.isLoading ? (
          <div className="p-4">
            <LoadingBlock rows={4} />
          </div>
        ) : query.isError || query.data?.ok === false ? (
          <div className="p-4">
            <ErrorBlock onRetry={() => void query.refetch()} />
          </div>
        ) : !payload || payload.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("sh.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-start text-xs sm:text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  {(
                    [
                      "sh.col.sprint",
                      "sh.col.committed",
                      "sh.col.added",
                      "sh.col.removed",
                      "sh.col.delivered",
                      "sh.col.carried",
                      "sh.col.late",
                      "sh.col.sayDo",
                      "sh.col.velocity",
                    ] as TKey[]
                  ).map((key) => (
                    <th key={key} className="px-4 py-2.5 text-start font-medium">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.rows.map((row) => (
                  <tr key={row.iterationId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <Iso className="font-medium text-foreground">{row.name}</Iso>
                        <Iso className="text-[11px] text-muted-foreground">
                          {`${row.startDate} → ${row.finishDate}`}
                        </Iso>
                        <StatusPill status={statusTone(row)} className="w-fit">
                          {t(`sh.status.${row.status}` as TKey)}
                        </StatusPill>
                        {row.historyGaps > 0 ? (
                          <span className="text-[11px] text-warning">
                            {t("sh.gaps", { a: row.historyGaps })}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TallyCell value={row.committed} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TallyCell value={row.added} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TallyCell value={row.removed} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TallyCell value={row.delivered} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TallyCell value={row.carriedOver} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <TallyCell value={row.deliveredAfterEnd} />
                      {row.medianDaysLate !== null ? (
                        <span className="text-[11px] text-warning">
                          {t("sh.lateBy", { a: row.medianDaysLate })}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.sayDo ? (
                        <span className="flex flex-col">
                          <Iso className="font-semibold text-foreground">{`${row.sayDo.percent}%`}</Iso>
                          <span className="text-[11px] text-muted-foreground">
                            {t(`sh.basis.${row.sayDo.basis}` as TKey)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Iso className="font-medium text-foreground">
                        {row.velocity === null ? "—" : `${row.velocity} ${t("sh.points")}`}
                      </Iso>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      <p className="text-[11px] text-muted-foreground">{t("sh.method")}</p>
    </div>
  );
}
