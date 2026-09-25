import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { HealthStatus, Severity } from "@/data/types";

export const statusStyles: Record<HealthStatus, string> = {
  healthy: "bg-success/12 text-success border-success/30",
  atRisk: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  critical: "bg-critical/12 text-critical border-critical/30",
  neutral: "bg-muted text-muted-foreground border-border",
  watch: "bg-azure/10 text-azure border-azure/30",
};

export const statusDot: Record<HealthStatus, string> = {
  healthy: "bg-success",
  atRisk: "bg-warning",
  critical: "bg-critical",
  neutral: "bg-muted-foreground",
  watch: "bg-azure",
};

export const severityToStatus: Record<Severity, HealthStatus> = {
  critical: "critical",
  high: "atRisk",
  medium: "neutral",
  watch: "watch",
};

export function StatusPill({
  status,
  children,
  className,
}: {
  status: HealthStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", statusDot[status])} aria-hidden />
      {children}
    </span>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("flex flex-col rounded-lg border border-border bg-card shadow-card", className)}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-[13px]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3" role="status" aria-label={t("state.loading")}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyBlock() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{t("state.empty.title")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t("state.empty.body")}</p>
    </div>
  );
}

export function ErrorBlock({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <AlertTriangle className="size-6 text-critical" aria-hidden />
      <p className="text-sm font-medium text-foreground">{t("state.error.title")}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{t("state.error.body")}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          {t("state.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function Notice({
  tone,
  title,
  body,
  action,
}: {
  tone: "warning" | "critical" | "neutral";
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const toneClass =
    tone === "warning"
      ? "border-warning/40 bg-warning/10"
      : tone === "critical"
        ? "border-critical/35 bg-critical/10"
        : "border-border bg-surface";
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border px-4 py-3",
        toneClass,
      )}
      role="status"
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "critical"
            ? "text-critical"
            : tone === "warning"
              ? "text-warning"
              : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Direction isolation for names, IDs, percentages and technical terms so they
 * never break the surrounding Arabic (RTL) sentence flow.
 */
export function Iso({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi className={cn("inline-block", className)} dir="auto">
      {children}
    </bdi>
  );
}
