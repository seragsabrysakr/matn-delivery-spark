import { GitPullRequest, Hammer, Rocket, TestTube2, Timer, TimerReset } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import type { EngineeringHealth, HealthStatus } from "@/data/types";
import { SectionCard, StatusPill, statusDot } from "./primitives";

function Metric({
  icon: Icon,
  labelKey,
  value,
  status,
}: {
  icon: LucideIcon;
  labelKey: TKey;
  value: string;
  status: HealthStatus;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate text-xs text-muted-foreground">{t(labelKey)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
        <span className={cn("size-1.5 rounded-full", statusDot[status])} aria-hidden />
      </div>
    </div>
  );
}

export function EngineeringHealthCard({ data }: { data: EngineeringHealth }) {
  const { t, hours } = useI18n();
  return (
    <SectionCard
      title={t("eng.title")}
      subtitle={t("eng.subtitle")}
      action={
        <StatusPill status={data.deployment.status}>
          {t(data.deployment.labelKey as TKey)}
        </StatusPill>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric
          icon={GitPullRequest}
          labelKey="eng.activePrs"
          value={String(data.activePullRequests)}
          status="neutral"
        />
        <Metric
          icon={TimerReset}
          labelKey="eng.stalePrs"
          value={String(data.stalePullRequests)}
          status={data.stalePullRequests > 2 ? "critical" : "healthy"}
        />
        <Metric
          icon={Timer}
          labelKey="eng.reviewTime"
          value={hours(data.medianReviewHours)}
          status={data.medianReviewHours > 12 ? "atRisk" : "healthy"}
        />
        <Metric
          icon={Hammer}
          labelKey="eng.buildRate"
          value={`${data.buildSuccessRate}%`}
          status={data.buildSuccessRate < 85 ? "atRisk" : "healthy"}
        />
        <Metric
          icon={TestTube2}
          labelKey="eng.failedTests"
          value={String(data.failedTests)}
          status={data.failedTests > 0 ? "critical" : "healthy"}
        />
        <Metric icon={Rocket} labelKey="eng.deployment" value="—" status={data.deployment.status} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t(data.deployment.noteKey as TKey)}</p>
    </SectionCard>
  );
}
