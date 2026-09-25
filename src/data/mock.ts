/**
 * Isolated mock data layer.
 *
 * Nothing in this file touches the network. When Azure DevOps and Lovable
 * Cloud are wired up, `getDeliverySnapshot` becomes an async server call and
 * the component tree stays unchanged.
 */
import type {
  DeliverySnapshot,
  Iteration,
  Organization,
  Project,
  Team,
  WorkItemRef,
  WorkspaceFilters,
} from "./types";

export const organizations: Organization[] = [
  { id: "org-matn", name: { ar: "مجموعة متن", en: "MATN Group" } },
  { id: "org-north", name: { ar: "قطاع الشمال الرقمي", en: "Northern Digital" } },
];

export const projects: Project[] = [
  {
    id: "prj-atlas",
    organizationId: "org-matn",
    name: { ar: "منصة أطلس", en: "Atlas Platform" },
  },
  {
    id: "prj-payments",
    organizationId: "org-matn",
    name: { ar: "بوابة المدفوعات", en: "Payments Gateway" },
  },
  {
    id: "prj-portal",
    organizationId: "org-north",
    name: { ar: "بوابة العملاء", en: "Customer Portal" },
  },
];

export const teams: Team[] = [
  { id: "team-core", projectId: "prj-atlas", name: { ar: "فريق النواة", en: "Core Team" } },
  { id: "team-mobile", projectId: "prj-atlas", name: { ar: "فريق التطبيقات", en: "Mobile Team" } },
  { id: "team-ledger", projectId: "prj-payments", name: { ar: "فريق الدفاتر", en: "Ledger Team" } },
  { id: "team-portal", projectId: "prj-portal", name: { ar: "فريق البوابة", en: "Portal Team" } },
];

export const iterations: Iteration[] = [
  {
    id: "it-24",
    teamId: "team-core",
    name: { ar: "السبرنت ٢٤", en: "Sprint 24" },
    startDate: "2026-08-17",
    endDate: "2026-08-28",
    currentDay: 7,
    totalDays: 10,
  },
  {
    id: "it-23",
    teamId: "team-core",
    name: { ar: "السبرنت ٢٣", en: "Sprint 23" },
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    currentDay: 10,
    totalDays: 10,
  },
  {
    id: "it-m12",
    teamId: "team-mobile",
    name: { ar: "السبرنت ١٢", en: "Sprint 12" },
    startDate: "2026-08-17",
    endDate: "2026-08-28",
    currentDay: 7,
    totalDays: 10,
  },
  {
    id: "it-l08",
    teamId: "team-ledger",
    name: { ar: "السبرنت ٨", en: "Sprint 8" },
    startDate: "2026-08-17",
    endDate: "2026-08-28",
    currentDay: 6,
    totalDays: 10,
  },
  {
    id: "it-p03",
    teamId: "team-portal",
    name: { ar: "السبرنت ٣", en: "Sprint 3" },
    startDate: "2026-08-19",
    endDate: "2026-08-30",
    currentDay: 5,
    totalDays: 10,
  },
];

export const defaultFilters: WorkspaceFilters = {
  organizationId: "org-matn",
  projectId: "prj-atlas",
  teamId: "team-core",
  iterationId: "it-24",
};

const items = (...refs: WorkItemRef[]) => refs;

const wi = (
  id: string,
  ar: string,
  en: string,
  type: WorkItemRef["type"],
  stateAr: string,
  stateEn: string,
): WorkItemRef => ({ id, title: { ar, en }, type, state: { ar: stateAr, en: stateEn } });

const baseSnapshot: DeliverySnapshot = {
  iterationId: "it-24",
  lastSyncMinutesAgo: 12,
  freshness: "fresh",
  kpis: [
    {
      id: "confidence",
      labelKey: "kpi.confidence",
      tooltipKey: "kpi.confidence.help",
      explanationKey: "kpi.confidence.explain",
      value: 68,
      unit: "percent",
      status: "atRisk",
      comparison: { kind: "previous", value: 81 },
      trend: [
        { label: "S20", value: 74 },
        { label: "S21", value: 79 },
        { label: "S22", value: 77 },
        { label: "S23", value: 81 },
        { label: "S24", value: 68 },
      ],
      drivers: [
        { ar: "زيادة النطاق بعد اليوم الثالث بمقدار ١٤٪.", en: "Scope grew 14% after day three." },
        { ar: "خمسة معوّقات حرجة ما زالت مفتوحة.", en: "Five critical blockers remain open." },
        { ar: "سعة الاختبار أقل بمقدار يوم ونصف.", en: "QA capacity is short by 1.5 days." },
      ],
      relatedItems: items(
        wi(
          "12841",
          "تكامل بوابة الهوية",
          "Identity gateway integration",
          "User Story",
          "قيد التطوير",
          "Active",
        ),
        wi(
          "12902",
          "فشل التحقق من الجلسة",
          "Session validation failure",
          "Bug",
          "متوقف",
          "Blocked",
        ),
      ),
      formula: {
        ar: "نموذج مرجّح يجمع السرعة الحالية، وثبات النطاق، وعمر المعوّقات، وسعة الاختبار.",
        en: "Weighted model over current velocity, scope stability, blocker age, and QA capacity.",
      },
    },
    {
      id: "scope",
      labelKey: "kpi.scope",
      tooltipKey: "kpi.scope.help",
      explanationKey: "kpi.scope.explain",
      value: 61,
      unit: "percent",
      status: "atRisk",
      comparison: { kind: "target", value: 72 },
      trend: [
        { label: "D3", value: 18 },
        { label: "D4", value: 29 },
        { label: "D5", value: 41 },
        { label: "D6", value: 52 },
        { label: "D7", value: 61 },
      ],
      drivers: [
        { ar: "أُنجزت ٣٧ نقطة من أصل ٦١ نقطة.", en: "37 of 61 committed points are done." },
        { ar: "عنصران كبيران ما زالا في المراجعة.", en: "Two large items are still in review." },
      ],
      relatedItems: items(
        wi(
          "12777",
          "لوحة تقارير المدفوعات",
          "Payments reporting board",
          "User Story",
          "قيد المراجعة",
          "In review",
        ),
      ),
      formula: {
        ar: "النقاط المكتملة ÷ إجمالي نقاط النطاق الحالي.",
        en: "Completed points divided by total current scope points.",
      },
    },
    {
      id: "expected",
      labelKey: "kpi.expected",
      tooltipKey: "kpi.expected.help",
      explanationKey: "kpi.expected.explain",
      value: 72,
      unit: "percent",
      status: "neutral",
      comparison: { kind: "previous", value: 70 },
      trend: [
        { label: "D3", value: 24 },
        { label: "D4", value: 36 },
        { label: "D5", value: 48 },
        { label: "D6", value: 60 },
        { label: "D7", value: 72 },
      ],
      drivers: [
        {
          ar: "خط مرجعي خطي معدّل حسب أيام العطل.",
          en: "Linear baseline adjusted for non-working days.",
        },
      ],
      relatedItems: [],
      formula: {
        ar: "اليوم الحالي ÷ أيام السبرنت العاملة × ١٠٠.",
        en: "Current day divided by working sprint days, times 100.",
      },
    },
    {
      id: "scopeChange",
      labelKey: "kpi.scopeChange",
      tooltipKey: "kpi.scopeChange.help",
      explanationKey: "kpi.scopeChange.explain",
      value: 14,
      unit: "delta",
      status: "critical",
      comparison: { kind: "previous", value: 4 },
      trend: [
        { label: "S20", value: 3 },
        { label: "S21", value: 6 },
        { label: "S22", value: 5 },
        { label: "S23", value: 4 },
        { label: "S24", value: 14 },
      ],
      drivers: [
        {
          ar: "طلب عاجل من الالتزام التنظيمي أضاف ٨ نقاط.",
          en: "An urgent compliance request added 8 points.",
        },
        { ar: "لم تُزَل أي عناصر مقابل الإضافات.", en: "No items were traded out in return." },
      ],
      relatedItems: items(
        wi(
          "12955",
          "سجل تدقيق الالتزام",
          "Compliance audit log",
          "User Story",
          "قيد التطوير",
          "Active",
        ),
        wi("12961", "تصدير كشف الحساب", "Statement export", "Task", "جديد", "New"),
      ),
      formula: {
        ar: "(النقاط المضافة − النقاط المُزالة) ÷ النطاق الأصلي.",
        en: "(Added points minus removed points) divided by original scope.",
      },
    },
    {
      id: "blockers",
      labelKey: "kpi.blockers",
      tooltipKey: "kpi.blockers.help",
      explanationKey: "kpi.blockers.explain",
      value: 5,
      unit: "count",
      status: "critical",
      comparison: { kind: "previous", value: 2 },
      trend: [
        { label: "D3", value: 1 },
        { label: "D4", value: 2 },
        { label: "D5", value: 4 },
        { label: "D6", value: 4 },
        { label: "D7", value: 5 },
      ],
      drivers: [
        { ar: "معوّقان يعتمدان على فريق خارجي.", en: "Two blockers depend on an external team." },
        { ar: "متوسط عمر المعوّق ٣٫٦ يوم.", en: "Average blocker age is 3.6 days." },
      ],
      relatedItems: items(
        wi(
          "12902",
          "فشل التحقق من الجلسة",
          "Session validation failure",
          "Bug",
          "متوقف",
          "Blocked",
        ),
        wi(
          "12888",
          "انتظار بيئة الاختبار",
          "Waiting on test environment",
          "Task",
          "متوقف",
          "Blocked",
        ),
      ),
      formula: {
        ar: "عدد العناصر ذات وسم متوقف وشدة حرجة أو عالية.",
        en: "Count of items flagged blocked with critical or high severity.",
      },
    },
    {
      id: "release",
      labelKey: "kpi.release",
      tooltipKey: "kpi.release.help",
      explanationKey: "kpi.release.explain",
      value: 64,
      unit: "percent",
      status: "atRisk",
      comparison: { kind: "target", value: 85 },
      trend: [
        { label: "S20", value: 78 },
        { label: "S21", value: 82 },
        { label: "S22", value: 71 },
        { label: "S23", value: 76 },
        { label: "S24", value: 64 },
      ],
      drivers: [
        { ar: "٩ اختبارات انحدار فاشلة.", en: "Nine regression tests are failing." },
        { ar: "ملاحظات الإصدار غير مكتملة.", en: "Release notes are incomplete." },
      ],
      relatedItems: items(
        wi(
          "12930",
          "حزمة اختبار الانحدار",
          "Regression test suite",
          "Test Case",
          "فاشل",
          "Failing",
        ),
      ),
      formula: {
        ar: "متوسط مرجّح للاختبارات الناجحة، ونجاح النشر، وقبول الأعمال، والتوثيق.",
        en: "Weighted average of passing tests, deploy success, business sign-off, and documentation.",
      },
    },
  ],
  trajectory: {
    startDate: "2026-08-17",
    endDate: "2026-08-28",
    forecastCompletion: 84,
    forecastRange: [72, 93],
    points: [
      { day: 0, actual: 0, expected: 0, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 1, actual: 4, expected: 10, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 2, actual: 11, expected: 20, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 3, actual: 18, expected: 30, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 4, actual: 29, expected: 41, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 5, actual: 41, expected: 51, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 6, actual: 52, expected: 62, forecast: null, forecastLow: null, forecastHigh: null },
      { day: 7, actual: 61, expected: 72, forecast: 61, forecastLow: 61, forecastHigh: 61 },
      { day: 8, actual: null, expected: 81, forecast: 69, forecastLow: 64, forecastHigh: 75 },
      { day: 9, actual: null, expected: 91, forecast: 77, forecastLow: 68, forecastHigh: 85 },
      { day: 10, actual: null, expected: 100, forecast: 84, forecastLow: 72, forecastHigh: 93 },
    ],
  },
  risks: [
    {
      id: "risk-1",
      severity: "critical",
      title: {
        ar: "تعطّل التحقق من الجلسة يوقف مسار تسجيل الدخول",
        en: "Session validation defect halts the sign-in path",
      },
      explanation: {
        ar: "الخلل يمنع اختبار ثلاث قصص مرتبطة بالهوية، ويؤخر بدء اختبار الانحدار.",
        en: "The defect blocks testing on three identity stories and delays the regression cycle.",
      },
      recommendation: {
        ar: "خصّص مطوّرَين اليوم لإغلاق الخلل قبل نهاية اليوم الثامن.",
        en: "Pair two developers on the defect today and close it before the end of day eight.",
      },
      owner: "Layla Haddad",
      ageDays: 5,
      items: items(
        wi(
          "12902",
          "فشل التحقق من الجلسة",
          "Session validation failure",
          "Bug",
          "متوقف",
          "Blocked",
        ),
        wi(
          "12841",
          "تكامل بوابة الهوية",
          "Identity gateway integration",
          "User Story",
          "قيد التطوير",
          "Active",
        ),
      ),
      adoUrl: "#",
    },
    {
      id: "risk-2",
      severity: "critical",
      title: { ar: "نمو النطاق دون مقايضة", en: "Scope growth with no trade-out" },
      explanation: {
        ar: "أُضيفت ٨ نقاط التزام تنظيمي بعد بدء السبرنت دون إزالة عمل مقابل.",
        en: "Eight compliance points entered after sprint start with nothing removed in exchange.",
      },
      recommendation: {
        ar: "أعد التفاوض على تأجيل عنصرين منخفضي الأولوية إلى السبرنت القادم.",
        en: "Renegotiate to defer two low-priority items into the next sprint.",
      },
      owner: "Omar Nasser",
      ageDays: 4,
      items: items(
        wi(
          "12955",
          "سجل تدقيق الالتزام",
          "Compliance audit log",
          "User Story",
          "قيد التطوير",
          "Active",
        ),
      ),
      adoUrl: "#",
    },
    {
      id: "risk-3",
      severity: "high",
      title: { ar: "طلبات دمج راكدة تعطّل التسليم", en: "Stale pull requests are choking flow" },
      explanation: {
        ar: "أربع طلبات دمج تجاوزت ٤٨ ساعة دون مراجعة، ويعتمد عليها عملٌ لاحق.",
        en: "Four pull requests have waited over 48 hours and downstream work depends on them.",
      },
      recommendation: {
        ar: "حدّد نافذة مراجعة يومية ثابتة وعيّن مراجعاً احتياطياً.",
        en: "Set a fixed daily review window and assign a backup reviewer.",
      },
      owner: "Sara Kamel",
      ageDays: 3,
      items: items(
        wi(
          "12812",
          "إعادة هيكلة طبقة التخزين",
          "Storage layer refactor",
          "Task",
          "قيد المراجعة",
          "In review",
        ),
      ),
      adoUrl: "#",
    },
    {
      id: "risk-4",
      severity: "high",
      title: {
        ar: "سعة الاختبار غير كافية لنهاية السبرنت",
        en: "QA capacity falls short of the sprint close",
      },
      explanation: {
        ar: "حجم العمل المتبقي للاختبار يتجاوز السعة المتاحة بمقدار يوم ونصف.",
        en: "Remaining test work exceeds available QA capacity by 1.5 days.",
      },
      recommendation: {
        ar: "ابدأ اختبار العناصر المكتملة تدريجياً بدل تجميعها في نهاية السبرنت.",
        en: "Test completed items continuously instead of batching them at sprint end.",
      },
      owner: "Hadi Mansour",
      ageDays: 6,
      items: items(
        wi(
          "12930",
          "حزمة اختبار الانحدار",
          "Regression test suite",
          "Test Case",
          "فاشل",
          "Failing",
        ),
      ),
      adoUrl: "#",
    },
    {
      id: "risk-5",
      severity: "watch",
      title: {
        ar: "اعتماد خارجي على فريق البنية التحتية",
        en: "External dependency on the platform team",
      },
      explanation: {
        ar: "بيئة الاختبار المشتركة غير متاحة، والطلب معلّق منذ ثلاثة أيام.",
        en: "The shared test environment is unavailable and the request has been pending three days.",
      },
      recommendation: {
        ar: "صعّد الطلب في اجتماع التنسيق اليومي مع فريق البنية التحتية.",
        en: "Escalate the request in the daily coordination sync with the platform team.",
      },
      owner: "Nour Idris",
      ageDays: 3,
      items: items(
        wi(
          "12888",
          "انتظار بيئة الاختبار",
          "Waiting on test environment",
          "Task",
          "متوقف",
          "Blocked",
        ),
      ),
      adoUrl: "#",
    },
  ],
  funnel: [
    { id: "backlog", count: 34, avgDays: 9.2, status: "neutral" },
    { id: "ready", count: 12, avgDays: 2.1, status: "healthy" },
    { id: "development", count: 9, avgDays: 3.4, status: "healthy" },
    { id: "review", count: 7, avgDays: 2.6, status: "atRisk" },
    { id: "testing", count: 5, avgDays: 4.1, status: "critical" },
    { id: "done", count: 21, avgDays: 0, status: "healthy" },
  ],
  teamLoad: [
    {
      id: "m1",
      name: "Layla Haddad",
      role: { ar: "مطوّرة أولى", en: "Senior Developer" },
      capacityHours: 32,
      assignedHours: 41,
      activeItems: 4,
      blockedItems: 2,
      signal: "over",
    },
    {
      id: "m2",
      name: "Omar Nasser",
      role: { ar: "قائد الفريق", en: "Team Lead" },
      capacityHours: 24,
      assignedHours: 22,
      activeItems: 3,
      blockedItems: 0,
      signal: "balanced",
    },
    {
      id: "m3",
      name: "Sara Kamel",
      role: { ar: "مطوّرة واجهات", en: "Frontend Developer" },
      capacityHours: 32,
      assignedHours: 30,
      activeItems: 3,
      blockedItems: 1,
      signal: "balanced",
    },
    {
      id: "m4",
      name: "Hadi Mansour",
      role: { ar: "مهندس جودة", en: "QA Engineer" },
      capacityHours: 32,
      assignedHours: 38,
      activeItems: 5,
      blockedItems: 1,
      signal: "over",
    },
    {
      id: "m5",
      name: "Nour Idris",
      role: { ar: "مطوّر خدمات", en: "Backend Developer" },
      capacityHours: 32,
      assignedHours: 18,
      activeItems: 2,
      blockedItems: 1,
      signal: "under",
    },
    {
      id: "m6",
      name: "Faris Zayed",
      role: { ar: "مسؤول الإصدار", en: "Release Owner" },
      capacityHours: 16,
      assignedHours: 15,
      activeItems: 2,
      blockedItems: 0,
      signal: "balanced",
    },
  ],
  engineering: {
    activePullRequests: 11,
    stalePullRequests: 4,
    medianReviewHours: 19,
    buildSuccessRate: 82,
    failedTests: 9,
    deployment: { status: "critical", labelKey: "eng.deploy.blocked", noteKey: "eng.deploy.note" },
  },
  actions: [
    {
      id: "act-1",
      priority: 1,
      title: {
        ar: "خصّص مطوّرَين لإغلاق خلل التحقق من الجلسة",
        en: "Pair two developers to close the session validation defect",
      },
      impact: {
        ar: "يرفع ثقة السبرنت نحو ٩ نقاط",
        en: "Raises sprint confidence by about 9 points",
      },
      reason: {
        ar: "الخلل يحجب ثلاث قصص ويؤخر بدء اختبار الانحدار.",
        en: "The defect blocks three stories and delays the regression cycle.",
      },
      items: items(
        wi(
          "12902",
          "فشل التحقق من الجلسة",
          "Session validation failure",
          "Bug",
          "متوقف",
          "Blocked",
        ),
      ),
    },
    {
      id: "act-2",
      priority: 2,
      title: {
        ar: "أجّل عنصرين منخفضي الأولوية إلى السبرنت القادم",
        en: "Defer two low-priority items to next sprint",
      },
      impact: { ar: "يخفّض العجز في النطاق بمقدار ٦ نقاط", en: "Cuts the scope gap by 6 points" },
      reason: {
        ar: "النطاق نما ١٤٪ بعد البدء دون مقايضة.",
        en: "Scope grew 14% mid-sprint with no trade-out.",
      },
      items: items(wi("12961", "تصدير كشف الحساب", "Statement export", "Task", "جديد", "New")),
    },
    {
      id: "act-3",
      priority: 3,
      title: {
        ar: "افتح نافذة مراجعة يومية لطلبات الدمج",
        en: "Open a daily pull request review window",
      },
      impact: {
        ar: "يقلّص وسيط المراجعة إلى نحو ٨ ساعات",
        en: "Brings median review time down to about 8 hours",
      },
      reason: {
        ar: "أربع طلبات دمج تجاوزت ٤٨ ساعة وتحجب عملاً لاحقاً.",
        en: "Four pull requests exceeded 48 hours and are blocking downstream work.",
      },
      items: items(
        wi(
          "12812",
          "إعادة هيكلة طبقة التخزين",
          "Storage layer refactor",
          "Task",
          "قيد المراجعة",
          "In review",
        ),
      ),
    },
    {
      id: "act-4",
      priority: 4,
      title: {
        ar: "ابدأ اختبار العناصر المكتملة يومياً",
        en: "Start testing completed items daily",
      },
      impact: {
        ar: "يرفع جاهزية الإصدار نحو ٧ نقاط",
        en: "Lifts release readiness by about 7 points",
      },
      reason: {
        ar: "تجميع الاختبار في نهاية السبرنت يتجاوز سعة الجودة.",
        en: "Batching tests at sprint end exceeds available QA capacity.",
      },
      items: items(
        wi(
          "12930",
          "حزمة اختبار الانحدار",
          "Regression test suite",
          "Test Case",
          "فاشل",
          "Failing",
        ),
      ),
    },
  ],
};

/** Deterministic per-iteration variation so filters visibly change all data. */
function variant(snapshot: DeliverySnapshot, seed: number): DeliverySnapshot {
  if (seed === 0) return snapshot;
  const shift = (v: number, amount: number, min = 0, max = 100) =>
    Math.max(min, Math.min(max, Math.round(v + amount)));
  const d = seed * 7;
  return {
    ...snapshot,
    kpis: snapshot.kpis.map((k, i) => ({
      ...k,
      value:
        k.unit === "count"
          ? Math.max(0, k.value + ((seed + i) % 3) - 1)
          : shift(k.value, ((i % 2 === 0 ? 1 : -1) * d) % 17),
      status:
        k.unit === "count"
          ? k.status
          : shift(k.value, ((i % 2 === 0 ? 1 : -1) * d) % 17) >= 80
            ? "healthy"
            : k.status,
    })),
    trajectory: {
      ...snapshot.trajectory,
      points: snapshot.trajectory.points.map((p) => ({
        ...p,
        actual: p.actual === null ? null : shift(p.actual, seed * 2),
        forecast: p.forecast === null ? null : shift(p.forecast, seed * 2),
        forecastLow: p.forecastLow === null ? null : shift(p.forecastLow, seed * 2),
        forecastHigh: p.forecastHigh === null ? null : shift(p.forecastHigh, seed * 2),
      })),
    },
    risks: snapshot.risks.slice(0, Math.max(2, 5 - (seed % 3))),
    funnel: snapshot.funnel.map((f) => ({ ...f, count: Math.max(0, f.count - seed) })),
    teamLoad: snapshot.teamLoad.slice(0, Math.max(3, 6 - (seed % 3))),
    engineering: {
      ...snapshot.engineering,
      activePullRequests: Math.max(0, snapshot.engineering.activePullRequests - seed),
      stalePullRequests: Math.max(0, snapshot.engineering.stalePullRequests - (seed % 4)),
      buildSuccessRate: shift(snapshot.engineering.buildSuccessRate, seed * 3),
      failedTests: Math.max(0, snapshot.engineering.failedTests - seed * 2),
    },
    actions: snapshot.actions.slice(0, Math.max(3, 4 - (seed % 2))),
    lastSyncMinutesAgo: 12 + seed * 9,
    freshness: seed % 4 === 3 ? "partial" : seed % 5 === 2 ? "stale" : "fresh",
  };
}

export function getDeliverySnapshot(filters: WorkspaceFilters): DeliverySnapshot {
  const index = iterations.findIndex((i) => i.id === filters.iterationId);
  const base = { ...baseSnapshot, iterationId: filters.iterationId };
  return variant(base, index < 0 ? 0 : index);
}

export function getIteration(id: string): Iteration | undefined {
  return iterations.find((i) => i.id === id);
}
