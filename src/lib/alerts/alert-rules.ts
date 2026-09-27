/**
 * Pure alert and digest rules (ADR-030). The scheduler detects alert
 * candidates from the same rules the pages use — stuck work (ADR-015) in each
 * team's current sprint (ADR-028) and deliverable status (ADR-021) — and this
 * module decides which alerts open, which resolve, when the daily digest is
 * due, and what it says. Nothing here reads a database, a clock or the network.
 */
import { isWorkingDay } from "@/lib/calendar/cairo";

export type AlertKind = "stuck" | "deliverable_late" | "deliverable_at_risk";

/** Detection runs at most this often; each run reads every current sprint. */
export const DETECTION_INTERVAL_MS = 30 * 60_000;
/** The digest goes out at this local hour on the tenant's working days. */
export const DIGEST_HOUR = 9;

export interface AlertCandidate {
  readonly projectId: string;
  readonly teamIterationId: string | null;
  readonly kind: AlertKind;
  readonly subjectKey: string;
  readonly azureWorkItemId: number | null;
  readonly deliverableId: string | null;
  readonly title: string;
  readonly details: Readonly<Record<string, string | number | null | readonly string[]>>;
}

export interface OpenAlert {
  readonly id: string;
  readonly projectId: string;
  readonly subjectKey: string;
}

export const stuckSubject = (azureWorkItemId: number) => `stuck:${azureWorkItemId}`;
export const deliverableSubject = (deliverableId: string, status: "late" | "at_risk") =>
  `dlv:${deliverableId}:${status}`;

/**
 * What changes between the alerts currently open and what is detected now:
 * a subject detected and not open opens; an open subject no longer detected
 * resolves. Projects that could not be read this run are left untouched, so a
 * failed read never resolves real alerts.
 */
export function diffAlerts(input: {
  readonly open: readonly OpenAlert[];
  readonly detected: readonly AlertCandidate[];
  readonly readProjects: ReadonlySet<string>;
}): { readonly toOpen: AlertCandidate[]; readonly toResolve: OpenAlert[] } {
  const key = (projectId: string, subject: string) => `${projectId}|${subject}`;
  const openKeys = new Set(input.open.map((a) => key(a.projectId, a.subjectKey)));
  const detectedKeys = new Set<string>();
  const toOpen: AlertCandidate[] = [];
  for (const candidate of input.detected) {
    const k = key(candidate.projectId, candidate.subjectKey);
    if (detectedKeys.has(k)) continue;
    detectedKeys.add(k);
    if (!openKeys.has(k)) toOpen.push(candidate);
  }
  const toResolve = input.open.filter(
    (a) => input.readProjects.has(a.projectId) && !detectedKeys.has(key(a.projectId, a.subjectKey)),
  );
  return { toOpen, toResolve };
}

/** Deliverables that are late or at risk become candidates; the rest do not. */
export function deliverableCandidates(
  projectId: string,
  deliverables: readonly {
    readonly id: string;
    readonly azureWorkItemId: number;
    readonly title: string;
    readonly status: string;
    readonly committedDate: string | null;
    readonly forecastDate: string | null;
    readonly daysLate: number | null;
    readonly owner: string | null;
  }[],
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const d of deliverables) {
    if (d.status !== "late" && d.status !== "at_risk") continue;
    out.push({
      projectId,
      teamIterationId: null,
      kind: d.status === "late" ? "deliverable_late" : "deliverable_at_risk",
      subjectKey: deliverableSubject(d.id, d.status),
      azureWorkItemId: d.azureWorkItemId,
      deliverableId: d.id,
      title: d.title,
      details: {
        committedDate: d.committedDate,
        forecastDate: d.forecastDate,
        daysLate: d.daysLate,
        owner: d.owner,
      },
    });
  }
  return out;
}

/** Local date and hour of an instant in a time zone. */
export function localDateHour(
  iso: string,
  timeZone: string,
): { readonly date: string; readonly hour: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/**
 * The digest is due once per working day, from DIGEST_HOUR local time, when
 * none has been built for that date. Returns the local date to build it for.
 */
export function digestDue(input: {
  readonly nowIso: string;
  readonly timeZone: string;
  readonly workingWeekdays: readonly number[];
  readonly lastDigestDate: string | null;
}): string | null {
  const local = localDateHour(input.nowIso, input.timeZone);
  if (!local) return null;
  if (!isWorkingDay(local.date, input.workingWeekdays)) return null;
  if (local.hour < DIGEST_HOUR) return null;
  if (input.lastDigestDate !== null && input.lastDigestDate >= local.date) return null;
  return local.date;
}

export interface DigestAlert {
  readonly kind: AlertKind;
  readonly projectName: string;
  readonly title: string;
  readonly azureWorkItemId: number | null;
  readonly azureUrl: string | null;
  readonly detectedAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface DigestSprint {
  readonly projectName: string;
  readonly teamName: string;
  readonly sprintName: string;
  readonly phase: string;
  readonly workingDaysLeft: number | null;
  readonly workingDaysSinceEnd: number | null;
  readonly storiesDone: number;
  readonly storiesTotal: number;
  readonly tasksDone: number;
  readonly tasksTotal: number;
  readonly stuck: number;
}

export interface DigestContent {
  readonly date: string;
  readonly sprints: readonly DigestSprint[];
  /** Alerts opened since the previous digest. */
  readonly newAlerts: readonly DigestAlert[];
  /** Counts of every alert still open, by kind. */
  readonly openCounts: Readonly<Record<AlertKind, number>>;
}

/** Alerts opened after the previous digest (all open ones on the first digest). */
export function newSince<T extends { readonly detectedAt: string }>(
  alerts: readonly T[],
  previousDigestAt: string | null,
): T[] {
  if (!previousDigestAt) return [...alerts];
  const since = Date.parse(previousDigestAt);
  return alerts.filter((a) => Date.parse(a.detectedAt) > since);
}

const KIND_LABEL: Record<AlertKind, string> = {
  stuck: "شغل متعطل",
  deliverable_late: "تسليم متأخر",
  deliverable_at_risk: "تسليم معرّض للخطر",
};

const MAX_CARD_ALERTS = 15;

function sprintLine(s: DigestSprint): string {
  const when =
    s.phase === "overdue"
      ? `متأخر ${s.workingDaysSinceEnd ?? 0} يوم عمل`
      : s.phase === "running"
        ? `باقي ${s.workingDaysLeft ?? 0} يوم عمل`
        : s.phase;
  return `**${s.projectName} · ${s.teamName} — ${s.sprintName}** · ${when} · Stories ${s.storiesDone}/${s.storiesTotal} · Tasks ${s.tasksDone}/${s.tasksTotal} · متعطل ${s.stuck}`;
}

/**
 * The Teams message: an Adaptive Card in the envelope both Teams Workflows
 * webhooks and legacy incoming webhooks accept. Plain facts only.
 */
export function teamsDigestMessage(content: DigestContent, appUrl: string): unknown {
  const body: unknown[] = [
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: `ملخص التسليم اليومي — ${content.date}`,
    },
    {
      type: "TextBlock",
      isSubtle: true,
      wrap: true,
      text: `مفتوح الآن: ${content.openCounts.stuck} متعطل · ${content.openCounts.deliverable_late} تسليم متأخر · ${content.openCounts.deliverable_at_risk} معرّض للخطر`,
    },
  ];
  if (content.sprints.length > 0) {
    body.push({
      type: "TextBlock",
      weight: "Bolder",
      text: "السبرنتات الحالية",
      spacing: "Medium",
    });
    for (const s of content.sprints)
      body.push({ type: "TextBlock", wrap: true, text: sprintLine(s) });
  }
  body.push({
    type: "TextBlock",
    weight: "Bolder",
    spacing: "Medium",
    text:
      content.newAlerts.length > 0
        ? `جديد منذ آخر ملخص (${content.newAlerts.length})`
        : "لا توجد تنبيهات جديدة منذ آخر ملخص.",
  });
  for (const a of content.newAlerts.slice(0, MAX_CARD_ALERTS)) {
    const id = a.azureWorkItemId ? ` #${a.azureWorkItemId}` : "";
    const title = a.azureUrl ? `[${a.title}${id}](${a.azureUrl})` : `${a.title}${id}`;
    body.push({
      type: "TextBlock",
      wrap: true,
      text: `• ${KIND_LABEL[a.kind]} — ${a.projectName}: ${title}`,
    });
  }
  if (content.newAlerts.length > MAX_CARD_ALERTS) {
    body.push({
      type: "TextBlock",
      isSubtle: true,
      text: `و ${content.newAlerts.length - MAX_CARD_ALERTS} غيرها في التطبيق.`,
    });
  }
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          rtl: true,
          body,
          actions: [
            {
              type: "Action.OpenUrl",
              title: "افتح التنبيهات",
              url: `${appUrl.replace(/\/$/, "")}/alerts`,
            },
          ],
        },
      },
    ],
  };
}

/**
 * Only Microsoft's webhook hosts over https are accepted, so a mistyped secret
 * can never send delivery data anywhere else.
 */
export function isAllowedTeamsWebhook(url: string | undefined | null): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host.endsWith(".webhook.office.com") ||
    host.endsWith(".logic.azure.com") ||
    host.endsWith(".environment.api.powerplatform.com")
  );
}
