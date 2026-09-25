import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { TeamMemberLoad } from "@/data/types";
import { EmptyBlock, Iso, SectionCard, StatusPill } from "./primitives";

const signalStatus = {
  over: "critical",
  balanced: "healthy",
  under: "neutral",
  unknown: "neutral",
} as const;

const signalKey = {
  over: "team.signal.over",
  balanced: "team.signal.balanced",
  under: "team.signal.under",
  unknown: "team.signal.unknown",
} as const;

function heatClass(ratio: number | null) {
  if (ratio === null) return "bg-muted text-muted-foreground";
  if (ratio > 1.1) return "bg-critical/18 text-critical";
  if (ratio > 0.95) return "bg-warning/20 text-warning-foreground dark:text-warning";
  if (ratio >= 0.6) return "bg-success/15 text-success";
  return "bg-muted text-muted-foreground";
}

/** Utilization only exists with a valid positive capacity denominator. */
function utilizationRatio(m: TeamMemberLoad): number | null {
  if (m.capacityHours === null || m.capacityHours <= 0) return null;
  if (m.assignedHours === null) return null;
  return m.assignedHours / m.capacityHours;
}

export function TeamLoadCard({ members }: { members: TeamMemberLoad[] }) {
  const { t, locale, hours } = useI18n();

  return (
    <SectionCard title={t("team.title")} subtitle={t("team.subtitle")} bodyClassName="p-0">
      {members.length === 0 ? (
        <div className="p-4">
          <EmptyBlock />
        </div>
      ) : null}
      {/* Desktop table */}
      <div className={cn("hidden", members.length > 0 && "md:block")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 text-start font-medium">{t("team.member")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("team.capacity")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("team.assigned")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("team.active")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("team.blocked")}</th>
              <th className="px-5 py-2.5 text-start font-medium">{t("team.utilization")}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const ratio = utilizationRatio(m);
              return (
                <tr key={m.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.role[locale]}</div>
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-muted-foreground">
                    {m.capacityHours === null ? (
                      <span title={t("team.capacity.unavailable")}>{t("common.na")}</span>
                    ) : (
                      <Iso>{hours(m.capacityHours)}</Iso>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-block rounded px-2 py-0.5 text-sm font-medium tabular-nums",
                        heatClass(ratio),
                      )}
                    >
                      {m.assignedHours === null ? (
                        <span className="text-xs">
                          {t("team.assigned.items", { a: m.activeItems })}
                        </span>
                      ) : (
                        <Iso>{hours(m.assignedHours)}</Iso>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-foreground">{m.activeItems}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "tabular-nums",
                        m.blockedItems > 0 ? "font-medium text-critical" : "text-muted-foreground",
                      )}
                    >
                      {m.blockedItems}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {ratio === null ? (
                      <span className="text-xs text-muted-foreground">
                        {t("common.na")} — {t("team.capacity.unavailable")}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              ratio > 1.1
                                ? "bg-critical"
                                : ratio > 0.95
                                  ? "bg-warning"
                                  : "bg-success",
                            )}
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                          />
                        </div>
                        <StatusPill status={signalStatus[m.signal]}>
                          {t(signalKey[m.signal])}
                        </StatusPill>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className={cn("divide-y divide-border md:hidden", members.length === 0 && "hidden")}>
        {members.map((m) => {
          const ratio = utilizationRatio(m);
          return (
            <li key={m.id} className="p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.role[locale]}</div>
                </div>
                <StatusPill status={signalStatus[m.signal]}>{t(signalKey[m.signal])}</StatusPill>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                  <div className="text-muted-foreground">{t("team.capacity")}</div>
                  <div className="tabular-nums text-foreground">
                    {m.capacityHours === null ? (
                      t("common.na")
                    ) : (
                      <Iso>{hours(m.capacityHours)}</Iso>
                    )}
                  </div>
                </div>
                <div className={cn("rounded-md px-2.5 py-1.5", heatClass(ratio))}>
                  <div className="opacity-80">{t("team.assigned")}</div>
                  <div className="tabular-nums">
                    {m.assignedHours === null ? (
                      t("team.assigned.items", { a: m.activeItems })
                    ) : (
                      <Iso>{hours(m.assignedHours)}</Iso>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                  <div className="text-muted-foreground">{t("team.active")}</div>
                  <div className="tabular-nums text-foreground">{m.activeItems}</div>
                </div>
                <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
                  <div className="text-muted-foreground">{t("team.blocked")}</div>
                  <div
                    className={cn(
                      "tabular-nums",
                      m.blockedItems > 0 ? "text-critical" : "text-foreground",
                    )}
                  >
                    {m.blockedItems}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
