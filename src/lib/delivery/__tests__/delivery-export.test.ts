import { describe, expect, it } from "vitest";
import {
  buildDeliveryReportHtml,
  buildDeliverySheets,
  exportedDeliverables,
  exportFileName,
} from "../delivery-export";
import type { DeliverableView, DeliverySchedulePayload } from "../deliverables.server";

const row = (over: Partial<DeliverableView>): DeliverableView => ({
  id: "d",
  azureWorkItemId: 1,
  azureUrl: "https://dev.azure.com/o/P/_workitems/edit/1",
  title: "Feature",
  workItemType: "Feature",
  owner: "Sara",
  progressPercent: 50,
  progressBasis: "points",
  scopeItems: 4,
  completedItems: 2,
  contributingSprints: ["P\\Sprint 1"],
  forecastDate: "2026-10-18",
  forecastLow: "2026-10-18",
  forecastHigh: "2026-11-08",
  forecastReason: null,
  committedDate: "2026-10-30",
  baselineDate: "2026-10-15",
  actualDate: null,
  clientVisible: false,
  notes: "internal note",
  status: "on_track",
  statusReason: null,
  daysLate: null,
  computedAt: null,
  ...over,
});

const schedule: DeliverySchedulePayload = {
  projectName: "Hoteliana",
  mapping: { mode: "work_item_type", value: "Feature" },
  workItemTypes: ["Feature"],
  canEdit: true,
  deliverables: [
    row({ id: "a", azureWorkItemId: 1, title: "Login", clientVisible: true }),
    row({
      id: "b",
      azureWorkItemId: 2,
      title: "Hotel <Library>",
      forecastDate: null,
      forecastLow: null,
      forecastHigh: null,
      forecastReason: "no_recent_progress",
      status: "at_risk",
      statusReason: "forecast_unavailable",
    }),
  ],
  changes: [
    {
      id: "c1",
      deliverableId: "a",
      deliverableTitle: "Login",
      oldDate: "2026-10-15",
      newDate: "2026-10-30",
      reason: "Client added scope",
      changedBy: "DM",
      changedAt: "2026-09-27T10:00:00Z",
    },
  ],
  lastRefresh: null,
};

// Echo translator: returns the key (with vars) so tests do not depend on copy.
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${Object.values(vars).join(",")}` : key;
const ctx = (variant: "internal" | "client") => ({
  schedule,
  variant,
  t: t as never,
  dir: "rtl" as const,
  generatedAt: "2026-09-27T12:00:00Z",
});

describe("delivery exports", () => {
  it("gives the client only client-visible deliverables", () => {
    expect(exportedDeliverables(schedule, "client").map((d) => d.title)).toEqual(["Login"]);
    expect(exportedDeliverables(schedule, "internal")).toHaveLength(2);
  });

  it("keeps internal details out of the client sheet", () => {
    const [sheet, ...rest] = buildDeliverySheets(ctx("client"));
    expect(rest).toHaveLength(0);
    expect(sheet!.rightToLeft).toBe(true);
    expect(sheet!.rows).toEqual([
      ["Login", "2026-10-30", "2026-10-18", "dl.status.on_track", null],
    ]);
    const flat = JSON.stringify(sheet);
    expect(flat).not.toContain("internal note");
    expect(flat).not.toContain("2026-10-15"); // baseline
    expect(flat).not.toContain("Sara");
  });

  it("puts everything in the internal workbook, with the change log", () => {
    const [deliverables, log] = buildDeliverySheets(ctx("internal"));
    expect(deliverables!.rows).toHaveLength(2);
    expect(deliverables!.columns).toHaveLength(deliverables!.rows[0]!.length);
    // A missing forecast carries its reason instead of a date.
    expect(deliverables!.rows[1]).toContain("dl.reason.no_recent_progress");
    expect(log!.rows).toEqual([
      ["Login", "2026-10-15", "2026-10-30", "Client added scope", "DM", "2026-09-27 10:00"],
    ]);
  });

  it("renders an escaped, direction-aware printable report", () => {
    const html = buildDeliveryReportHtml(ctx("internal"));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("Hotel &lt;Library&gt;");
    expect(html).not.toContain("Hotel <Library>");
    expect(html).toContain("dl.log.title");
    const client = buildDeliveryReportHtml(ctx("client"));
    expect(client).not.toContain("Library");
    expect(client).not.toContain("dl.log.title");
  });

  it("names files by project, variant and date", () => {
    expect(exportFileName("Hoteliana Suite", "client", "2026-09-27")).toBe(
      "delivery-schedule-hoteliana-suite-client-2026-09-27",
    );
    expect(exportFileName("متن", "internal", "2026-09-27")).toBe(
      "delivery-schedule-project-internal-2026-09-27",
    );
  });
});
