/**
 * Stuck work across every team the user can see (ADR-025), shown as a tab of
 * the Sprint board page (ADR-029).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { ErrorBlock, Iso, LoadingBlock, SectionCard } from "@/components/matn/primitives";
import { Input } from "@/components/ui/input";
import { useI18n, type TKey } from "@/lib/i18n";
import { getStuckWork } from "@/lib/workspace/workspace.functions";
import type { StuckPayload, StuckRow } from "@/lib/board/board.server";

export function StuckAcrossTeams() {
  const query = useQuery({
    queryKey: ["stuck-work"],
    queryFn: () => getStuckWork({ data: {} }),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.stuck : null;
  if (query.isLoading) return <LoadingBlock rows={6} />;
  if (query.isError || query.data?.ok === false || !payload) {
    return <ErrorBlock onRetry={() => void query.refetch()} />;
  }
  return <StuckTable payload={payload} />;
}
function StuckTable({ payload }: { payload: StuckPayload }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return payload.rows;
    return payload.rows.filter((row) =>
      [
        row.title,
        String(row.azureId),
        row.assignee ?? "",
        row.teamName,
        row.projectName,
        row.sprintName,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [payload.rows, search]);

  const columns: TKey[] = [
    "st.col.age",
    "st.col.item",
    "st.col.where",
    "st.col.column",
    "st.col.assignee",
    "st.col.why",
  ];

  return (
    <>
      <SectionCard
        title={t("st.title")}
        subtitle={t("st.summary", { a: payload.rows.length, b: payload.sprints })}
        bodyClassName="p-0"
      >
        {payload.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("st.none")}</p>
        ) : (
          <>
            <div className="border-b border-border px-4 py-3">
              <Input
                className="h-9 max-w-xs"
                placeholder={t("st.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("hy.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-start text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      {columns.map((key) => (
                        <th key={key} className="px-3 py-2.5 text-start font-medium">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Row key={`${row.teamIterationId}-${row.azureId}`} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </SectionCard>
      <p className="text-[11px] text-muted-foreground">
        {t("bd.method", { a: payload.thresholdDays })}
      </p>
    </>
  );
}

function Row({ row }: { row: StuckRow }) {
  const { t } = useI18n();
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="px-3 py-2 align-top">
        {row.daysInColumn !== null ? (
          <Iso className="whitespace-nowrap font-semibold text-critical">
            {t(row.ageBasis === "state_change" ? "bd.daysApprox" : "bd.days", {
              a: row.daysInColumn,
            })}
          </Iso>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="max-w-[420px] px-3 py-2 align-top">
        <span className="me-1.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Iso>{row.type}</Iso>
        </span>
        <span className="font-medium text-foreground">
          <Iso>{row.title}</Iso>
        </span>{" "}
        <Iso className="text-[11px] text-muted-foreground">#{row.azureId}</Iso>
        {row.azureUrl ? (
          <a
            href={row.azureUrl}
            target="_blank"
            rel="noreferrer"
            className="ms-1 inline-flex text-primary"
            aria-label="Azure DevOps"
          >
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-muted-foreground">
        <Iso>{[row.projectName, row.teamName, row.sprintName].filter(Boolean).join(" / ")}</Iso>
      </td>
      <td className="px-3 py-2 align-top">
        <Iso className="text-foreground">{row.boardColumn ?? row.state}</Iso>
        {row.boardColumn && row.boardColumn !== row.state ? (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            <Iso>{row.state}</Iso>
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top text-foreground">
        {row.assignee ? <Iso>{row.assignee}</Iso> : "—"}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-1">
          {row.reasons.map((reason) => (
            <span
              key={reason}
              className="rounded border border-critical/30 bg-critical/10 px-1.5 py-0.5 text-[10px] text-critical"
            >
              {t(`st.reason.${reason}` as TKey)}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}
