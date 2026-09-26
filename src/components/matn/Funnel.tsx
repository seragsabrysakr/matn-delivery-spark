import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import type { FunnelStage } from "@/data/types";
import { EmptyBlock, Iso, SectionCard, statusDot } from "./primitives";

export function FunnelCard({ stages }: { stages: FunnelStage[] }) {
  const { t, days } = useI18n();
  const max = Math.max(...stages.map((s) => s.count), 1);

  if (stages.length === 0) {
    return (
      <SectionCard title={t("funnel.title")} subtitle={t("funnel.subtitle")}>
        <EmptyBlock />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("funnel.title")} subtitle={t("funnel.subtitle")}>
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {stages.map((stage, i) => (
          <li key={stage.id} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 rounded-md border border-border bg-surface p-3">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", statusDot[stage.status])}
                  aria-hidden
                />
                <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                  {stage.label ?? t(`funnel.${stage.id}` as TKey)}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <Iso className="text-2xl font-semibold tabular-nums text-foreground">
                  {stage.count}
                </Iso>
                <span className="text-[11px] text-muted-foreground">{t("funnel.items")}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className={cn(
                    "h-full rounded-full",
                    stage.status === "critical"
                      ? "bg-critical"
                      : stage.status === "atRisk"
                        ? "bg-warning"
                        : stage.status === "healthy"
                          ? "bg-success"
                          : "bg-navy",
                  )}
                  style={{ width: `${Math.max(6, (stage.count / max) * 100)}%` }}
                />
              </div>
              {stage.itemLimit ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("funnel.wipLimit")}:{" "}
                  <Iso>
                    {stage.count}/{stage.itemLimit}
                  </Iso>
                </p>
              ) : null}
              {stage.stuckCount ? (
                <p className="mt-2 text-[11px] font-medium text-critical">
                  {t("funnel.stuck")}: <Iso>{stage.stuckCount}</Iso>
                </p>
              ) : null}
              {stage.avgDays > 0 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {t("funnel.aging")}: <Iso>{days(stage.avgDays)}</Iso>
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">&nbsp;</p>
              )}
            </div>
            {i < stages.length - 1 ? (
              <ChevronLeft
                className="hidden size-4 shrink-0 text-muted-foreground ltr:rotate-180 lg:block"
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
