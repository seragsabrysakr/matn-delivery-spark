import { describe, expect, it } from "vitest";
import {
  deliverableCandidates,
  diffAlerts,
  digestDue,
  isAllowedTeamsWebhook,
  localDateHour,
  newSince,
  stuckSubject,
  teamsDigestMessage,
  type AlertCandidate,
} from "../alert-rules";

const WEEK = [0, 1, 2, 3, 4];

const stuck = (projectId: string, id: number): AlertCandidate => ({
  projectId,
  teamIterationId: "ti",
  kind: "stuck",
  subjectKey: stuckSubject(id),
  azureWorkItemId: id,
  deliverableId: null,
  title: `Item ${id}`,
  details: {},
});

describe("diffAlerts", () => {
  it("opens new subjects and resolves the ones no longer detected", () => {
    const { toOpen, toResolve } = diffAlerts({
      open: [
        { id: "a1", projectId: "p1", subjectKey: "stuck:1" },
        { id: "a2", projectId: "p1", subjectKey: "stuck:2" },
      ],
      detected: [stuck("p1", 2), stuck("p1", 3), stuck("p1", 3)],
      readProjects: new Set(["p1"]),
    });
    expect(toOpen.map((c) => c.subjectKey)).toEqual(["stuck:3"]);
    expect(toResolve.map((a) => a.id)).toEqual(["a1"]);
  });

  it("never resolves alerts of a project that could not be read", () => {
    const { toResolve } = diffAlerts({
      open: [{ id: "a1", projectId: "p2", subjectKey: "stuck:1" }],
      detected: [],
      readProjects: new Set(["p1"]),
    });
    expect(toResolve).toEqual([]);
  });

  it("keeps the same subject in two projects apart", () => {
    const { toOpen } = diffAlerts({
      open: [{ id: "a1", projectId: "p1", subjectKey: "stuck:1" }],
      detected: [stuck("p1", 1), stuck("p2", 1)],
      readProjects: new Set(["p1", "p2"]),
    });
    expect(toOpen.map((c) => c.projectId)).toEqual(["p2"]);
  });
});

describe("deliverableCandidates", () => {
  it("turns late and at-risk deliverables into distinct subjects", () => {
    const base = {
      azureWorkItemId: 10,
      title: "Payments",
      committedDate: "2026-09-20",
      forecastDate: "2026-10-01",
      daysLate: null,
      owner: null,
    };
    const out = deliverableCandidates("p1", [
      { ...base, id: "d1", status: "late", daysLate: 5 },
      { ...base, id: "d2", status: "at_risk" },
      { ...base, id: "d3", status: "on_track" },
      { ...base, id: "d4", status: "delivered" },
    ]);
    expect(out.map((c) => [c.kind, c.subjectKey])).toEqual([
      ["deliverable_late", "dlv:d1:late"],
      ["deliverable_at_risk", "dlv:d2:at_risk"],
    ]);
  });
});

describe("digestDue", () => {
  // 2026-09-27 is a Sunday; Cairo is UTC+3.
  const due = (nowIso: string, lastDigestDate: string | null = null) =>
    digestDue({ nowIso, timeZone: "Africa/Cairo", workingWeekdays: WEEK, lastDigestDate });

  it("is due from 9:00 local time on a working day, once", () => {
    expect(due("2026-09-27T05:59:00Z")).toBeNull(); // 08:59 Cairo
    expect(due("2026-09-27T06:00:00Z")).toBe("2026-09-27"); // 09:00 Cairo
    expect(due("2026-09-27T12:00:00Z", "2026-09-27")).toBeNull();
    expect(due("2026-09-28T07:00:00Z", "2026-09-27")).toBe("2026-09-28");
  });

  it("is never due on the weekend", () => {
    expect(due("2026-09-25T08:00:00Z")).toBeNull(); // Friday
    expect(due("2026-09-26T08:00:00Z")).toBeNull(); // Saturday
  });

  it("reads the hour in the team's time zone", () => {
    expect(localDateHour("2026-09-27T21:30:00Z", "Africa/Cairo")).toEqual({
      date: "2026-09-28",
      hour: 0,
    });
  });
});

describe("newSince", () => {
  it("keeps alerts detected after the previous digest", () => {
    const alerts = [
      { id: 1, detectedAt: "2026-09-27T05:00:00Z" },
      { id: 2, detectedAt: "2026-09-27T07:00:00Z" },
    ];
    expect(newSince(alerts, "2026-09-27T06:00:00Z").map((a) => a.id)).toEqual([2]);
    expect(newSince(alerts, null).map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("teamsDigestMessage", () => {
  it("builds an Adaptive Card envelope with a link back to the app", () => {
    const msg = teamsDigestMessage(
      {
        date: "2026-09-27",
        sprints: [],
        newAlerts: [
          {
            kind: "stuck",
            projectName: "Hoteliana",
            title: "Payment callbacks",
            azureWorkItemId: 1501,
            azureUrl: "https://dev.azure.com/x/1501",
            detectedAt: "2026-09-27T05:00:00Z",
            details: {},
          },
        ],
        openCounts: { stuck: 1, deliverable_late: 0, deliverable_at_risk: 0 },
      },
      "https://matn-delivery-spark.lovable.app/",
    ) as {
      type: string;
      attachments: {
        contentType: string;
        content: { body: { text: string }[]; actions: { url: string }[] };
      }[];
    };
    expect(msg.type).toBe("message");
    const card = msg.attachments[0]!;
    expect(card.contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(card.content.actions[0]!.url).toBe("https://matn-delivery-spark.lovable.app/alerts");
    expect(card.content.body.some((b) => b.text.includes("#1501"))).toBe(true);
  });
});

describe("isAllowedTeamsWebhook", () => {
  it("accepts only Microsoft webhook hosts over https", () => {
    expect(isAllowedTeamsWebhook("https://prod-12.westeurope.logic.azure.com/workflows/abc")).toBe(
      true,
    );
    expect(isAllowedTeamsWebhook("https://contoso.webhook.office.com/webhookb2/x")).toBe(true);
    expect(
      isAllowedTeamsWebhook("https://default123.environment.api.powerplatform.com/powerautomate/x"),
    ).toBe(true);
    expect(isAllowedTeamsWebhook("http://contoso.webhook.office.com/x")).toBe(false);
    expect(isAllowedTeamsWebhook("https://evil.example.com/webhook.office.com")).toBe(false);
    expect(isAllowedTeamsWebhook("https://user:pw@contoso.webhook.office.com/x")).toBe(false);
    expect(isAllowedTeamsWebhook("")).toBe(false);
    expect(isAllowedTeamsWebhook(undefined)).toBe(false);
  });
});
