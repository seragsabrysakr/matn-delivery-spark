import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  ErrorBlock,
  Iso,
  LoadingBlock,
  Notice,
  SectionCard,
  StatusPill,
} from "@/components/matn/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, type TKey } from "@/lib/i18n";
import { useWorkspace } from "@/data/workspace";
import {
  advanceDeliveryRefresh,
  getDeliverySchedule,
  saveDeliveryMapping,
  setDeliverableCommittedDate,
  startDeliveryRefresh,
  updateDeliverable,
} from "@/lib/workspace/workspace.functions";
import type { DeliverableView, DeliverySchedulePayload } from "@/lib/delivery/deliverables.server";
import type { DeliveryStatus } from "@/lib/delivery/deliverable-rules";
import type { HealthStatus } from "@/data/types";

type Mode = "work_item_type" | "tag" | "area_path" | "saved_query";
const MODES: Mode[] = ["work_item_type", "tag", "area_path", "saved_query"];
const MAX_REFRESH_ADVANCES = 40;

const STATUS_TONE: Record<DeliveryStatus, HealthStatus> = {
  delivered: "healthy",
  on_track: "healthy",
  at_risk: "atRisk",
  late: "critical",
  no_committed_date: "neutral",
};

export function DeliverablesSection() {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const queryClient = useQueryClient();
  const teamIterationId = filters.iterationId;
  const queryKey = ["delivery", "schedule", teamIterationId];
  const query = useQuery({
    queryKey,
    queryFn: () => getDeliverySchedule({ data: { teamIterationId } }),
    enabled: Boolean(teamIterationId),
    retry: false,
  });
  const schedule = query.data?.ok ? query.data.schedule : null;
  const [refreshing, setRefreshing] = useState(false);
  const [editingMapping, setEditingMapping] = useState(false);
  const [dialogFor, setDialogFor] = useState<DeliverableView | null>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey });

  async function refresh() {
    setRefreshing(true);
    try {
      const started = await startDeliveryRefresh({ data: { teamIterationId } });
      if (!started.ok) throw new Error(started.failure.message);
      let status = started.status;
      for (let i = 0; i < MAX_REFRESH_ADVANCES && status.cursor.phase !== "done"; i += 1) {
        const advanced = await advanceDeliveryRefresh({
          data: { teamIterationId, runId: status.runId },
        });
        if (!advanced.ok) throw new Error(advanced.failure.message);
        status = advanced.status;
        if (status.status === "failed") throw new Error(status.failure?.message ?? "");
      }
      await reload();
    } catch {
      toast.error(t("dl.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={t("dl.title")}
        subtitle={t("dl.subtitle")}
        bodyClassName="p-0"
        action={
          schedule?.canEdit && schedule.mapping ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
              {refreshing ? t("dl.refreshing") : t("dl.refresh")}
            </Button>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <div className="p-4">
            <LoadingBlock rows={4} />
          </div>
        ) : query.isError || query.data?.ok === false || !schedule ? (
          <div className="p-4">
            <ErrorBlock onRetry={() => void query.refetch()} />
          </div>
        ) : (
          <div className="flex flex-col">
            <MappingBar
              schedule={schedule}
              editing={editingMapping || (!schedule.mapping && schedule.canEdit)}
              onEdit={() => setEditingMapping(true)}
              onDone={async (saved) => {
                setEditingMapping(false);
                if (saved) {
                  await reload();
                  void refresh();
                }
              }}
            />
            {schedule.mapping ? (
              schedule.deliverables.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("dl.empty")}</p>
              ) : (
                <DeliverablesTable
                  schedule={schedule}
                  onChangeDate={setDialogFor}
                  onToggleClient={async (row, value) => {
                    const result = await updateDeliverable({
                      data: { teamIterationId, deliverableId: row.id, clientVisible: value },
                    });
                    if (!result.ok) toast.error(t("dl.dialog.failed"));
                    await reload();
                  }}
                />
              )
            ) : null}
          </div>
        )}
      </SectionCard>

      {schedule && schedule.mapping ? <DateChangeLog schedule={schedule} /> : null}
      {schedule?.mapping ? (
        <p className="text-[11px] text-muted-foreground">{t("dl.method")}</p>
      ) : null}

      <CommittedDateDialog
        row={dialogFor}
        onClose={() => setDialogFor(null)}
        onSaved={async () => {
          setDialogFor(null);
          await reload();
        }}
      />
    </div>
  );
}

function MappingBar({
  schedule,
  editing,
  onEdit,
  onDone,
}: {
  schedule: DeliverySchedulePayload;
  editing: boolean;
  onEdit: () => void;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const [mode, setMode] = useState<Mode>(schedule.mapping?.mode ?? "work_item_type");
  const [value, setValue] = useState(schedule.mapping?.value ?? "");
  const [saving, setSaving] = useState(false);

  if (!schedule.mapping && !schedule.canEdit) {
    return (
      <div className="p-4">
        <Notice
          tone="neutral"
          title={t("dl.mapping.missing.title")}
          body={`${t("dl.mapping.missing.body")} ${t("dl.mapping.missing.viewer")}`}
        />
      </div>
    );
  }

  if (!editing && schedule.mapping) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {t("dl.mapping.current", {
            a: t(`dl.mode.${schedule.mapping.mode}` as TKey),
            b: schedule.mapping.value,
          })}
          {" · "}
          {schedule.lastRefresh?.finishedAt
            ? t("dl.lastRefresh", {
                a: new Date(schedule.lastRefresh.finishedAt).toLocaleString(),
              })
            : t("dl.neverRefreshed")}
        </span>
        {schedule.canEdit ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {t("dl.mapping.edit")}
          </Button>
        ) : null}
      </div>
    );
  }

  async function save() {
    setSaving(true);
    const result = await saveDeliveryMapping({
      data: { teamIterationId: filters.iterationId, mode, value },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(t("dl.dialog.failed"));
      return;
    }
    await onDone(true);
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border p-4">
      {!schedule.mapping ? (
        <Notice
          tone="warning"
          title={t("dl.mapping.missing.title")}
          body={t("dl.mapping.missing.body")}
        />
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[180px] flex-col gap-1 text-xs text-muted-foreground">
          {t("dl.mapping.mode")}
          <Select
            value={mode}
            onValueChange={(next) => {
              setMode(next as Mode);
              setValue("");
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`dl.mode.${m}` as TKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t("dl.mapping.value")}
          {mode === "work_item_type" && schedule.workItemTypes.length > 0 ? (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schedule.workItemTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input className="h-9" value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </label>
        <Button size="sm" onClick={() => void save()} disabled={saving || !value.trim()}>
          {t("dl.mapping.save")}
        </Button>
        {schedule.mapping ? (
          <Button size="sm" variant="ghost" onClick={() => void onDone(false)}>
            {t("dl.mapping.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ForecastCell({ row }: { row: DeliverableView }) {
  const { t } = useI18n();
  if (row.actualDate) {
    return (
      <Iso className="text-muted-foreground">{t("dl.delivered.on", { a: row.actualDate })}</Iso>
    );
  }
  if (!row.forecastDate) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {row.forecastReason ? t(`dl.reason.${row.forecastReason}` as TKey) : "—"}
      </span>
    );
  }
  return (
    <span className="flex flex-col">
      <Iso className="font-medium text-foreground">{row.forecastDate}</Iso>
      {row.forecastLow ? (
        <Iso className="text-[11px] text-muted-foreground">
          {row.forecastHigh
            ? t("dl.forecast.range", { a: row.forecastLow, b: row.forecastHigh })
            : t("dl.forecast.openEnded", { a: row.forecastLow })}
        </Iso>
      ) : null}
    </span>
  );
}

function DeliverablesTable({
  schedule,
  onChangeDate,
  onToggleClient,
}: {
  schedule: DeliverySchedulePayload;
  onChangeDate: (row: DeliverableView) => void;
  onToggleClient: (row: DeliverableView, value: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const counts = schedule.deliverables.reduce<Partial<Record<DeliveryStatus, number>>>(
    (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
    {},
  );
  const columns: TKey[] = [
    "dl.col.deliverable",
    "dl.col.progress",
    "dl.col.sprints",
    "dl.col.forecast",
    "dl.col.committed",
    "dl.col.status",
    "dl.col.client",
  ];
  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {(["late", "at_risk", "no_committed_date", "on_track", "delivered"] as DeliveryStatus[])
          .filter((s) => counts[s])
          .map((s) => (
            <StatusPill key={s} status={STATUS_TONE[s]}>
              {`${t(`dl.status.${s}` as TKey)} · ${counts[s]}`}
            </StatusPill>
          ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-start text-xs sm:text-sm">
          <thead className="border-y border-border text-muted-foreground">
            <tr>
              {columns.map((key) => (
                <th key={key} className="px-4 py-2.5 text-start font-medium">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.deliverables.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="max-w-[320px] px-4 py-3 align-top">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{row.title}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Iso>{`#${row.azureWorkItemId}`}</Iso>
                      {row.workItemType ? <span>· {row.workItemType}</span> : null}
                      {row.owner ? <span>· {row.owner}</span> : null}
                      {row.azureUrl ? (
                        <a
                          href={row.azureUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex text-primary"
                          aria-label="Azure DevOps"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      ) : null}
                    </span>
                  </div>
                </td>
                <td className="min-w-[150px] px-4 py-3 align-top">
                  {row.progressPercent === null ? (
                    <span className="text-[11px] text-muted-foreground">
                      {t("dl.progress.none")}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Iso className="font-semibold text-foreground">{`${row.progressPercent}%`}</Iso>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${row.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {t("dl.progress.items", { a: row.completedItems, b: row.scopeItems })}
                        {row.progressBasis
                          ? ` · ${t(`sh.basis.${row.progressBasis}` as TKey)}`
                          : ""}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex max-w-[200px] flex-wrap gap-1">
                    {row.contributingSprints.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      row.contributingSprints.map((path) => (
                        <span
                          key={path}
                          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {path.split("\\").pop()}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <ForecastCell row={row} />
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <Iso className="font-medium text-foreground">{row.committedDate ?? "—"}</Iso>
                    {row.baselineDate && row.baselineDate !== row.committedDate ? (
                      <Iso className="text-[11px] text-muted-foreground">
                        {t("dl.baseline", { a: row.baselineDate })}
                      </Iso>
                    ) : null}
                    {schedule.canEdit && !row.actualDate ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-fit px-2 text-[11px]"
                        onClick={() => onChangeDate(row)}
                      >
                        {row.committedDate ? t("dl.change") : t("dl.confirm")}
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col gap-1">
                    <StatusPill status={STATUS_TONE[row.status]} className="w-fit">
                      {t(`dl.status.${row.status}` as TKey)}
                    </StatusPill>
                    {row.daysLate ? (
                      <span className="text-[11px] text-critical">
                        {t("dl.daysLate", { a: row.daysLate })}
                      </span>
                    ) : null}
                    {row.statusReason ? (
                      <span className="text-[11px] text-muted-foreground">
                        {t(`dl.statusReason.${row.statusReason}` as TKey)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <Switch
                    checked={row.clientVisible}
                    disabled={!schedule.canEdit}
                    onCheckedChange={(value) => void onToggleClient(row, value)}
                    aria-label={t("dl.col.client")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DateChangeLog({ schedule }: { schedule: DeliverySchedulePayload }) {
  const { t } = useI18n();
  return (
    <SectionCard title={t("dl.log.title")} bodyClassName="p-0">
      {schedule.changes.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t("dl.log.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {schedule.changes.map((change) => (
            <li key={change.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-xs">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{change.deliverableTitle}</span>
                <Iso className="text-foreground">
                  {change.oldDate
                    ? t("dl.log.entry", { a: change.oldDate, b: change.newDate })
                    : `${t("dl.log.first")}: ${change.newDate}`}
                </Iso>
              </span>
              <span className="text-muted-foreground">{change.reason}</span>
              <span className="text-[11px] text-muted-foreground">
                {`${change.changedBy ?? "—"} · ${new Date(change.changedAt).toLocaleString()}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function CommittedDateDialog({
  row,
  onClose,
  onSaved,
}: {
  row: DeliverableView | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { filters } = useWorkspace();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (row && openFor !== row.id) {
    setOpenFor(row.id);
    setDate(row.committedDate ?? row.forecastDate ?? "");
    setReason("");
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    const result = await setDeliverableCommittedDate({
      data: {
        teamIterationId: filters.iterationId,
        deliverableId: row.id,
        date,
        reason,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(t("dl.dialog.failed"));
      return;
    }
    setOpenFor(null);
    await onSaved();
  }

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open) {
          setOpenFor(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dl.dialog.title", { a: row?.title ?? "" })}</DialogTitle>
          <DialogDescription>{t("dl.dialog.hint")}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("dl.dialog.date")}
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("dl.dialog.reason")}
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </label>
        <DialogFooter>
          <Button
            onClick={() => void save()}
            disabled={saving || !/^\d{4}-\d{2}-\d{2}$/.test(date) || reason.trim().length < 3}
          >
            {t("dl.dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
