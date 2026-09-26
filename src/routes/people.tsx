import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/matn/AppShell";
import { PlaceholderPage } from "@/components/matn/PlaceholderPage";
import { ErrorBlock, Iso, LoadingBlock, Notice } from "@/components/matn/primitives";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import { getPeople } from "@/lib/workspace/workspace.functions";
import type { PersonRow } from "@/lib/people/people-rules";
import type { PeoplePayload } from "@/lib/people/people.server";

export const Route = createFileRoute("/people")({
  head: () => ({
    meta: [
      { title: "People — MATN Delivery Intelligence" },
      {
        name: "description",
        content: "Each person's sprint work, yesterday's activity from Azure, and update alerts.",
      },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  const { mode } = useWorkspace();
  return (
    <AppShell>
      {mode === "real" ? (
        <PeopleView />
      ) : (
        <PlaceholderPage
          titleKey="pp.title"
          subtitleKey="pp.subtitle"
          bulletKeys={["pp.done", "pp.inProgress", "pp.stuck"]}
        />
      )}
    </AppShell>
  );
}

function PeopleView() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const query = useQuery({
    queryKey: ["people", filters.iterationId],
    queryFn: () => getPeople({ data: { teamIterationId: filters.iterationId } }),
    enabled: Boolean(filters.iterationId),
    retry: false,
  });
  const payload = query.data?.ok ? query.data.people : null;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {t("pp.title")}
          {payload ? (
            <span className="ms-2 text-sm font-normal text-muted-foreground">
              · <Iso>{payload.sprintName}</Iso>
            </span>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">{t("pp.subtitle")}</p>
      </header>
      {query.isLoading ? (
        <LoadingBlock rows={6} />
      ) : query.isError || query.data?.ok === false || !payload ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : (
        <People payload={payload} />
      )}
    </div>
  );
}

function People({ payload }: { payload: PeoplePayload }) {
  const { t } = useI18n();
  if (payload.accessLevel === "aggregate") {
    return <Notice tone="neutral" title={t("pp.title")} body={t("pp.aggregate")} />;
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {payload.unassignedOpen > 0 ? (
          <span className="text-warning">{t("pp.unassigned", { a: payload.unassignedOpen })}</span>
        ) : null}
        {payload.historySyncedTo ? (
          <Iso>{t("pp.historyTo", { a: formatInstant(payload.historySyncedTo) })}</Iso>
        ) : null}
      </div>
      {payload.people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pp.empty")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {payload.people.map((person) => (
            <PersonCard
              key={person.memberId}
              person={person}
              day={payload.previousWorkingDay}
              lookbackDays={payload.lookbackDays}
            />
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t("pp.method", { a: payload.noUpdateWorkingDays })}
      </p>
    </>
  );
}

const formatInstant = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

function PersonCard({
  person,
  day,
  lookbackDays,
}: {
  person: PersonRow;
  day: string | null;
  lookbackDays: number;
}) {
  const { t } = useI18n();
  const counts = [
    { key: "pp.done", value: person.done, tone: "text-emerald-700 dark:text-emerald-300" },
    { key: "pp.inProgress", value: person.inProgress, tone: "text-primary" },
    { key: "pp.notStarted", value: person.notStarted, tone: "text-muted-foreground" },
    {
      key: "pp.stuck",
      value: person.stuck.length,
      tone: person.stuck.length > 0 ? "text-critical" : "text-muted-foreground",
    },
  ] as const;
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card",
        person.noUpdate ? "border-warning/50" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          <Iso>{person.displayName}</Iso>
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {person.idleWorkingDays === null ? null : person.idleWorkingDays === 0 ? (
            t("pp.lastActivityToday")
          ) : (
            <Iso>{t("pp.lastActivity", { a: person.idleWorkingDays })}</Iso>
          )}
        </span>
      </header>
      {person.noUpdate ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {person.idleWorkingDays === null
            ? t("pp.noUpdateNever", { a: lookbackDays })
            : t("pp.noUpdate", { a: person.idleWorkingDays })}
        </p>
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        {counts.map((c) => (
          <div key={c.key} className="rounded-md border border-border p-2 text-center">
            <Iso className={cn("text-lg font-semibold", c.tone)}>{String(c.value)}</Iso>
            <p className="text-[11px] text-muted-foreground">{t(c.key)}</p>
          </div>
        ))}
      </div>
      {person.unknownState > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t("pp.unknown", { a: person.unknownState })}
        </p>
      ) : null}
      {person.stuck.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {person.stuck.map((item) => (
            <li key={item.azureId} className="text-critical">
              <ItemLink {...item} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="border-t border-border pt-3">
        <h3 className="mb-1.5 text-xs font-medium text-foreground">
          <Iso>{t("pp.yesterday", { a: day ?? "—" })}</Iso>
        </h3>
        {person.yesterday.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("pp.noActivity")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs">
            {person.yesterday.map((a) => (
              <li key={a.azureId} className="flex flex-col gap-0.5">
                <span className="text-foreground">
                  <ItemLink azureId={a.azureId} title={a.title} azureUrl={a.azureUrl} />
                </span>
                <span className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                  {a.moves.map((m, i) => (
                    <Iso key={i} className="text-primary">
                      {`${m.from ?? "—"} → ${m.to}`}
                    </Iso>
                  ))}
                  <Iso>{t("pp.changes", { a: a.changes })}</Iso>
                </span>
              </li>
            ))}
            {person.yesterdayTruncated ? (
              <li className="text-[11px] text-muted-foreground">{t("pp.truncated")}</li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}

function ItemLink({
  azureId,
  title,
  azureUrl,
}: {
  azureId: number;
  title: string;
  azureUrl: string | null;
}) {
  return (
    <>
      <Iso>{title}</Iso> <Iso className="text-[11px] text-muted-foreground">#{azureId}</Iso>
      {azureUrl ? (
        <a
          href={azureUrl}
          target="_blank"
          rel="noreferrer"
          className="ms-1 inline-flex text-primary"
          aria-label="Azure DevOps"
        >
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </>
  );
}
