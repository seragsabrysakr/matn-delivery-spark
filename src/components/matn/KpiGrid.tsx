import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Info, Minus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import type { KpiMetric } from "@/data/types";
import { EmptyBlock, Iso, SectionCard, StatusPill, statusDot } from "./primitives";

const statusKey: Record<KpiMetric["status"], TKey> = {
  healthy: "status.healthy",
  atRisk: "status.atRisk",
  critical: "status.critical",
  neutral: "status.neutral",
  watch: "status.watch",
};

function formatValue(kpi: KpiMetric) {
  if (kpi.unit === "percent") return `${kpi.value}%`;
  if (kpi.unit === "delta") return `${kpi.value > 0 ? "+" : ""}${kpi.value}%`;
  return String(kpi.value);
}

function Sparkline({ values, status }: { values: number[]; status: KpiMetric["status"] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`)
    .join(" ");
  const stroke =
    status === "critical"
      ? "var(--critical)"
      : status === "atRisk"
        ? "var(--warning)"
        : status === "healthy"
          ? "var(--success)"
          : "var(--muted-foreground)";
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function KpiCard({
  kpi,
  onOpen,
  primary,
}: {
  kpi: KpiMetric;
  onOpen: () => void;
  primary?: boolean;
}) {
  const { t } = useI18n();
  const na = !!kpi.unavailable;
  const diff = kpi.value - kpi.comparison.value;
  const DiffIcon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const statusLabel = na
    ? t("real.unavailable.title")
    : kpi.id === "expected"
      ? t("status.onTrack")
      : t(statusKey[kpi.status]);
  const statusTone = na ? "neutral" : kpi.id === "expected" ? "healthy" : kpi.status;
  const valueText = na ? t("common.na") : formatValue(kpi);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${t(kpi.labelKey as TKey)} — ${valueText} — ${statusLabel}`}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border bg-card p-3.5 text-start shadow-card transition-colors hover:border-azure/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary && !na ? "border-azure/60 ring-1 ring-azure/25" : "border-border",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">
            {t(kpi.labelKey as TKey)}
          </span>
          {primary ? (
            <span className="shrink-0 rounded-full border border-azure/40 bg-azure/10 px-1.5 py-px text-[10px] font-medium text-azure">
              {t("kpi.primary")}
            </span>
          ) : null}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-hidden
            >
              <Info className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs">{t(kpi.tooltipKey as TKey)}</TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight",
            na ? "text-muted-foreground" : "text-foreground",
            primary && !na ? "text-4xl" : "text-3xl",
          )}
          dir="ltr"
        >
          {valueText}
        </span>
        <StatusPill status={statusTone}>{statusLabel}</StatusPill>
      </div>

      {na ? null : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <DiffIcon
              className={cn(
                "size-3.5 shrink-0",
                diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-success" : "text-critical",
              )}
              aria-hidden
            />
            <Iso className="tabular-nums">
              {diff > 0 ? "+" : ""}
              {diff}
            </Iso>
            <span className="truncate">
              {kpi.comparison.kind === "previous" ? (
                t("kpi.vsPrevious")
              ) : (
                <>
                  {t("kpi.target")} <Iso className="tabular-nums">{kpi.comparison.value}%</Iso>
                </>
              )}
            </span>
          </span>
          <span className="w-16 shrink-0">
            {kpi.trend.length > 1 ? (
              <Sparkline values={kpi.trend.map((p) => p.value)} status={kpi.status} />
            ) : null}
          </span>
        </div>
      )}

      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
        {t(kpi.explanationKey as TKey, kpi.explanationVars)}
      </p>

      <span className="mt-auto inline-flex items-center gap-1 pt-0.5 text-xs font-medium text-azure">
        {t("kpi.openDetails")}
        <ChevronLeft className="size-3.5 ltr:rotate-180" aria-hidden />
      </span>
    </button>
  );
}

export function KpiGrid({ kpis, loading }: { kpis: KpiMetric[]; loading?: boolean }) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<KpiMetric | null>(null);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (kpis.length === 0) {
    return (
      <SectionCard title={t("kpi.confidence")}>
        <EmptyBlock />
      </SectionCard>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            primary={kpi.id === "confidence"}
            onOpen={() => setSelected(kpi)}
          />
        ))}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent
          side={locale === "ar" ? "left" : "right"}
          className="w-full overflow-y-auto sm:max-w-md"
        >
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span
                    className={cn("size-2 rounded-full", statusDot[selected.status])}
                    aria-hidden
                  />
                  {t(selected.labelKey as TKey)}
                </SheetTitle>
                <SheetDescription>{t(selected.tooltipKey as TKey)}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-8">
                <div className="flex items-end gap-3">
                  <span
                    className={cn(
                      "text-4xl font-semibold tabular-nums",
                      selected.unavailable ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {selected.unavailable ? t("common.na") : formatValue(selected)}
                  </span>
                  <StatusPill
                    status={
                      selected.unavailable
                        ? "neutral"
                        : selected.id === "expected"
                          ? "healthy"
                          : selected.status
                    }
                  >
                    {selected.unavailable
                      ? t("real.unavailable.title")
                      : selected.id === "expected"
                        ? t("status.onTrack")
                        : t(statusKey[selected.status])}
                  </StatusPill>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("kpi.whatChanged")}
                  </h3>
                  {selected.unavailable ? (
                    <p className="text-sm text-muted-foreground">
                      {t(selected.unavailable.reasonKey as TKey)}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.drivers.map((d, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-azure"
                            aria-hidden
                          />
                          <span>{d[locale]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selected.explanationFacts && selected.explanationFacts.coveragePercent !== null ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      {t("real.facts.coverage", { a: selected.explanationFacts.coveragePercent })}
                    </li>
                    <li>
                      {t("real.facts.included", {
                        a:
                          selected.explanationFacts.availableComponents
                            .map((c) => t(`real.component.${c}` as TKey))
                            .join(locale === "ar" ? "، " : ", ") || t("real.facts.none"),
                      })}
                    </li>
                    <li>
                      {t("real.facts.missing", {
                        a:
                          selected.explanationFacts.missingComponents
                            .map((c) => t(`real.component.${c}` as TKey))
                            .join(locale === "ar" ? "، " : ", ") || t("real.facts.none"),
                      })}
                    </li>
                  </ul>
                ) : null}

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("kpi.trend")}
                  </h3>
                  <div className="grid grid-cols-5 gap-2">
                    {selected.trend.map((p) => (
                      <div
                        key={p.label}
                        className="rounded-md border border-border bg-surface p-2 text-center"
                      >
                        <div className="text-[11px] text-muted-foreground">{p.label}</div>
                        <div className="text-sm font-semibold tabular-nums text-foreground">
                          {p.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("kpi.howCalculated")}
                  </h3>
                  <p className="text-sm text-muted-foreground">{selected.formula[locale]}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("kpi.relatedItems")}
                  </h3>
                  {selected.relatedItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("state.empty.title")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.relatedItems.map((item) => (
                        <li
                          key={item.id}
                          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
                        >
                          <Iso className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            #{item.id}
                          </Iso>
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {item.title[locale]}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {item.state[locale]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
