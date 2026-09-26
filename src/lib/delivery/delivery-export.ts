/**
 * Delivery schedule exports (ADR-022): Excel sheets and a printable report,
 * in an internal version (everything) and a client version (only
 * deliverables marked client-visible, with title, committed date, forecast
 * and status). Pure: the caller provides the translator and the data.
 */
import type { TKey } from "@/lib/i18n";
import type { Cell, Sheet } from "@/lib/export/xlsx";
import { escapeXml } from "@/lib/export/xlsx";
import type { DeliverableView, DeliverySchedulePayload } from "./deliverables.server";

export type ExportVariant = "internal" | "client";
type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

export interface ExportContext {
  readonly schedule: DeliverySchedulePayload;
  readonly variant: ExportVariant;
  readonly t: Translate;
  readonly dir: "rtl" | "ltr";
  /** ISO timestamp of the export. */
  readonly generatedAt: string;
}

/** Deliverables included in a variant: the client sees only client-visible ones. */
export function exportedDeliverables(
  schedule: DeliverySchedulePayload,
  variant: ExportVariant,
): DeliverableView[] {
  return schedule.deliverables.filter((d) => variant === "internal" || d.clientVisible);
}

const statusLabel = (row: DeliverableView, t: Translate) => t(`dl.status.${row.status}` as TKey);

const forecastNote = (row: DeliverableView, t: Translate): string | null =>
  row.forecastDate || row.actualDate || !row.forecastReason
    ? null
    : t(`dl.reason.${row.forecastReason}` as TKey);

/** Client-safe forecast: a date only, never internal reasons or ranges. */
const clientForecast = (row: DeliverableView): string | null =>
  row.actualDate ? null : row.forecastDate;

export function buildDeliverySheets(ctx: ExportContext): Sheet[] {
  const { t, schedule, variant } = ctx;
  const rtl = ctx.dir === "rtl";
  const rows = exportedDeliverables(schedule, variant);

  if (variant === "client") {
    return [
      {
        name: t("dl.title"),
        rightToLeft: rtl,
        columns: [
          { header: t("dl.col.deliverable"), width: 48 },
          { header: t("dl.col.committed"), width: 16 },
          { header: t("dl.col.forecast"), width: 16 },
          { header: t("dl.col.status"), width: 20 },
          { header: t("dl.export.delivered"), width: 16 },
        ],
        rows: rows.map((r) => [
          r.title,
          r.committedDate,
          clientForecast(r),
          statusLabel(r, t),
          r.actualDate,
        ]),
      },
    ];
  }

  const deliverables: Sheet = {
    name: t("dl.title"),
    rightToLeft: rtl,
    columns: [
      { header: "ID", width: 10 },
      { header: t("dl.col.deliverable"), width: 44 },
      { header: t("dl.export.type"), width: 14 },
      { header: t("dl.export.owner"), width: 22 },
      { header: t("dl.col.status"), width: 18 },
      { header: t("dl.export.statusReason"), width: 30 },
      { header: t("dl.export.progress"), width: 12 },
      { header: t("dl.export.basis"), width: 12 },
      { header: t("dl.export.completed"), width: 12 },
      { header: t("dl.export.scope"), width: 10 },
      { header: t("dl.col.sprints"), width: 30 },
      { header: t("dl.col.forecast"), width: 14 },
      { header: t("dl.export.forecastLow"), width: 14 },
      { header: t("dl.export.forecastHigh"), width: 14 },
      { header: t("dl.export.forecastNote"), width: 36 },
      { header: t("dl.col.committed"), width: 14 },
      { header: t("dl.export.baseline"), width: 14 },
      { header: t("dl.export.delivered"), width: 14 },
      { header: t("dl.export.daysLate"), width: 10 },
      { header: t("dl.col.client"), width: 10 },
      { header: t("dl.export.notes"), width: 40 },
      { header: "Azure DevOps", width: 50 },
    ],
    rows: rows.map((r): Cell[] => [
      r.azureWorkItemId,
      r.title,
      r.workItemType,
      r.owner,
      statusLabel(r, t),
      r.statusReason ? t(`dl.statusReason.${r.statusReason}` as TKey) : null,
      r.progressPercent,
      r.progressBasis ? t(`sh.basis.${r.progressBasis}` as TKey) : null,
      r.completedItems,
      r.scopeItems,
      r.contributingSprints.map((p) => p.split("\\").pop()).join(", ") || null,
      r.forecastDate,
      r.forecastLow,
      r.forecastHigh,
      forecastNote(r, t),
      r.committedDate,
      r.baselineDate,
      r.actualDate,
      r.daysLate,
      r.clientVisible ? t("dl.export.yes") : t("dl.export.no"),
      r.notes,
      r.azureUrl,
    ]),
  };

  const changes: Sheet = {
    name: t("dl.log.title"),
    rightToLeft: rtl,
    columns: [
      { header: t("dl.col.deliverable"), width: 44 },
      { header: t("dl.export.from"), width: 14 },
      { header: t("dl.export.to"), width: 14 },
      { header: t("dl.export.reason"), width: 50 },
      { header: t("dl.export.by"), width: 22 },
      { header: t("dl.export.at"), width: 22 },
    ],
    rows: schedule.changes.map((c) => [
      c.deliverableTitle,
      c.oldDate,
      c.newDate,
      c.reason,
      c.changedBy,
      c.changedAt.slice(0, 16).replace("T", " "),
    ]),
  };
  return [deliverables, changes];
}

const cell = (value: string | number | null) =>
  `<td>${value === null || value === "" ? "—" : escapeXml(String(value))}</td>`;

/** A self-contained, printable HTML report (Save as PDF from the print dialog). */
export function buildDeliveryReportHtml(ctx: ExportContext): string {
  const { t, schedule, variant, dir } = ctx;
  const rows = exportedDeliverables(schedule, variant);
  const title = `${t("dl.title")} — ${schedule.projectName}`;
  const subtitle = `${t(variant === "client" ? "dl.export.clientVersion" : "dl.export.internalVersion")} · ${t("dl.export.generated", { a: ctx.generatedAt.slice(0, 16).replace("T", " ") })}`;

  const head =
    variant === "client"
      ? [
          "dl.col.deliverable",
          "dl.col.committed",
          "dl.col.forecast",
          "dl.col.status",
          "dl.export.delivered",
        ]
      : [
          "dl.col.deliverable",
          "dl.export.progress",
          "dl.col.forecast",
          "dl.col.committed",
          "dl.export.baseline",
          "dl.col.status",
          "dl.export.delivered",
        ];
  const body = rows
    .map((r) => {
      const cells =
        variant === "client"
          ? [r.title, r.committedDate, clientForecast(r), statusLabel(r, t), r.actualDate]
          : [
              `${r.title} (#${r.azureWorkItemId})`,
              r.progressPercent === null ? null : `${r.progressPercent}%`,
              r.forecastDate
                ? r.forecastLow && r.forecastHigh
                  ? `${r.forecastDate} (${r.forecastLow} – ${r.forecastHigh})`
                  : r.forecastDate
                : forecastNote(r, t),
              r.committedDate,
              r.baselineDate,
              r.daysLate
                ? `${statusLabel(r, t)} · ${t("dl.daysLate", { a: r.daysLate })}`
                : statusLabel(r, t),
              r.actualDate,
            ];
      return `<tr class="s-${r.status}">${cells.map(cell).join("")}</tr>`;
    })
    .join("");

  const log =
    variant === "internal" && schedule.changes.length > 0
      ? `<h2>${escapeXml(t("dl.log.title"))}</h2><table><thead><tr>${[
          "dl.col.deliverable",
          "dl.export.from",
          "dl.export.to",
          "dl.export.reason",
          "dl.export.by",
          "dl.export.at",
        ]
          .map((k) => `<th>${escapeXml(t(k as TKey))}</th>`)
          .join("")}</tr></thead><tbody>${schedule.changes
          .map(
            (c) =>
              `<tr>${[
                c.deliverableTitle,
                c.oldDate,
                c.newDate,
                c.reason,
                c.changedBy,
                c.changedAt.slice(0, 16).replace("T", " "),
              ]
                .map(cell)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table>`
      : "";

  const empty = rows.length === 0 ? `<p>${escapeXml(t("dl.export.empty"))}</p>` : "";
  const lang = dir === "rtl" ? "ar" : "en";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px}
.sub{color:#555;margin:0 0 16px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:start;vertical-align:top}
th{background:#f3f4f6}
tr.s-late td:nth-last-child(2){color:#b91c1c;font-weight:600}
tr.s-at_risk td:nth-last-child(2){color:#b45309;font-weight:600}
tr.s-delivered td:nth-last-child(2),tr.s-on_track td:nth-last-child(2){color:#15803d}
@media print{body{margin:12mm}thead{display:table-header-group}tr{break-inside:avoid}}
</style></head><body><h1>${escapeXml(title)}</h1><p class="sub">${escapeXml(subtitle)}</p>${empty}${
    rows.length > 0
      ? `<table><thead><tr>${head.map((k) => `<th>${escapeXml(t(k as TKey))}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`
      : ""
  }${log}</body></html>`;
}

/** File name like `delivery-schedule-hoteliana-client-2026-09-27`. */
export function exportFileName(projectName: string, variant: ExportVariant, date: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `delivery-schedule-${slug || "project"}-${variant}-${date}`;
}
