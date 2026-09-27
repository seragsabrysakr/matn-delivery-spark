import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";

export type Locale = "ar" | "en";

type Dict = Record<string, { ar: string; en: string }>;

export const dictionary = {
  "brand.name": { ar: "متن", en: "MATN" },
  "brand.tagline": { ar: "ذكاء التسليم", en: "Delivery Intelligence" },
  "brand.workspace": { ar: "مساحة العمل", en: "Workspace" },

  "nav.overview": { ar: "النظرة العامة", en: "Overview" },
  "nav.delivery": { ar: "التسليم", en: "Delivery" },
  "nav.team": { ar: "الفريق", en: "Team" },
  "nav.hierarchy": { ar: "التسلسل الهرمي", en: "Hierarchy" },
  "nav.board": { ar: "بورد السبرنت", en: "Sprint board" },
  "nav.stuck": { ar: "الشغل المتعطل", en: "Stuck work" },
  "nav.backlog": { ar: "الـ Backlog", en: "Backlog" },
  "nav.people": { ar: "الأشخاص", en: "People" },
  "nav.group.sprint": { ar: "السبرنت", en: "Sprint" },
  "nav.group.planning": { ar: "التخطيط", en: "Planning" },
  "bd.tab.board": { ar: "البورد", en: "Board" },
  "bd.tab.stuck": { ar: "المتعطل في كل الفرق", en: "Stuck across teams" },
  "tp.people.title": { ar: "الأشخاص", en: "People" },
  "tp.people.subtitle": {
    ar: "شغل كل شخص في السبرنت، وإيه اللي عمله في Azure آخر يوم عمل، ومين ماحدّثش شغله.",
    en: "Each person's sprint work, what they did in Azure on the last working day, and who has not updated their work.",
  },
  "nav.engineering": { ar: "الهندسة", en: "Engineering" },
  "nav.intelligence": { ar: "الذكاء التحليلي", en: "Intelligence" },

  "shell.collapse": { ar: "طيّ القائمة", en: "Collapse sidebar" },
  "shell.expand": { ar: "توسيع القائمة", en: "Expand sidebar" },
  "shell.organization": { ar: "المؤسسة", en: "Organization" },
  "shell.project": { ar: "المشروع", en: "Project" },
  "shell.team": { ar: "الفريق", en: "Team" },
  "shell.sprint": { ar: "السبرنت", en: "Sprint" },
  "shell.language": { ar: "اللغة", en: "Language" },
  "shell.theme": { ar: "المظهر", en: "Theme" },
  "shell.theme.light": { ar: "فاتح", en: "Light" },
  "shell.theme.dark": { ar: "داكن", en: "Dark" },
  "shell.refresh": { ar: "تحديث البيانات", en: "Refresh data" },
  "shell.lastSync": { ar: "آخر مزامنة", en: "Last sync" },
  "shell.freshness.fresh": { ar: "البيانات محدّثة", en: "Data is current" },
  "shell.freshness.stale": { ar: "البيانات قديمة", en: "Data is stale" },
  "shell.freshness.partial": { ar: "بيانات جزئية", en: "Partial data" },
  "shell.freshness.error": { ar: "تعذّرت المزامنة", en: "Sync failed" },
  "shell.profile": { ar: "الملف الشخصي", en: "Profile" },
  "shell.settings": { ar: "الإعدادات", en: "Settings" },
  "shell.signout": { ar: "تسجيل الخروج", en: "Sign out" },
  "shell.filters": { ar: "عوامل التصفية", en: "Filters" },
  "shell.menu": { ar: "القائمة", en: "Menu" },

  "overview.title": { ar: "النظرة التنفيذية على التسليم", en: "Delivery Command Overview" },
  "overview.subtitle": {
    ar: "قراءة واحدة لحالة السبرنت والمخاطر والإجراءات المطلوبة اليوم.",
    en: "One read on sprint health, risks, and the actions that matter today.",
  },
  "overview.sprintDay": { ar: "اليوم {a} من {b}", en: "Day {a} of {b}" },
  "overview.askCopilot": { ar: "اسأل مساعد التسليم", en: "Ask Delivery Copilot" },
  "overview.copilotSoon": {
    ar: "مساعد التسليم سيتوفّر في المرحلة القادمة بعد ربط Azure DevOps.",
    en: "Delivery Copilot arrives in the next phase, after Azure DevOps is connected.",
  },

  "kpi.confidence": { ar: "ثقة السبرنت", en: "Sprint Confidence" },
  "kpi.confidence.help": {
    ar: "احتمال إغلاق نطاق السبرنت في موعده اعتماداً على السرعة والمخاطر المفتوحة.",
    en: "Likelihood the sprint scope closes on time, based on velocity and open risks.",
  },
  "kpi.confidence.explain": {
    ar: "الثقة منخفضة بسبب تغيّر النطاق والمعوّقات المفتوحة.",
    en: "Confidence is down due to scope change and open blockers.",
  },
  "kpi.scope": { ar: "إنجاز النطاق", en: "Scope Completion" },
  "kpi.scope.help": {
    ar: "نسبة نقاط العمل المكتملة من إجمالي النطاق الحالي.",
    en: "Share of story points completed against the current committed scope.",
  },
  "kpi.scope.explain": {
    ar: "الإنجاز متأخر ١١ نقطة عن المسار المتوقع لليوم السابع.",
    en: "Delivery is 11 points behind the expected line for day 7.",
  },
  "kpi.expected": { ar: "الإنجاز المتوقّع اليوم", en: "Expected Completion" },
  "kpi.expected.help": {
    ar: "النسبة التي كان يفترض بلوغها في هذا اليوم من السبرنت.",
    en: "The completion level the sprint should have reached by today.",
  },
  "kpi.expected.explain": {
    ar: "خط مرجعي محسوب من خطة السبرنت وسعة الفريق.",
    en: "Baseline derived from the sprint plan and team capacity.",
  },
  "kpi.scopeChange": { ar: "تغيّر النطاق", en: "Scope Change" },
  "kpi.scopeChange.help": {
    ar: "حجم العمل المضاف أو المزال بعد بدء السبرنت.",
    en: "Work added or removed after the sprint started.",
  },
  "kpi.scopeChange.explain": {
    ar: "أُضيفت ثلاثة عناصر بعد بدء السبرنت دون إزالة ما يقابلها.",
    en: "Three items were added mid-sprint with nothing traded out.",
  },
  "kpi.blockers": { ar: "المعوّقات الحرجة", en: "Critical Blockers" },
  "kpi.blockers.help": {
    ar: "عناصر عمل متوقفة وتؤثر مباشرة على مسار السبرنت.",
    en: "Stopped work items that directly threaten the sprint outcome.",
  },
  "kpi.blockers.explain": {
    ar: "معوّقان منهما مفتوحان لأكثر من أربعة أيام.",
    en: "Two of them have been open for more than four days.",
  },
  "kpi.release": { ar: "جاهزية الإصدار", en: "Release Readiness" },
  "kpi.release.help": {
    ar: "مؤشر مركّب من الاختبارات والنشر والتوثيق وقبول الأعمال.",
    en: "Composite of testing, deployment, documentation, and business sign-off.",
  },
  "kpi.release.explain": {
    ar: "الاختبار التنظيمي والتوثيق ما زالا غير مكتملين.",
    en: "Regression testing and release notes are still incomplete.",
  },
  "kpi.vsPrevious": { ar: "مقارنة بالسبرنت السابق", en: "vs previous sprint" },
  "kpi.target": { ar: "المستهدف", en: "Target" },
  "kpi.openDetails": { ar: "عرض التفاصيل", en: "View details" },
  "kpi.whatChanged": { ar: "ما الذي تغيّر", en: "What changed" },
  "kpi.howCalculated": { ar: "طريقة الاحتساب", en: "How it is calculated" },
  "kpi.relatedItems": { ar: "عناصر العمل المرتبطة", en: "Related work items" },
  "kpi.trend": { ar: "اتجاه آخر خمسة سبرنتات", en: "Last five sprints" },

  "status.healthy": { ar: "سليم", en: "Healthy" },
  "status.atRisk": { ar: "معرّض للخطر", en: "At risk" },
  "status.critical": { ar: "حرج", en: "Critical" },
  "status.neutral": { ar: "محايد", en: "Neutral" },
  "status.onTrack": { ar: "على المسار", en: "On track" },
  "status.watch": { ar: "مراقبة", en: "Watch" },

  "trajectory.title": { ar: "مسار السبرنت", en: "Sprint Trajectory" },
  "trajectory.subtitle": {
    ar: "الإنجاز الفعلي مقابل المتوقع مع نطاق ثقة للتنبؤ.",
    en: "Actual against expected progress with a forecast confidence range.",
  },
  "trajectory.actual": { ar: "الفعلي", en: "Actual" },
  "trajectory.expected": { ar: "المتوقع", en: "Expected" },
  "trajectory.forecast": { ar: "التنبؤ", en: "Forecast" },
  "trajectory.range": { ar: "نطاق الثقة", en: "Confidence range" },
  "trajectory.start": { ar: "بداية السبرنت", en: "Sprint start" },
  "trajectory.end": { ar: "نهاية السبرنت", en: "Sprint end" },
  "trajectory.forecastLabel": { ar: "الإغلاق المتوقع", en: "Forecast close" },
  "trajectory.day": { ar: "اليوم", en: "Day" },

  "risks.title": { ar: "أهم المخاطر", en: "Critical Risks" },
  "risks.subtitle": {
    ar: "مرتّبة حسب الأثر على تاريخ التسليم.",
    en: "Ordered by impact on the delivery date.",
  },
  "risks.owner": { ar: "المسؤول", en: "Owner" },
  "risks.age": { ar: "العمر", en: "Age" },
  "risks.days": { ar: "{a} يوم", en: "{a} days" },
  "risks.items": { ar: "عناصر متأثرة", en: "Affected items" },
  "risks.why": { ar: "سبب الخطر", en: "Why this is a risk" },
  "risks.action": { ar: "الإجراء الموصى به", en: "Recommended action" },
  "risks.openAdo": { ar: "فتح في Azure DevOps", en: "Open in Azure DevOps" },
  "risks.adoDisabled": {
    ar: "سيتاح بعد ربط Azure DevOps",
    en: "Available after Azure DevOps is connected",
  },
  "risks.viewAll": { ar: "عرض كل المخاطر", en: "View all risks" },
  "risks.adoSoon": {
    ar: "الربط مع Azure DevOps يفعّل هذا الرابط لاحقاً.",
    en: "This link activates once Azure DevOps is connected.",
  },

  "funnel.title": { ar: "مسار التسليم", en: "Delivery Funnel" },
  "funnel.subtitle": {
    ar: "توزيع عناصر العمل على مراحل التنفيذ.",
    en: "Work item distribution across execution stages.",
  },
  "funnel.backlog": { ar: "قائمة الأعمال", en: "Backlog" },
  "funnel.ready": { ar: "جاهز", en: "Ready" },
  "funnel.development": { ar: "التطوير", en: "Development" },
  "funnel.review": { ar: "المراجعة", en: "Review" },
  "funnel.testing": { ar: "الاختبار", en: "Testing" },
  "funnel.done": { ar: "مكتمل", en: "Done" },
  "funnel.items": { ar: "عنصر", en: "items" },
  "funnel.aging": { ar: "متوسط المكوث", en: "Avg. time in stage" },
  "funnel.wipLimit": { ar: "حد العمل الجاري", en: "WIP limit" },
  "funnel.stuck": { ar: "عالق", en: "Stuck" },

  "team.title": { ar: "حِمل الفريق", en: "Team Load" },
  "team.subtitle": {
    ar: "توزيع العمل مقابل السعة المتاحة، دون ترتيب للأفراد.",
    en: "Work distribution against available capacity, with no individual ranking.",
  },
  "team.member": { ar: "عضو الفريق", en: "Team member" },
  "team.capacity": { ar: "السعة", en: "Capacity" },
  "team.assigned": { ar: "المُسند", en: "Assigned" },
  "team.active": { ar: "قيد العمل", en: "Active" },
  "team.blocked": { ar: "متوقف", en: "Blocked" },
  "team.utilization": { ar: "مؤشر الاستخدام", en: "Utilization" },
  "team.role": { ar: "الدور", en: "Role" },
  "team.signal.over": { ar: "فوق السعة", en: "Over capacity" },
  "team.signal.balanced": { ar: "متوازن", en: "Balanced" },
  "team.signal.under": { ar: "دون السعة", en: "Under capacity" },
  "team.hours": { ar: "ساعة", en: "h" },

  "eng.title": { ar: "الصحة الهندسية", en: "Engineering Health" },
  "eng.subtitle": {
    ar: "إشارات المراجعة والبناء والنشر.",
    en: "Review, build, and deployment signals.",
  },
  "eng.activePrs": { ar: "طلبات الدمج النشطة", en: "Active pull requests" },
  "eng.stalePrs": { ar: "طلبات دمج راكدة", en: "Stale pull requests" },
  "eng.reviewTime": { ar: "وسيط زمن المراجعة", en: "Median review time" },
  "eng.buildRate": { ar: "نجاح عمليات البناء", en: "Build success rate" },
  "eng.failedTests": { ar: "اختبارات فاشلة", en: "Failed tests" },
  "eng.deployment": { ar: "حالة النشر", en: "Deployment status" },
  "eng.deploy.blocked": { ar: "النشر متوقف", en: "Deployment blocked" },
  "eng.deploy.note": {
    ar: "آخر نشر ناجح إلى بيئة الاختبار قبل ١٩ ساعة.",
    en: "Last successful staging deploy 19 hours ago.",
  },
  "eng.deploy.unknown": { ar: "حالة النشر غير معروفة", en: "Deployment status unknown" },
  "eng.deploy.notSynced": {
    ar: "لم تتم مزامنة بيانات النشر بعد.",
    en: "Deployment data has not been synchronized yet.",
  },
  "real.mode.badge": { ar: "بيانات حقيقية", en: "Live data" },
  "real.mode.mock": { ar: "بيانات تجريبية", en: "Sample data" },
  "real.sync.action": { ar: "مزامنة السبرنت الحالي", en: "Sync current sprint" },
  "real.sync.running": { ar: "جارٍ المزامنة…", en: "Syncing…" },
  "real.unavailable.title": { ar: "غير متاح", en: "Not available" },
  "real.unavailable.engineering": {
    ar: "لم تتم مزامنة بيانات طلبات الدمج والبناء بعد، لذلك لا تُعرض الصحة الهندسية.",
    en: "Pull request and build data are not synchronized yet, so engineering health is not shown.",
  },
  "real.unavailable.noWorkItems": {
    ar: "لا توجد عناصر عمل مزامنة لهذا السبرنت. شغّل المزامنة لعرض المؤشرات.",
    en: "No synchronized work items for this sprint. Run a sync to populate the indicators.",
  },
  "real.unavailable.noSprintDates": {
    ar: "لا توجد تواريخ للسبرنت، لذلك لا يمكن حساب التقدم المتوقع.",
    en: "This sprint has no dates, so expected progress cannot be computed.",
  },
  "real.state.notSynced": { ar: "لم تتم المزامنة بعد", en: "Not synchronized" },
  "real.state.syncing": { ar: "جارٍ المزامنة…", en: "Syncing…" },
  "real.state.current": { ar: "بيانات محدّثة", en: "Data current" },
  "real.state.partial": { ar: "مزامنة جزئية", en: "Partially synchronized" },
  "real.state.stale": { ar: "بيانات قديمة", en: "Data stale" },
  "real.state.failed": { ar: "فشلت المزامنة", en: "Sync failed" },
  "real.sprintDates.unavailable": {
    ar: "تواريخ السبرنت غير متاحة",
    en: "Sprint dates unavailable",
  },
  "real.sync.reportTitle": { ar: "نتيجة مزامنة عناصر العمل", en: "Work item sync result" },
  "real.sync.report": {
    ar: "تم اكتشاف {a} عنصرًا · قراءة {b} · إضافة {c} · تحديث {d} · دون تغيير {e} · خارج السبرنت {f} · فشل {g}",
    en: "{a} discovered · {b} read · {c} inserted · {d} updated · {e} unchanged · {f} detached · {g} failed",
  },
  "real.sync.capacity": {
    ar: "الطاقة (Capacity): {a} من {b} عضوًا لهم ساعات مسجلة في Azure · أيام إجازة الفريق {c}",
    en: "Capacity: {a} of {b} members have hours set in Azure · {c} team days-off ranges",
  },
  "real.sync.capacityUnavailable": {
    ar: "الطاقة (Capacity): غير متاحة من Azure لهذا السبرنت",
    en: "Capacity: not available from Azure for this sprint",
  },
  "real.sync.truncated": {
    ar: "تم بلوغ الحد الأقصى لعدد العناصر، لذلك النتيجة غير مكتملة.",
    en: "The per-sprint item ceiling was reached, so this result is incomplete.",
  },
  "real.backlog.reportTitle": { ar: "نتيجة مزامنة الـ Backlog", en: "Backlog sync result" },
  "real.backlog.modeFull": { ar: "مزامنة كاملة", en: "Full pass" },
  "real.backlog.modeIncremental": { ar: "مزامنة التغييرات فقط", en: "Changes only" },
  "real.backlog.report": {
    ar: "تم اكتشاف {a} عنصرًا · إضافة {b} · تحديث {c} · دون تغيير {d} · إعادة فحص {e} · غير متاح في Azure {f} · فشل {g}",
    en: "{a} discovered · {b} inserted · {c} updated · {d} unchanged · {e} re-checked · {f} no longer in Azure · {g} failed",
  },
  "real.backlog.truncated": {
    ar: "تم بلوغ الحد الأقصى لعدد عناصر الـ Backlog، لذلك النتيجة غير مكتملة.",
    en: "The backlog item ceiling was reached, so this result is incomplete.",
  },
  "real.backlog.failed": { ar: "فشلت مزامنة الـ Backlog", en: "Backlog sync failed" },
  "real.history.reportTitle": {
    ar: "نتيجة مزامنة سجل التغييرات",
    en: "Change history sync result",
  },
  "real.history.report": {
    ar: "تم تحديث سجل {a} عنصرًا · {b} مراجعة جديدة · {c} انتقال حالة · {d} تغيير نطاق · فشل {e}",
    en: "History updated for {a} items · {b} new revisions · {c} state transitions · {d} scope changes · {e} failed",
  },
  "real.history.remaining": {
    ar: "باقي {a} عنصرًا سيُستكمل سجلها في المزامنة القادمة",
    en: "{a} items left; their history continues on the next sync",
  },
  "real.history.failed": { ar: "فشلت مزامنة سجل التغييرات", en: "Change history sync failed" },
  "overview.copilot.comingSoon": { ar: "قريبًا", en: "Coming soon" },

  "common.na": { ar: "غير متاح", en: "N/A" },
  "kpi.unavailable": {
    ar: "لا يوجد مصدر بيانات موثوق لهذا المؤشر بعد.",
    en: "No trustworthy source for this indicator yet.",
  },
  "kpi.coverage": { ar: "تغطية البيانات {a}%", en: "Data coverage {a}%" },
  "kpi.coverageLow": {
    ar: "تغطية البيانات أقل من الحد الأدنى، لذلك لا تُعرض درجة الثقة.",
    en: "Data coverage is below the minimum, so the confidence score is withheld.",
  },
  "team.signal.unknown": { ar: "السعة غير معروفة", en: "Capacity unknown" },
  "team.capacity.unavailable": {
    ar: "لم تُضبط سعة الفريق في Azure DevOps لهذا السبرنت.",
    en: "Team capacity is not configured in Azure DevOps for this sprint.",
  },
  "team.assigned.items": { ar: "{a} عنصر مُسند", en: "{a} assigned items" },
  "risks.unassigned": { ar: "بدون مسؤول", en: "Unassigned" },
  "real.reason.no_work_items": {
    ar: "لا توجد عناصر عمل مزامنة لهذا السبرنت.",
    en: "No synchronized work items for this sprint.",
  },
  "real.reason.no_sprint_dates": {
    ar: "لا توجد تواريخ للسبرنت، لذلك لا يمكن حساب هذا المؤشر.",
    en: "This sprint has no dates, so this indicator cannot be computed.",
  },
  "real.reason.no_baseline_snapshot": {
    ar: "لا توجد لقطة أساس سابقة للمقارنة.",
    en: "No earlier baseline snapshot exists for comparison.",
  },
  "real.reason.baseline_same_day": {
    ar: "خط الأساس أُنشئ اليوم، لذلك لا يوجد تغيّر نطاق قابل للقياس بعد.",
    en: "The baseline was captured today, so no scope change is measurable yet.",
  },
  "real.reason.no_estimates": {
    ar: "لا توجد تقديرات كافية لحساب هذا المؤشر.",
    en: "There are not enough estimates to compute this indicator.",
  },
  "real.reason.not_synchronized": {
    ar: "لم تتم مزامنة مصدر هذا المؤشر بعد.",
    en: "The source for this indicator is not synchronized yet.",
  },
  "real.reason.insufficient_coverage": {
    ar: "تغطية البيانات أقل من الحد الأدنى المطلوب لحساب موثوق.",
    en: "Data coverage is below the minimum required for a trustworthy score.",
  },

  // Real-mode KPI explanations. Every sentence is generated from the same
  // calculation result that produced the displayed value: no static comparisons.
  "real.explain.confidence.deliveryTrajectory": {
    ar: "تغطية المكوّنات {a}% عبر {b} مكوّنات. أكبر أثر سلبي: مسار التسليم بدرجة {c}%.",
    en: "Component coverage {a}% across {b} components. Largest drag: delivery trajectory, scored {c}%.",
  },
  "real.explain.confidence.blockerPressure": {
    ar: "تغطية المكوّنات {a}% عبر {b} مكوّنات. أكبر أثر سلبي: ضغط المعوّقات بدرجة {c}%.",
    en: "Component coverage {a}% across {b} components. Largest drag: blocker pressure, scored {c}%.",
  },
  "real.explain.confidence.scopeStability": {
    ar: "تغطية المكوّنات {a}% عبر {b} مكوّنات. أكبر أثر سلبي: استقرار النطاق بدرجة {c}%.",
    en: "Component coverage {a}% across {b} components. Largest drag: scope stability, scored {c}%.",
  },
  "real.explain.confidence.dataCompleteness": {
    ar: "تغطية المكوّنات {a}% عبر {b} مكوّنات. أكبر أثر سلبي: اكتمال البيانات بدرجة {c}%.",
    en: "Component coverage {a}% across {b} components. Largest drag: data completeness, scored {c}%.",
  },
  "real.explain.scope.estimate": {
    ar: "اليوم {a} من {b}: اكتملت {c} من {d} نقطة تقدير ضمن النطاق. مهام الفانل لا تُحتسب ضمن إنجاز النطاق.",
    en: "Day {a} of {b}: {c} of {d} estimate points completed in scope. Completed Tasks in the funnel do not count toward scope completion.",
  },
  "real.explain.scope.count": {
    ar: "اليوم {a} من {b}: اكتمل {c} من {d} عنصر ضمن النطاق. مهام الفانل لا تُحتسب ضمن إنجاز النطاق.",
    en: "Day {a} of {b}: {c} of {d} scoped items completed. Completed Tasks in the funnel do not count toward scope completion.",
  },
  "real.explain.expected.final": {
    ar: "اليوم {a} من {b}: بلغ السبرنت يوم العمل الأخير، لذلك الخط المتوقّع 100%.",
    en: "Day {a} of {b}: the sprint has reached its final working day, so the expected line is 100%.",
  },
  "real.explain.expected.inProgress": {
    ar: "انقضى {a} من {b} يوم عمل؛ محسوب من تقويم السبرنت فقط.",
    en: "{a} of {b} working days elapsed; derived from the sprint calendar only.",
  },
  "real.explain.blockers.none": {
    ar: "لا توجد عناصر نشطة موسومة صراحةً كمحجوبة.",
    en: "No active work items are explicitly mapped as blocked.",
  },
  "real.explain.blockers.some": {
    ar: "{a} عنصر نشط محجوب {b} يوم أو أكثر؛ أقدمها محجوب منذ {c} يوم.",
    en: "{a} active items blocked for {b}+ days; the oldest has been blocked {c} days.",
  },
  "real.explain.release.notSynced": {
    ar: "لم تُزامن عمليات البناء والاختبارات والنشر، لذلك تعذّر حساب جاهزية الإصدار.",
    en: "Builds, tests and deployments are not synchronized, so release readiness cannot be computed.",
  },
  "real.facts.coverage": { ar: "تغطية المكوّنات {a}%", en: "Component coverage {a}%" },
  "real.facts.included": { ar: "مكوّنات مُدرجة: {a}", en: "Included components: {a}" },
  "real.facts.missing": { ar: "مكوّنات ناقصة: {a}", en: "Missing components: {a}" },
  "real.facts.none": { ar: "لا شيء", en: "None" },
  "real.component.deliveryTrajectory": { ar: "مسار التسليم", en: "Delivery trajectory" },
  "real.component.blockerPressure": { ar: "ضغط المعوّقات", en: "Blocker pressure" },
  "real.component.scopeStability": { ar: "استقرار النطاق", en: "Scope stability" },
  "real.component.dataCompleteness": { ar: "اكتمال البيانات", en: "Data completeness" },

  "eng.hours": { ar: "ساعة", en: "h" },

  "actions.title": { ar: "الإجراءات الموصى بها", en: "Recommended Actions" },
  "actions.subtitle": {
    ar: "مرتّبة حسب الأثر المتوقع على السبرنت.",
    en: "Ranked by expected impact on the sprint.",
  },
  "actions.impact": { ar: "الأثر المتوقع", en: "Expected impact" },
  "actions.reason": { ar: "السبب", en: "Reason" },
  "actions.items": { ar: "عناصر مرتبطة", en: "Related items" },
  "actions.accept": { ar: "إضافة إلى خطة اليوم", en: "Add to today’s plan" },
  "actions.dismiss": { ar: "إخفاء الاقتراح", en: "Hide suggestion" },
  "actions.inspect": { ar: "فحص التفاصيل", en: "Inspect details" },
  "actions.accepted": { ar: "أُضيف الاقتراح إلى خطة اليوم", en: "Added to today’s plan" },
  "actions.dismissed": { ar: "أُخفي الاقتراح", en: "Suggestion hidden" },
  "actions.notSynced": {
    ar: "التغيير محفوظ محلياً فقط ولم يُزامن مع Azure DevOps بعد.",
    en: "Saved locally only; not yet synchronized with Azure DevOps.",
  },
  "actions.empty": { ar: "لا توجد إجراءات معلّقة الآن.", en: "No pending actions right now." },
  "actions.priority": { ar: "الأولوية {a}", en: "Priority {a}" },

  "state.loading": { ar: "جارٍ تحميل البيانات", en: "Loading data" },
  "state.empty.title": { ar: "لا توجد بيانات لعرضها", en: "Nothing to show yet" },
  "state.empty.body": {
    ar: "غيّر عوامل التصفية أو انتظر المزامنة القادمة.",
    en: "Adjust the filters or wait for the next synchronization.",
  },
  "state.error.title": { ar: "تعذّر تحميل هذا القسم", en: "This section failed to load" },
  "state.error.body": {
    ar: "حدث خطأ أثناء قراءة بيانات التسليم. حاول التحديث.",
    en: "Something went wrong while reading delivery data. Try refreshing.",
  },
  "state.retry": { ar: "إعادة المحاولة", en: "Retry" },
  "state.stale.title": { ar: "البيانات المعروضة قديمة", en: "You are viewing stale data" },
  "state.stale.body": {
    ar: "آخر مزامنة ناجحة قبل {a}. القيم قد لا تعكس الوضع الحالي.",
    en: "Last successful sync was {a} ago. Values may not reflect the current state.",
  },
  "state.partial.title": { ar: "بيانات جزئية", en: "Partial data" },
  "state.partial.body": {
    ar: "بعض مصادر الاختبار لم تُزامن بعد، لذلك جاهزية الإصدار تقديرية.",
    en: "Some test sources have not synced, so release readiness is an estimate.",
  },
  "state.mock": { ar: "بيانات تجريبية", en: "Mock data" },

  "placeholder.badge": { ar: "قيد الإعداد", en: "In progress" },
  "placeholder.body": {
    ar: "هذه المساحة جاهزة هيكلياً وستُملأ بعد اكتمال ربط Azure DevOps.",
    en: "The structure is in place and will be populated once Azure DevOps is connected.",
  },
  "placeholder.planned": { ar: "المخطط لهذه الصفحة", en: "Planned for this page" },

  "delivery.title": { ar: "التسليم", en: "Delivery" },
  "delivery.subtitle": {
    ar: "تتبّع النطاق والتدفق والالتزامات عبر السبرنتات.",
    en: "Track scope, flow, and commitments across sprints.",
  },
  "delivery.p1": { ar: "تحليل تدفّق العمل وزمن الدورة", en: "Flow and cycle-time analysis" },
  "delivery.p2": { ar: "سجل تغيّرات النطاق", en: "Scope change ledger" },
  "delivery.p3": { ar: "التزامات الإصدار والمعالم", en: "Release and milestone commitments" },
  "sh.title": { ar: "تاريخ السبرنتات", en: "Sprint history" },
  "sh.subtitle": {
    ar: "كل سبرنت للفريق كما كان فعلاً: الملتزم به عند البداية، ما أُضيف وما أُزيل، ما سُلِّم وما رُحِّل — من سجل تغييرات Azure DevOps.",
    en: "Every sprint of the team as it actually happened: committed at the start, added and removed, delivered and carried over — from Azure DevOps change history.",
  },
  "sh.col.sprint": { ar: "السبرنت", en: "Sprint" },
  "sh.col.committed": { ar: "الملتزم به عند البداية", en: "Committed at start" },
  "sh.col.added": { ar: "أُضيف أثناء السبرنت", en: "Added during" },
  "sh.col.removed": { ar: "أُزيل أثناء السبرنت", en: "Removed during" },
  "sh.col.delivered": { ar: "تم تسليمه", en: "Delivered" },
  "sh.col.carried": { ar: "مُرحَّل", en: "Carried over" },
  "sh.col.late": { ar: "سُلِّم بعد نهاية السبرنت", en: "Delivered after the end" },
  "sh.lateBy": { ar: "متوسط التأخير {a} يوم", en: "median {a} days late" },
  "sh.col.sayDo": { ar: "الالتزام مقابل التنفيذ", en: "Say / Do" },
  "sh.col.velocity": { ar: "السرعة", en: "Velocity" },
  "sh.points": { ar: "نقطة", en: "pts" },
  "sh.items": { ar: "عنصر", en: "items" },
  "sh.basis.points": { ar: "بالنقاط", en: "by points" },
  "sh.basis.count": { ar: "بعدد العناصر", en: "by item count" },
  "sh.status.completed": { ar: "منتهٍ", en: "Completed" },
  "sh.status.current": { ar: "جارٍ", en: "Current" },
  "sh.status.future": { ar: "قادم", en: "Upcoming" },
  "sh.gaps": {
    ar: "{a} عنصر سجله غير مكتمل بعد",
    en: "{a} items with incomplete history",
  },
  "sh.avgVelocity": {
    ar: "متوسط السرعة {a} نقطة (آخر {b} سبرنت منتهية)",
    en: "Average velocity {a} pts (last {b} completed sprints)",
  },
  "sh.avgVelocity.none": {
    ar: "متوسط السرعة يحتاج سبرنتين منتهيتين على الأقل",
    en: "Average velocity needs at least two completed sprints",
  },
  "sh.empty": {
    ar: "لا توجد سبرنتات بتواريخ لهذا الفريق بعد.",
    en: "No dated sprints for this team yet.",
  },
  "sh.coverage.title": { ar: "السجل لم يكتمل بعد", en: "History not complete yet" },
  "sh.coverage.body": {
    ar: "{a} من {b} عنصر لم يكتمل سجل تغييراته بعد؛ الأرقام قد تتغير بعد المزامنة القادمة.",
    en: "{a} of {b} items do not have a complete change history yet; numbers may change after the next sync.",
  },
  "dl.title": { ar: "جدول التسليم", en: "Delivery schedule" },
  "dl.subtitle": {
    ar: "كل deliverable في المشروع: التقدّم الفعلي من Azure، التاريخ المتوقَّع من معدل تسليمه الحقيقي، والتاريخ الملتزم به.",
    en: "Every deliverable in the project: real progress from Azure, a forecast from its own delivery rate, and the committed date.",
  },
  "dl.refresh": { ar: "تحديث من Azure", en: "Refresh from Azure" },
  "dl.refreshing": { ar: "جارٍ التحديث…", en: "Refreshing…" },
  "dl.lastRefresh": { ar: "آخر تحديث: {a}", en: "Last refresh: {a}" },
  "dl.neverRefreshed": { ar: "لم يتم التحديث بعد", en: "Not refreshed yet" },
  "dl.refreshFailed": {
    ar: "تعذّر تحديث الـ deliverables.",
    en: "Could not refresh deliverables.",
  },
  "dl.mapping.missing.title": {
    ar: "لم يتم تحديد طريقة التعرّف على الـ deliverables",
    en: "Delivery mapping not configured",
  },
  "dl.mapping.missing.body": {
    ar: "اختر كيف تُمثَّل الـ deliverables في هذا المشروع على Azure DevOps: نوع عنصر عمل، أو tag، أو area path، أو saved query.",
    en: "Choose how deliverables are represented in this project in Azure DevOps: a work item type, a tag, an area path or a saved query.",
  },
  "dl.mapping.missing.viewer": {
    ar: "يستطيع مدير التسليم أو المسؤول تحديدها.",
    en: "A delivery manager or admin can set it.",
  },
  "dl.mapping.current": { ar: "الـ deliverables = {a}: {b}", en: "Deliverables = {a}: {b}" },
  "dl.mapping.edit": { ar: "تعديل", en: "Edit" },
  "dl.mapping.save": { ar: "حفظ", en: "Save" },
  "dl.mapping.cancel": { ar: "إلغاء", en: "Cancel" },
  "dl.mapping.mode": { ar: "طريقة التعرّف", en: "Mapping" },
  "dl.mapping.value": { ar: "القيمة", en: "Value" },
  "dl.mode.work_item_type": { ar: "نوع عنصر العمل", en: "Work item type" },
  "dl.mode.tag": { ar: "Tag", en: "Tag" },
  "dl.mode.area_path": { ar: "Area path", en: "Area path" },
  "dl.mode.saved_query": { ar: "Saved query (رابط أو ID)", en: "Saved query (link or ID)" },
  "dl.empty": {
    ar: "لا توجد deliverables بعد. اضغط «تحديث من Azure» بعد تحديد الطريقة.",
    en: "No deliverables yet. Press “Refresh from Azure” after setting the mapping.",
  },
  "dl.col.deliverable": { ar: "الـ Deliverable", en: "Deliverable" },
  "dl.col.progress": { ar: "التقدّم", en: "Progress" },
  "dl.col.sprints": { ar: "السبرنتات", en: "Sprints" },
  "dl.col.forecast": { ar: "المتوقَّع", en: "Forecast" },
  "dl.col.committed": { ar: "الملتزم به", en: "Committed" },
  "dl.col.status": { ar: "الحالة", en: "Status" },
  "dl.col.client": { ar: "للعميل", en: "Client" },
  "dl.progress.items": { ar: "{a} من {b} عنصر", en: "{a} of {b} items" },
  "dl.progress.none": { ar: "لا يوجد نطاق", en: "No scope" },
  "dl.forecast.range": { ar: "بين {a} و {b}", en: "{a} – {b}" },
  "dl.forecast.openEnded": { ar: "من {a} (بلا حد أقصى)", en: "from {a} (no upper bound)" },
  "dl.reason.insufficient_history": {
    ar: "تاريخ غير كافٍ (أقل من سبرنتين منتهيين)",
    en: "Insufficient history (fewer than 2 finished sprints)",
  },
  "dl.reason.no_recent_progress": {
    ar: "لم يُسلَّم شيء منه في آخر السبرنتات",
    en: "Nothing under it was completed in recent sprints",
  },
  "dl.reason.unestimated": { ar: "المتبقي غير مُقدَّر", en: "Remaining work is unestimated" },
  "dl.reason.no_scope": { ar: "لا يوجد نطاق تحته", en: "No scope under it" },
  "dl.baseline": { ar: "الأساس: {a}", en: "Baseline: {a}" },
  "dl.delivered.on": { ar: "سُلِّم {a}", en: "Delivered {a}" },
  "dl.status.delivered": { ar: "سُلِّم", en: "Delivered" },
  "dl.status.no_committed_date": { ar: "بلا تاريخ ملتزم", en: "No committed date" },
  "dl.status.late": { ar: "متأخر", en: "Late" },
  "dl.status.at_risk": { ar: "معرّض للخطر", en: "At risk" },
  "dl.status.on_track": { ar: "على المسار", en: "On track" },
  "dl.daysLate": { ar: "متأخر {a} يوم", en: "{a} days late" },
  "dl.statusReason.forecast_after_commitment": {
    ar: "المتوقَّع بعد التاريخ الملتزم به",
    en: "Forecast is after the committed date",
  },
  "dl.statusReason.forecast_unavailable": { ar: "لا يوجد توقّع", en: "No forecast" },
  "dl.confirm": { ar: "تأكيد التاريخ", en: "Confirm date" },
  "dl.change": { ar: "تغيير التاريخ", en: "Change date" },
  "dl.dialog.title": { ar: "التاريخ الملتزم به — {a}", en: "Committed date — {a}" },
  "dl.dialog.date": { ar: "التاريخ", en: "Date" },
  "dl.dialog.reason": { ar: "السبب (إلزامي)", en: "Reason (required)" },
  "dl.dialog.hint": {
    ar: "أول تأكيد يثبّت التاريخ الأساسي (Baseline) ولا يتغيّر بعده. كل تغيير يُسجَّل مع سببه.",
    en: "The first confirmation fixes the baseline, which never changes afterwards. Every change is logged with its reason.",
  },
  "dl.dialog.save": { ar: "حفظ", en: "Save" },
  "dl.dialog.failed": { ar: "تعذّر الحفظ.", en: "Could not save." },
  "dl.log.title": { ar: "سجل تغييرات التواريخ", en: "Date change log" },
  "dl.log.empty": { ar: "لا توجد تغييرات بعد.", en: "No changes yet." },
  "dl.log.entry": { ar: "{a} → {b}", en: "{a} → {b}" },
  "dl.log.first": { ar: "أول تأكيد", en: "First confirmation" },
  "dl.export.button": { ar: "تصدير", en: "Export" },
  "dl.export.excelInternal": { ar: "Excel — نسخة داخلية", en: "Excel — internal" },
  "dl.export.excelClient": { ar: "Excel — نسخة العميل", en: "Excel — client" },
  "dl.export.pdfInternal": { ar: "PDF — نسخة داخلية", en: "PDF — internal" },
  "dl.export.pdfClient": { ar: "PDF — نسخة العميل", en: "PDF — client" },
  "dl.export.internalVersion": { ar: "نسخة داخلية", en: "Internal version" },
  "dl.export.clientVersion": { ar: "نسخة العميل", en: "Client version" },
  "dl.export.generated": { ar: "أُنشئ في {a}", en: "Generated {a}" },
  "dl.export.empty": {
    ar: "لا توجد deliverables في هذه النسخة.",
    en: "No deliverables in this version.",
  },
  "dl.export.clientEmpty": {
    ar: "لا توجد deliverables مفعّل عليها «للعميل» بعد.",
    en: "No deliverables are marked for the client yet.",
  },
  "dl.export.popupBlocked": {
    ar: "المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.",
    en: "The browser blocked the print window. Allow pop-ups for this site.",
  },
  "dl.export.type": { ar: "النوع", en: "Type" },
  "dl.export.owner": { ar: "المسؤول", en: "Owner" },
  "dl.export.statusReason": { ar: "سبب الحالة", en: "Status reason" },
  "dl.export.progress": { ar: "التقدّم %", en: "Progress %" },
  "dl.export.basis": { ar: "الأساس", en: "Basis" },
  "dl.export.completed": { ar: "مكتمل", en: "Completed" },
  "dl.export.scope": { ar: "النطاق", en: "Scope" },
  "dl.export.forecastLow": { ar: "أقرب تاريخ", en: "Forecast (best)" },
  "dl.export.forecastHigh": { ar: "أبعد تاريخ", en: "Forecast (worst)" },
  "dl.export.forecastNote": { ar: "ملاحظة التوقّع", en: "Forecast note" },
  "dl.export.baseline": { ar: "الأساس (Baseline)", en: "Baseline" },
  "dl.export.delivered": { ar: "تاريخ التسليم", en: "Delivered on" },
  "dl.export.daysLate": { ar: "أيام التأخير", en: "Days late" },
  "dl.export.notes": { ar: "ملاحظات", en: "Notes" },
  "dl.export.yes": { ar: "نعم", en: "Yes" },
  "dl.export.no": { ar: "لا", en: "No" },
  "dl.export.from": { ar: "من", en: "From" },
  "dl.export.to": { ar: "إلى", en: "To" },
  "dl.export.reason": { ar: "السبب", en: "Reason" },
  "dl.export.by": { ar: "بواسطة", en: "By" },
  "dl.export.at": { ar: "في", en: "At" },
  "hy.title": { ar: "التسلسل الهرمي", en: "Work item hierarchy" },
  "hy.subtitle": {
    ar: "كل عناصر المشروع من Azure كشجرة: كل أب وأبناؤه، وعند كل مستوى ملخص لما تحته.",
    en: "Every work item of the project from Azure as a tree: each parent and its children, with a roll-up at every level.",
  },
  "hy.byType": { ar: "حسب النوع", en: "By type" },
  "hy.type.total": { ar: "{a} عنصر · {b} مكتمل", en: "{a} items · {b} done" },
  "hy.type.scope": { ar: "{a} نطاق", en: "{a} scope" },
  "hy.level.portfolio": { ar: "Portfolio", en: "Portfolio" },
  "hy.level.requirement": { ar: "Requirement", en: "Requirement" },
  "hy.level.task": { ar: "Task", en: "Task" },
  "hy.level.bug": { ar: "Bug", en: "Bug" },
  "hy.level.none": { ar: "خارج الـ backlog", en: "Not on a backlog" },
  "hy.quality.title": { ar: "جودة البيانات في الشجرة", en: "Tree data quality" },
  "hy.quality.requirementsWithoutParent": {
    ar: "{a} story بدون Feature/Epic أب",
    en: "{a} stories without a parent Feature/Epic",
  },
  "hy.quality.tasksWithoutParent": {
    ar: "{a} task بدون story أب",
    en: "{a} tasks without a parent story",
  },
  "hy.quality.bugsWithoutParent": { ar: "{a} bug بدون أب", en: "{a} bugs without a parent" },
  "hy.quality.parentMissing": {
    ar: "{a} عنصر أبوه غير متزامن",
    en: "{a} items whose parent is not synchronized",
  },
  "hy.quality.unestimatedRequirements": {
    ar: "{a} story بدون تقدير (Story Points)",
    en: "{a} stories without an estimate",
  },
  "hy.quality.tasksWithoutHours": {
    ar: "{a} task مفتوحة بدون ساعات متبقية (Remaining Work)",
    en: "{a} open tasks without remaining hours",
  },
  "hy.quality.ok": { ar: "لا توجد مشاكل في الشجرة.", en: "No issues in the tree." },
  "hy.levelsFallback": {
    ar: "مستويات الـ backlog لم تُقرأ من Azure بعد؛ التصنيف مؤقت حتى أول مزامنة.",
    en: "Backlog levels have not been read from Azure yet; classification is provisional until the next sync.",
  },
  "hy.search": { ar: "بحث بالعنوان أو الرقم أو الشخص…", en: "Search title, ID or person…" },
  "hy.openOnly": { ar: "المفتوح فقط", en: "Open only" },
  "hy.expandAll": { ar: "فتح الكل", en: "Expand all" },
  "hy.collapseAll": { ar: "طي الكل", en: "Collapse all" },
  "hy.allLevels": { ar: "كل المستويات", en: "All levels" },
  "hy.col.item": { ar: "العنصر", en: "Item" },
  "hy.col.state": { ar: "الحالة", en: "State" },
  "hy.col.assignee": { ar: "المسؤول", en: "Assignee" },
  "hy.col.sprint": { ar: "السبرنت", en: "Sprint" },
  "hy.col.progress": { ar: "التقدّم", en: "Progress" },
  "hy.col.points": { ar: "النقاط", en: "Points" },
  "hy.col.tasks": { ar: "المهام", en: "Tasks" },
  "hy.col.bugs": { ar: "الـ Bugs", en: "Bugs" },
  "hy.col.flags": { ar: "تنبيهات", en: "Flags" },
  "hy.scopeOf": { ar: "{a} من {b}", en: "{a} of {b}" },
  "hy.remaining": { ar: "متبقٍ {a}", en: "{a} left" },
  "hy.hours": { ar: "{a} س متبقية", en: "{a} h left" },
  "hy.flag.blocked": { ar: "{a} معطّل", en: "{a} blocked" },
  "hy.flag.blockedSelf": { ar: "معطّل", en: "Blocked" },
  "hy.flag.unassigned": { ar: "{a} بلا مسؤول", en: "{a} unassigned" },
  "hy.flag.parentMissing": { ar: "الأب غير متزامن", en: "Parent not synced" },
  "hy.empty": { ar: "لا توجد عناصر مطابقة.", en: "No matching items." },
  "hy.method": {
    ar: "التقدّم عند أي عنصر = ما اكتمل من عناصر النطاق تحته (بالنقاط إذا كان ٦٠٪ منها مُقدَّرًا، وإلا بالعدد). العنصر الذي تحته عناصر نطاق لا يُحسب مع أبنائه، والمهام لا تُحسب أبدًا — نفس قاعدة كل التحليلات.",
    en: "Progress at any item = completed scope items below it (by points when 60% are estimated, else by count). An item with scope below it is never counted with its children, and tasks never count — the same rule every analysis uses.",
  },
  "bd.title": { ar: "بورد السبرنت", en: "Sprint board" },
  "bd.subtitle": {
    ar: "نفس بورد الفريق على Azure بأعمدته وترتيبه وحدود الـ WIP — ومعاه عمر كل كارت في عموده والمتعطل.",
    en: "The team's own Azure board — its columns, order and WIP limits — with each card's age in its column and what is stuck.",
  },
  "bd.board": { ar: "البورد: {a}", en: "Board: {a}" },
  "bd.totals": {
    ar: "{a} كارت · {b} نقطة · {c} متعطل",
    en: "{a} cards · {b} points · {c} stuck",
  },
  "bd.noBoard": {
    ar: "لم تُقرأ أعمدة بورد الفريق من Azure بعد؛ العناصر معروضة كقائمة.",
    en: "The team's board columns have not been read from Azure yet; items are listed instead.",
  },
  "bd.offBoard": { ar: "عناصر نطاق خارج البورد", en: "Scope items not on the board" },
  "bd.wip": { ar: "{a} / {b}", en: "{a} / {b}" },
  "bd.overLimit": { ar: "تجاوز حد الـ WIP", en: "Over WIP limit" },
  "bd.days": { ar: "{a} يوم عمل في العمود", en: "{a} working days in column" },
  "bd.daysApprox": {
    ar: "≤ {a} يوم عمل (من آخر تغيير حالة)",
    en: "≤ {a} working days (since last state change)",
  },
  "bd.tasks": { ar: "مهام {a}/{b}", en: "Tasks {a}/{b}" },
  "bd.bugs": { ar: "{a} bug مفتوح", en: "{a} open bugs" },
  "bd.unassignedKids": { ar: "{a} بلا مسؤول", en: "{a} unassigned" },
  "bd.empty": { ar: "لا يوجد", en: "Empty" },
  "bd.method": {
    ar: "العمر بأيام عمل الفريق منذ دخول الكارت عموده الحالي. متعطل = Blocked، أو tag «Blocked»، أو أكثر من {a} أيام عمل في عمود قيد التنفيذ.",
    en: "Age in the team's working days since the card entered its current column. Stuck = Blocked, a “Blocked” tag, or more than {a} working days in an in-progress column.",
  },
  "st.title": { ar: "الشغل المتعطل", en: "Stuck work" },
  "st.subtitle": {
    ar: "كل العناصر المتعطلة في السبرنت الحالي لكل فريق، الأقدم أولاً.",
    en: "Every stuck item in each team's current sprint, oldest first.",
  },
  "st.summary": { ar: "{a} عنصر متعطل في {b} سبرنت", en: "{a} stuck items across {b} sprints" },
  "st.none": { ar: "لا يوجد شغل متعطل الآن.", en: "Nothing is stuck right now." },
  "st.search": { ar: "بحث بالعنوان أو الشخص أو الفريق…", en: "Search title, person or team…" },
  "st.col.age": { ar: "العمر", en: "Age" },
  "st.col.item": { ar: "العنصر", en: "Item" },
  "st.col.where": { ar: "المشروع / الفريق / السبرنت", en: "Project / team / sprint" },
  "st.col.column": { ar: "العمود / الحالة", en: "Column / state" },
  "st.col.assignee": { ar: "المسؤول", en: "Assignee" },
  "st.col.why": { ar: "السبب", en: "Why" },
  "st.reason.blocked_field": { ar: "Blocked في Azure", en: "Blocked in Azure" },
  "st.reason.blocked_tag": { ar: "tag «Blocked»", en: "“Blocked” tag" },
  "st.reason.aged_in_column": { ar: "طال في العمود", en: "Too long in column" },
  "nav.alerts": { ar: "التنبيهات", en: "Alerts" },
  "al.title": { ar: "التنبيهات", en: "Alerts" },
  "al.subtitle": {
    ar: "الشغل اللي اتعطل والتسليمات المتأخرة أو المعرّضة للخطر — بتتكشف تلقائياً من Azure كل نص ساعة.",
    en: "Work that got stuck and deliverables that are late or at risk — detected from Azure automatically every half hour.",
  },
  "al.kind.stuck": { ar: "شغل متعطل", en: "Stuck work" },
  "al.kind.deliverable_late": { ar: "تسليم متأخر", en: "Late deliverable" },
  "al.kind.deliverable_at_risk": { ar: "تسليم معرّض للخطر", en: "Deliverable at risk" },
  "al.open": { ar: "مفتوحة الآن", en: "Open now" },
  "al.openSubtitle": {
    ar: "الأقدم أولاً. التنبيه بيتقفل لوحده لما الحالة تتحل في Azure.",
    en: "Oldest first. An alert closes on its own once the situation is resolved in Azure.",
  },
  "al.noneOpen": { ar: "لا توجد تنبيهات مفتوحة.", en: "No open alerts." },
  "al.resolved": { ar: "اتحلّت في آخر 7 أيام ({a})", en: "Resolved in the last 7 days ({a})" },
  "al.since": { ar: "من {a}", en: "Since {a}" },
  "al.resolvedAt": { ar: "اتحلّ {a}", en: "Resolved {a}" },
  "al.daysLate": { ar: "متأخر {a} يوم", en: "{a} days late" },
  "al.dates": { ar: "الملتزم {a} · المتوقع {b}", en: "Committed {a} · forecast {b}" },
  "al.lastCheck": { ar: "آخر فحص", en: "Last check" },
  "al.lastDigest": { ar: "آخر ملخص يومي", en: "Last daily digest" },
  "al.never": { ar: "لم يحدث بعد", en: "Not yet" },
  "al.teams.sent": { ar: "اتبعت", en: "sent" },
  "al.teams.failed": { ar: "فشل", en: "failed" },
  "al.teams.pending": { ar: "جاري", en: "pending" },
  "al.teams.not_configured": { ar: "غير مفعّل", en: "not configured" },
  "al.teamsMissing": {
    ar: "إرسال Teams مش متفعّل: ضيف MATN_TEAMS_WEBHOOK_URL في Lovable secrets.",
    en: "Teams delivery is off: add MATN_TEAMS_WEBHOOK_URL to the Lovable secrets.",
  },
  "al.notAllowed": {
    ar: "التنبيهات متاحة للمديرين وقادة الفرق.",
    en: "Alerts are available to managers and team leads.",
  },
  "al.notActive": {
    ar: "التنبيهات لسه مش متفعّلة على قاعدة البيانات.",
    en: "Alerts are not activated on the database yet.",
  },
  "al.method": {
    ar: "المتعطل = نفس قاعدة صفحة البورد (Blocked، أو tag «Blocked»، أو أكثر من 3 أيام عمل في عمود قيد التنفيذ) في السبرنت الحالي لكل فريق. التسليم متأخر = عدّى تاريخه الملتزم؛ معرّض للخطر = المتوقع بعد الملتزم. الملخص اليومي بيطلع 9 الصبح بتوقيت القاهرة أيام الشغل.",
    en: "Stuck = the same rule as the Board (Blocked, a “Blocked” tag, or more than 3 working days in an in-progress column) in each team's current sprint. A deliverable is late past its committed date; at risk when its forecast is after it. The daily digest goes out at 9:00 Cairo time on working days.",
  },
  "ov.phase.overdue.body": {
    ar: "{a} لسه هو السبرنت الحالي — كان المفروض يخلص {b} ومتأخر {c} يوم عمل، وفاضل فيه {d} story مفتوحة. لما السبرنت الجاي يبدأ في Azure هيتنقل له المتابعة.",
    en: "{a} is still the current sprint — it was due on {b} and is {c} working days late, with {d} stories still open. Tracking moves to the next sprint once it starts in Azure.",
  },
  "ov.phase.inactive.body": {
    ar: "مفيش سبرنت جديد من ساعة ما {a} خلص في {b}؛ الفريق معتبر غير نشط لحد ما يبدأ سبرنت جديد في Azure.",
    en: "No new sprint since {a} ended on {b}; the team counts as inactive until a new sprint starts in Azure.",
  },
  "ov.phase.ended.body": {
    ar: "{a} انتهى في {b} وبدأ بعده سبرنت جديد — ده عرض تاريخي.",
    en: "{a} ended on {b} and a later sprint has started — this is a historical view.",
  },
  "ov.result.title": { ar: "نتيجة السبرنت", en: "Sprint result" },
  "ov.result.subtitle": {
    ar: "{a} انتهى في {b} — النتايج دي هي اللي حصلت فيه لحد نهايته بس.",
    en: "{a} ended on {b} — these are only what happened in it, up to its end.",
  },
  "ov.result.none": {
    ar: "لا يوجد سجل كامل لهذا السبرنت بعد.",
    en: "No complete history for this sprint yet.",
  },
  "ov.result.sayDo": {
    ar: "من اللي اتوعد بيه أول يوم، كام اتسلّم فعلاً قبل نهاية السبرنت.",
    en: "Of what was committed on day one, how much was delivered before the sprint ended.",
  },
  "ov.result.committed": { ar: "اتوعد بيه", en: "Committed" },
  "ov.result.added": { ar: "اتضاف أثناءه", en: "Added" },
  "ov.result.removed": { ar: "اتشال", en: "Removed" },
  "ov.result.delivered": { ar: "اتسلّم قبل النهاية", en: "Delivered by the end" },
  "ov.result.carried": { ar: "اتنقل لبعده", en: "Carried over" },
  "ov.result.velocity": { ar: "السرعة (نقطة)", en: "Velocity (pts)" },
  "ov.result.lateClosed": {
    ar: "{a} عنصر اتقفل بعد نهاية السبرنت (بمتوسط {b} يوم) — مش محسوب في نتيجته.",
    en: "{a} items were closed after the sprint ended (median {b} days) — not counted in its result.",
  },
  "ov.phase.ended.live": {
    ar: "{a} انتهى في {b} وبدأ بعده سبرنت جديد. الصفحة دي بتعرض العناصر اللي لسه عليه في Azure؛ نتيجته الفعلية في صفحة التسليم.",
    en: "{a} ended on {b} and a later sprint has started. This page shows the items still on it in Azure; its actual result is on the Delivery page.",
  },
  "ov.lateBy": { ar: "متأخر {a} يوم عمل", en: "{a} working days late" },
  "ov.inactiveSince": { ar: "غير نشط من {a}", en: "Inactive since {a}" },
  "ov.status.late": { ar: "متأخر", en: "Late" },
  "ov.status.behind": { ar: "ورا الخطة", en: "Behind pace" },
  "ov.status.attention": { ar: "محتاج متابعة", en: "Needs attention" },
  "ov.status.onTrack": { ar: "على المسار", en: "On track" },
  "ov.status.idle": { ar: "غير نشط", en: "Inactive" },
  "ov.hero.title": { ar: "مركز قيادة التسليم", en: "Delivery command center" },
  "ov.hero.subtitle": {
    ar: "كل المشاريع والسبرنتات في مكان واحد — من Azure DevOps مباشرة، بدون إدخال يدوي.",
    en: "Every project and sprint in one place — straight from Azure DevOps, no manual input.",
  },
  "ov.hero.active": { ar: "سبرنت شغال", en: "Active sprints" },
  "ov.hero.late": { ar: "سبرنت متأخر", en: "Late sprints" },
  "ov.hero.stuck": { ar: "عنصر متعطل", en: "Stuck items" },
  "ov.hero.behind": { ar: "Story متسابة ورا الـ Tasks", en: "Stories behind their tasks" },
  "ov.portfolio.title": { ar: "المشاريع", en: "Projects" },
  "ov.portfolio.subtitle": {
    ar: "السبرنت الحالي لكل فريق، المشاكل أولاً. اضغط على مشروع لعرض تفاصيله.",
    en: "Each team's current sprint, problems first. Select a project to see its details.",
  },
  "ov.portfolio.none": { ar: "مفيش سبرنت شغال حالياً.", en: "No sprint is active right now." },
  "ov.portfolio.idle": { ar: "غير نشط:", en: "Inactive:" },
  "ov.stuckCount": { ar: "{a} متعطل", en: "{a} stuck" },
  "ov.noStuck": { ar: "لا يوجد تعطل", en: "Nothing stuck" },
  "ov.selected": { ar: "السبرنت المختار", en: "Selected sprint" },
  "ov.pointsOf": { ar: "{a} من {b} نقطة", en: "{a} of {b} points" },
  "ov.silent.title": {
    ar: "{a} شخص عندهم شغل شغال ومحدّثوش Azure",
    en: "{a} people have work in progress and have not updated Azure",
  },
  "ov.trend.title": { ar: "أداء التسليم", en: "Delivery trend" },
  "ov.trend.subtitle": {
    ar: "Say/Do لآخر السبرنتات المنتهية: كام في المية من اللي اتوعد بيه اتسلّم فعلاً.",
    en: "Say/do of the last finished sprints: how much of what was committed was delivered.",
  },
  "ov.trend.none": { ar: "لا توجد سبرنتات منتهية بعد.", en: "No finished sprints yet." },
  "ov.trend.velocity": { ar: "متوسط السرعة (نقطة)", en: "Avg velocity (pts)" },
  "ov.trend.lastSayDo": { ar: "Say/Do آخر سبرنت", en: "Last say/do" },
  "ov.trend.carried": { ar: "اتنقل للسبرنت الجاي", en: "Carried over" },
  "ov.health.title": { ar: "جودة بيانات Azure", en: "Azure data health" },
  "ov.health.ok": { ar: "البيانات مكتملة", en: "Data is complete" },
  "ov.health.unestimated": { ar: "Story بدون تقدير", en: "stories unestimated" },
  "ov.health.unowned": { ar: "Story محدش ماسكها", en: "stories nobody holds" },
  "ov.health.tasksUnassigned": { ar: "Task مفتوحة بدون مسؤول", en: "open tasks unassigned" },
  "ov.health.capacity": {
    ar: "من {a} شخص بدون Capacity في Azure",
    en: "of {a} people without capacity in Azure",
  },
  "ov.sprint.title": { ar: "وضع السبرنت", en: "Sprint status" },
  "ov.sprint.subtitle": {
    ar: "الـ Stories (نطاق السبرنت) والـ Tasks كلٌ لوحده — مش بيتجمعوا مع بعض.",
    en: "Stories (sprint scope) and tasks, each on its own — they are never added together.",
  },
  "ov.daysLeft": { ar: "باقي {a} يوم عمل", en: "{a} working days left" },
  "ov.endedOn": { ar: "انتهى في {a}", en: "Ended on {a}" },
  "ov.startsOn": { ar: "يبدأ في {a}", en: "Starts on {a}" },
  "ov.stories": { ar: "الـ Stories", en: "Stories" },
  "ov.tasks": { ar: "الـ Tasks", en: "Tasks" },
  "ov.expected": { ar: "المتوقع النهارده {a}%", en: "Expected by today {a}%" },
  "ov.tasksNote": {
    ar: "مؤشر على حركة الشغل اليومية، لا يُحسب في إنجاز النطاق.",
    en: "A signal of day-to-day movement; it does not count toward scope completion.",
  },
  "ov.behind.title": {
    ar: "{a} من {b} story لسه New رغم إن الـ Tasks بتاعتها اتحركت",
    en: "{a} of {b} stories are still New although their tasks have moved",
  },
  "ov.behind.body": {
    ar: "الفريق بيحرّك الـ Tasks بس مش بيحرّك الـ Story في Azure، فإنجاز السبرنت بيظهر أقل من الحقيقة. حرّكوا الـ Story لـ Active أول ما يبدأ شغلها، ولـ Closed لما تخلص.",
    en: "The team moves tasks but not the story in Azure, so sprint completion reads lower than reality. Move a story to Active when work starts and to Closed when it is done.",
  },
  "ov.more": { ar: "و {a} كمان", en: "{a} more" },
  "ov.all": { ar: "عرض الكل ({a})", en: "View all ({a})" },
  "ov.attention.title": { ar: "محتاج تدخّل", en: "Needs attention" },
  "ov.attention.subtitle": {
    ar: "الشغل المتعطل في السبرنت، الأقدم أولاً، ومع مين.",
    en: "Stuck work in the sprint, oldest first, and who holds it.",
  },
  "ov.delivery.title": { ar: "حالة التسليمات", en: "Delivery status" },
  "ov.syncDetails": { ar: "تفاصيل آخر مزامنة", en: "Last sync details" },
  "bl.title": { ar: "الـ Backlog", en: "Backlog" },
  "bl.subtitle": {
    ar: "عناصر نطاق الفريق المفتوحة خارج السبرنت الحالي، مع ما ينقص كل عنصر عشان يبقى جاهز.",
    en: "The team's open scope items outside its current sprint, with what each one is missing to be ready.",
  },
  "bl.team": { ar: "الفريق: {a}", en: "Team: {a}" },
  "bl.stat.total": { ar: "عنصر", en: "items" },
  "bl.stat.points": { ar: "نقطة مقدَّرة", en: "estimated points" },
  "bl.stat.notReady": { ar: "غير جاهز", en: "not ready" },
  "bl.stat.pastSprint": { ar: "في سبرنت انتهى", en: "in an ended sprint" },
  "bl.stat.futureSprint": { ar: "مخطط لسبرنت قادم", en: "planned for a later sprint" },
  "bl.filter.all": { ar: "الكل ({a})", en: "All ({a})" },
  "bl.filter.unestimated": { ar: "بدون تقدير ({a})", en: "Unestimated ({a})" },
  "bl.filter.unassigned": { ar: "بدون مسؤول ({a})", en: "Unassigned ({a})" },
  "bl.filter.stale": { ar: "قديم ({a})", en: "Stale ({a})" },
  "bl.filter.notReady": { ar: "غير جاهز ({a})", en: "Not ready ({a})" },
  "bl.search": {
    ar: "بحث بالعنوان أو الرقم أو الشخص أو الـ tag…",
    en: "Search title, id, person or tag…",
  },
  "bl.col.priority": { ar: "الأولوية", en: "Priority" },
  "bl.col.item": { ar: "العنصر", en: "Item" },
  "bl.col.state": { ar: "الحالة", en: "State" },
  "bl.col.sprint": { ar: "السبرنت", en: "Sprint" },
  "bl.col.points": { ar: "النقاط", en: "Points" },
  "bl.col.assignee": { ar: "المسؤول", en: "Assignee" },
  "bl.col.age": { ar: "العمر / آخر تحديث", en: "Age / last update" },
  "bl.col.checks": { ar: "ملاحظات", en: "Checks" },
  "bl.noSprint": { ar: "بدون سبرنت", en: "No sprint" },
  "bl.pastSprint": { ar: "انتهى", en: "ended" },
  "bl.age": { ar: "{a} يوم · آخر تحديث من {b} يوم", en: "{a} d old · updated {b} d ago" },
  "bl.flag.unestimated": { ar: "بدون تقدير", en: "No estimate" },
  "bl.flag.unassigned": { ar: "بدون مسؤول", en: "Unassigned" },
  "bl.flag.stale": { ar: "لم يتحدث من فترة", en: "Not updated lately" },
  "bl.flag.noParent": { ar: "بدون Feature أب", en: "No parent" },
  "bl.ready": { ar: "جاهز", en: "Ready" },
  "bl.empty": { ar: "الـ Backlog فاضي.", en: "The backlog is empty." },
  "bl.method": {
    ar: "الـ Backlog = عناصر النطاق المفتوحة (مستوى الـ requirements في Azure، والـ bugs حسب إعداد الفريق) المملوكة للفريق حسب الـ area، وليست في سبرنت جاري. جاهز = له تقدير وله عنصر أب. قديم = لم يتغير في Azure من {a} يوم أو أكثر. الترتيب بالـ Priority في Azure.",
    en: "Backlog = open scope items (Azure's requirement level, bugs per the team's setting) the team owns by area, not in a running sprint. Ready = estimated and linked to a parent. Stale = unchanged in Azure for {a}+ days. Ordered by Azure Priority.",
  },
  "pp.title": { ar: "الأشخاص", en: "People" },
  "pp.subtitle": {
    ar: "شغل كل شخص في السبرنت، وإيه اللي عمله في Azure آخر يوم عمل، ومين ماحدّثش شغله.",
    en: "Each person's sprint work, what they did in Azure on the last working day, and who has not updated their work.",
  },
  "pp.done": { ar: "خلص", en: "Done" },
  "pp.inProgress": { ar: "شغال", en: "In progress" },
  "pp.notStarted": { ar: "لم يبدأ", en: "Not started" },
  "pp.stuck": { ar: "متعطل", en: "Stuck" },
  "pp.unknown": { ar: "{a} بحالة غير معروفة", en: "{a} with an unmapped state" },
  "pp.yesterday": { ar: "آخر يوم عمل ({a})", en: "Last working day ({a})" },
  "pp.noActivity": {
    ar: "لم يغيّر شيئًا في Azure في هذا اليوم.",
    en: "Changed nothing in Azure that day.",
  },
  "pp.changes": { ar: "{a} تعديل", en: "{a} changes" },
  "pp.truncated": { ar: "ومزيد…", en: "and more…" },
  "pp.noUpdate": {
    ar: "عنده شغل شغال ولم يحدّث Azure من {a} يوم عمل",
    en: "Has work in progress and has not updated Azure for {a} working days",
  },
  "pp.noUpdateNever": {
    ar: "عنده شغل شغال ولا يوجد أي تحديث منه في آخر {a} يوم",
    en: "Has work in progress and made no update in the last {a} days",
  },
  "pp.lastActivity": { ar: "آخر تحديث من {a} يوم عمل", en: "Last update {a} working days ago" },
  "pp.lastActivityToday": { ar: "حدّث اليوم", en: "Updated today" },
  "pp.unassigned": { ar: "{a} عنصر مفتوح بدون مسؤول", en: "{a} open items unassigned" },
  "pp.aggregate": {
    ar: "صلاحيتك تعرض الأرقام المجمعة فقط، بدون تفاصيل لكل شخص.",
    en: "Your role shows aggregate figures only, without per-person detail.",
  },
  "pp.empty": { ar: "لا يوجد أشخاص في هذا السبرنت.", en: "No people in this sprint." },
  "pp.historyTo": { ar: "سجل التعديلات متزامن حتى {a}", en: "Revision history synced up to {a}" },
  "pp.method": {
    ar: "العدّ لكل العناصر المسندة للشخص في السبرنت (Stories و Tasks و Bugs) حسب تصنيف حالتها في Azure. النشاط من سجل تعديلات Azure وينسب لمن عمل التعديل. تنبيه عدم التحديث: عنده شغل شغال ولم يغيّر شيئًا في Azure من {a} يوم عمل أو أكثر.",
    en: "Counts cover every sprint item assigned to the person (stories, tasks, bugs) by Azure state category. Activity comes from Azure revision history and is credited to whoever made the change. No-update alert: holds work in progress and changed nothing in Azure for {a}+ working days.",
  },
  "dl.method": {
    ar: "الطريقة: التقدّم = المكتمل من القصص تحت الـ deliverable (بالنقاط إذا كان ٦٠٪ منها مُقدَّرًا، وإلا بالعدد؛ المهام لا تُحسب). المتوقَّع = المتبقي ÷ ما سُلِّم منه فعليًا في كل سبرنت خلال آخر ٦ سبرنتات منتهية، بإيقاع سبرنتات الفريق؛ المدى من أفضل وأسوأ سبرنت.",
    en: "Method: progress = completed stories under the deliverable (by points when 60% are estimated, else by count; tasks never count). Forecast = remaining ÷ what was actually completed under it per sprint over the last 6 finished sprints, at the team's sprint cadence; the range uses the best and worst sprint.",
  },
  "sh.method": {
    ar: "الطريقة: حالة كل عنصر وتقديره عند منتصف ليل بداية السبرنت ونهايته بتوقيت الفريق، من سجل تغييرات Azure. الالتزام مقابل التنفيذ = ما سُلِّم من الملتزم به ÷ الملتزم به. السرعة = نقاط كل ما سُلِّم. المهام (Tasks) والـ Bugs المخططة كمهام لا تُحسب كنطاق.",
    en: "Method: each item's state and estimate at local midnight at the sprint's start and end, from Azure change history. Say/Do = committed work delivered ÷ committed. Velocity = points of everything delivered. Tasks, and bugs planned as tasks, are not scope.",
  },

  "teamPage.title": { ar: "الفريق", en: "Team" },
  "teamPage.subtitle": {
    ar: "السعة والتوزيع وأنماط التعاون.",
    en: "Capacity, distribution, and collaboration patterns.",
  },
  "teamPage.p1": { ar: "تخطيط السعة لكل سبرنت", en: "Per-sprint capacity planning" },
  "teamPage.p2": { ar: "توزيع العمل ونقاط الاختناق", en: "Work distribution and bottlenecks" },
  "teamPage.p3": { ar: "أنماط المراجعة والتعاون", en: "Review and collaboration patterns" },

  "engPage.title": { ar: "الهندسة", en: "Engineering" },
  "engPage.subtitle": {
    ar: "جودة الشيفرة وخطوط البناء والنشر.",
    en: "Code quality, pipelines, and deployments.",
  },
  "engPage.p1": { ar: "صحة خطوط البناء", en: "Pipeline health" },
  "engPage.p2": { ar: "زمن مراجعة طلبات الدمج", en: "Pull request review latency" },
  "engPage.p3": { ar: "استقرار الاختبارات والانحدار", en: "Test stability and regressions" },

  "intel.title": { ar: "الذكاء التحليلي", en: "Intelligence" },
  "intel.subtitle": {
    ar: "تفسيرات وتنبؤات ومساعد التسليم.",
    en: "Explanations, forecasts, and the delivery copilot.",
  },
  "intel.p1": { ar: "تفسير أسباب تعثّر السبرنت", en: "Root-cause explanation for sprint slippage" },
  "intel.p2": { ar: "سيناريوهات ماذا لو", en: "What-if scenarios" },
  "intel.p3": { ar: "مساعد التسليم بالحوار", en: "Conversational delivery copilot" },

  "kpi.primary": { ar: "المؤشّر الرئيسي", en: "Primary KPI" },

  "trajectory.summary": {
    ar: "في اليوم {a} من {b}: الإنجاز الفعلي {c}% مقابل خط متوقّع عند {d}%، والإغلاق المتوقّع {e}% ضمن نطاق ثقة من {f}% إلى {g}%.",
    en: "Day {a} of {b}: actual completion {c}% against an expected line of {d}%; forecast close {e}% within a confidence range of {f}% to {g}%.",
  },
  "trajectory.today": { ar: "اليوم الحالي", en: "Today" },
  "trajectory.chartLabel": { ar: "رسم بياني لمسار السبرنت", en: "Sprint trajectory chart" },

  "dev.state": { ar: "حالة العرض", en: "Interface state" },
  "dev.state.normal": { ar: "عادي", en: "Normal" },
  "dev.state.loading": { ar: "تحميل", en: "Loading" },
  "dev.state.empty": { ar: "فارغ", en: "Empty" },
  "dev.state.error": { ar: "خطأ", en: "Error" },
  "dev.state.stale": { ar: "بيانات قديمة", en: "Stale data" },
  "dev.state.partial": { ar: "بيانات جزئية", en: "Partial data" },
  "dev.only": { ar: "أداة تطوير فقط", en: "Development tool only" },

  "common.close": { ar: "إغلاق", en: "Close" },
  "common.viewAll": { ar: "عرض الكل", en: "View all" },
  "common.minutes": { ar: "منذ {a} دقيقة", en: "{a} min ago" },
  "common.of": { ar: "من", en: "of" },

  "nav.settings": { ar: "الإعدادات", en: "Settings" },

  "auth.title": { ar: "تسجيل الدخول", en: "Sign in" },
  "auth.subtitle": {
    ar: "الدخول مطلوب لإدارة اتصال Azure DevOps.",
    en: "Sign in to manage the Azure DevOps connection.",
  },
  "auth.email": { ar: "البريد الإلكتروني", en: "Email" },
  "auth.password": { ar: "كلمة المرور", en: "Password" },
  "auth.submit": { ar: "دخول", en: "Sign in" },
  "auth.pending": { ar: "جارٍ الدخول…", en: "Signing in…" },
  "auth.failed": {
    ar: "تعذّر تسجيل الدخول. تحقّق من البيانات وحاول مجددًا.",
    en: "Sign-in failed. Check your details and try again.",
  },
  "auth.mode.signIn": { ar: "تسجيل الدخول", en: "Sign in" },
  "auth.mode.signUp": { ar: "إنشاء حساب", en: "Sign up" },
  "auth.signUp.submit": { ar: "إنشاء الحساب", en: "Create account" },
  "auth.signUp.pending": { ar: "جارٍ إنشاء الحساب…", en: "Creating account…" },
  "auth.signUp.subtitle": {
    ar: "أنشئ حسابك لإدارة مساحة العمل واتصال Azure DevOps.",
    en: "Create your account to manage the workspace and the Azure DevOps connection.",
  },
  "auth.signUp.checkEmail": {
    ar: "تم إرسال رسالة تأكيد إلى بريدك الإلكتروني. افتح الرابط ثم عد لتسجيل الدخول.",
    en: "A confirmation email has been sent. Open the link, then return here to sign in.",
  },
  "auth.signUp.failed": {
    ar: "تعذّر إنشاء الحساب. قد يكون البريد مستخدمًا أو كلمة المرور ضعيفة.",
    en: "Sign-up failed. The email may already be in use, or the password is too weak.",
  },
  "auth.unverified": {
    ar: "لم يتم تأكيد بريدك الإلكتروني بعد. افتح رابط التأكيد في بريدك ثم حدّث الصفحة.",
    en: "Your email is not verified yet. Open the confirmation link in your inbox, then refresh.",
  },
  "auth.signOut": { ar: "تسجيل الخروج", en: "Sign out" },

  "onboarding.title": { ar: "إنشاء مساحة العمل", en: "Create workspace" },
  "onboarding.subtitle": {
    ar: "لا توجد مساحة عمل بعد. أنشئ المساحة الأولى وستصبح مسؤولها.",
    en: "No workspace exists yet. Create the first one and you become its administrator.",
  },
  "onboarding.name": { ar: "اسم مساحة العمل", en: "Workspace name" },
  "onboarding.slug": { ar: "المعرّف المختصر", en: "Workspace slug" },
  "onboarding.slugHint": {
    ar: "حروف إنجليزية صغيرة وأرقام وشرطات فقط.",
    en: "Lowercase letters, numbers and hyphens only.",
  },
  "onboarding.submit": { ar: "إنشاء", en: "Create" },
  "onboarding.pending": { ar: "جارٍ الإنشاء…", en: "Creating…" },
  "onboarding.checking": { ar: "جارٍ التحقق…", en: "Checking…" },
  "onboarding.needsInvite": {
    ar: "حسابك يحتاج إلى دعوة من مسؤول مساحة العمل.",
    en: "Your account needs an invitation from the workspace administrator.",
  },
  "onboarding.error.tenant_exists": {
    ar: "توجد مساحة عمل بالفعل. حسابك يحتاج إلى دعوة من مسؤول مساحة العمل.",
    en: "A workspace already exists. Your account needs an invitation from the workspace administrator.",
  },
  "onboarding.error.already_member": {
    ar: "حسابك مرتبط بمساحة عمل بالفعل.",
    en: "Your account already belongs to a workspace.",
  },
  "onboarding.error.already_provisioned": {
    ar: "تم تعيين مسؤول أولي بالفعل.",
    en: "An initial administrator has already been provisioned.",
  },
  "onboarding.error.email_unverified": {
    ar: "لم يتم تأكيد بريدك الإلكتروني بعد.",
    en: "Your email is not verified yet.",
  },
  "onboarding.error.unauthenticated": {
    ar: "الجلسة غير صالحة. سجّل الدخول مجددًا.",
    en: "Invalid session. Please sign in again.",
  },
  "onboarding.error.invalid_name": { ar: "اسم غير صالح.", en: "Invalid workspace name." },
  "onboarding.error.invalid_slug": { ar: "معرّف غير صالح.", en: "Invalid workspace slug." },
  "onboarding.error.invalid_identity": { ar: "هوية غير صالحة.", en: "Invalid identity." },
  "onboarding.error.unknown": {
    ar: "تعذّر إكمال العملية.",
    en: "The operation could not be completed.",
  },

  "azure.title": { ar: "اتصال Azure DevOps", en: "Azure DevOps Connection" },
  "azure.subtitle": {
    ar: "تحقّق من الاتصال، واستكشف المشاريع، وشغّل مزامنة الأساس. جميع العمليات للقراءة فقط.",
    en: "Verify the connection, discover projects, and run the foundation sync. All operations are read-only.",
  },
  "azure.organization": { ar: "المؤسسة", en: "Organization" },
  "azure.status": { ar: "حالة الاتصال", en: "Connection status" },
  "azure.status.unconfigured": { ar: "غير مهيّأ", en: "Not configured" },
  "azure.status.pending": { ar: "بانتظار التحقّق", en: "Awaiting verification" },
  "azure.status.connected": { ar: "متصل", en: "Connected" },
  "azure.status.error": { ar: "يوجد خطأ", en: "Error" },
  "azure.status.disabled": { ar: "معطّل", en: "Disabled" },
  "azure.lastVerified": { ar: "آخر تحقّق", en: "Last verified" },
  "azure.never": { ar: "لم يتم بعد", en: "Never" },
  "azure.validate": { ar: "تحقّق من الاتصال", en: "Validate connection" },
  "azure.discover": { ar: "استكشاف المشاريع", en: "Discover projects" },
  "azure.sync": { ar: "تشغيل مزامنة الأساس", en: "Run foundation sync" },
  "azure.running": { ar: "جارٍ التنفيذ…", en: "Working…" },
  "azure.activeRun": {
    ar: "توجد مزامنة نشطة الآن.",
    en: "A synchronization run is already active.",
  },
  "azure.noPermission": {
    ar: "لا تملك صلاحية تشغيل المزامنة. تواصل مع مسؤول المؤسسة.",
    en: "You are not allowed to run synchronization. Contact your tenant admin.",
  },
  "azure.notConfigured": {
    ar: "لم تُضبط بيانات الاتصال بعد على الخادم.",
    en: "Server-side Azure DevOps secrets are not configured yet.",
  },
  "azure.projects": { ar: "المشاريع المتاحة", en: "Discoverable projects" },
  "azure.projectsEmpty": {
    ar: "لا توجد مشاريع مقروءة بهذه الصلاحيات.",
    en: "No readable projects with these credentials.",
  },
  "azure.discoveryFailed": { ar: "فشل استكشاف المشاريع", en: "Project discovery failed" },
  "azure.discoveryPartial": {
    ar: "تم عرض نتائج جزئية؛ لم تُقرأ جميع الصفحات.",
    en: "Partial results shown; not every page could be read.",
  },
  "azure.cancel": { ar: "إلغاء المزامنة", en: "Cancel sync" },
  "azure.run.queued": { ar: "المزامنة في قائمة الانتظار.", en: "Synchronization queued." },
  "azure.run.running": { ar: "المزامنة قيد التنفيذ…", en: "Synchronization running…" },
  "azure.run.succeeded": { ar: "اكتملت المزامنة بنجاح.", en: "Synchronization completed." },
  "azure.run.partial": {
    ar: "اكتملت المزامنة جزئيًا.",
    en: "Synchronization completed partially.",
  },
  "azure.run.failed": { ar: "فشلت المزامنة.", en: "Synchronization failed." },
  "azure.run.skipped": { ar: "تم تخطي المزامنة.", en: "Synchronization skipped." },
  "azure.lastRun": { ar: "آخر تشغيل", en: "Last run" },
  "azure.domain": { ar: "النطاق", en: "Domain" },
  "azure.discovered": { ar: "مقروء", en: "Read" },
  "azure.inserted": { ar: "مضاف", en: "Inserted" },
  "azure.updated": { ar: "محدّث", en: "Updated" },
  "azure.unchanged": { ar: "دون تغيير", en: "Unchanged" },
  "azure.missing": { ar: "مفقود", en: "Missing" },
  "azure.failed": { ar: "فشل", en: "Failed" },
  "azure.complete": { ar: "مكتمل", en: "Complete" },
  "azure.partial": { ar: "جزئي", en: "Partial" },
  "azure.blocked": { ar: "محجوب", en: "Blocked" },
  "azure.skippedBecause": {
    ar: "تم التخطي لفشل مرحلة {domain}",
    en: "Skipped because {domain} failed",
  },
  "azure.freshness": { ar: "حداثة البيانات", en: "Freshness" },
  "azure.domain.organization": { ar: "المؤسسة", en: "Organization" },
  "azure.domain.projects": { ar: "المشاريع", en: "Projects" },
  "azure.domain.teams": { ar: "الفرق", en: "Teams" },
  "azure.domain.iterations": { ar: "السبرنتات", en: "Iterations" },
  "azure.domain.teamIterations": { ar: "سبرنتات الفرق", en: "Team iterations" },
  "azure.domain.members": { ar: "الأعضاء", en: "Members" },
  "azure.domain.teamMemberships": { ar: "عضويات الفرق", en: "Team memberships" },
  "azure.next.none": { ar: "لا يلزم أي إجراء.", en: "No action needed." },
  "azure.next.retry_sync": { ar: "أعد تشغيل المزامنة.", en: "Re-run the synchronization." },
  "azure.next.fix_credentials": {
    ar: "راجع بيانات الاعتماد على الخادم.",
    en: "Review the server-side credentials.",
  },
  "azure.next.wait_and_retry": {
    ar: "انتظر قليلًا ثم أعد المحاولة.",
    en: "Wait a moment, then retry.",
  },
  "azure.next.contact_admin": { ar: "تواصل مع مسؤول المؤسسة.", en: "Contact your tenant admin." },
  "azure.error.not_configured": {
    ar: "لم تُضبط بيانات الاتصال.",
    en: "The connection is not configured.",
  },
  "azure.error.invalid_credentials": {
    ar: "رفض Azure DevOps بيانات الاعتماد.",
    en: "Azure DevOps rejected the credentials.",
  },
  "azure.error.insufficient_permissions": {
    ar: "الصلاحيات غير كافية للقراءة.",
    en: "The credentials lack the required read scopes.",
  },
  "azure.error.organization_not_found": {
    ar: "تعذّر العثور على المؤسسة.",
    en: "The organization was not found.",
  },
  "azure.error.throttled": { ar: "تم تقييد الطلبات مؤقتًا.", en: "Requests are being throttled." },
  "azure.error.timeout": { ar: "انتهت مهلة الطلب.", en: "The request timed out." },
  "azure.error.unavailable": {
    ar: "الخدمة غير متاحة حاليًا.",
    en: "The service is temporarily unavailable.",
  },
  "azure.error.partial_sync": {
    ar: "اكتملت المزامنة جزئيًا.",
    en: "The synchronization completed partially.",
  },
  "azure.error.conflict": { ar: "توجد مزامنة نشطة بالفعل.", en: "Another run is already active." },
  "azure.error.forbidden": {
    ar: "غير مصرّح لك بهذه العملية.",
    en: "You are not authorized for this operation.",
  },
  "azure.error.missing_configuration": {
    ar: "لم تُضبط بيانات الاتصال.",
    en: "The connection is not configured.",
  },
  "azure.error.invalid_configuration": {
    ar: "قيمة اسم المؤسسة غير صالحة.",
    en: "The configured organization value is invalid.",
  },
  "azure.error.request_timeout": { ar: "انتهت مهلة الطلب.", en: "The request timed out." },
  "azure.error.network_unreachable": {
    ar: "تعذّر الوصول إلى Azure DevOps من الخادم.",
    en: "Azure DevOps could not be reached from the server.",
  },
  "azure.error.provider_unavailable": {
    ar: "الخدمة غير متاحة حاليًا.",
    en: "The service is temporarily unavailable.",
  },
  "azure.error.unknown": { ar: "حدث خطأ غير متوقع.", en: "An unexpected error occurred." },

  "tp.title": { ar: "الفريق", en: "Team" },
  "tp.subtitle": {
    ar: "توزيع العمل الحقيقي للفريق في السبرنت المحدد.",
    en: "Real work distribution for the selected team and sprint.",
  },
  "tp.card.members": { ar: "أعضاء الفريق", en: "Team Members" },
  "tp.card.active": { ar: "العمل الجاري", en: "Active Work" },
  "tp.card.completed": { ar: "العمل المكتمل", en: "Completed Work" },
  "tp.card.blocked": { ar: "العمل المتوقف", en: "Blocked Work" },
  "tp.card.unassigned": { ar: "عمل بلا مسؤول", en: "Unassigned Work" },
  "tp.card.estimateCoverage": { ar: "تغطية التقديرات", en: "Estimate Coverage" },
  "tp.card.items": { ar: "عنصر", en: "items" },
  "tp.card.ofTotal": { ar: "من {a} عنصر", en: "of {a} items" },
  "tp.card.scoped": { ar: "من {a} عنصر ضمن النطاق", en: "of {a} scoped items" },

  "tp.workload.title": { ar: "نظرة على الحِمل", en: "Workload overview" },
  "tp.workload.subtitle": {
    ar: "أعداد فعلية لكل عضو. لا يوجد ترتيب للأداء.",
    en: "Real counts per member. No performance ranking.",
  },
  "tp.col.member": { ar: "عضو الفريق", en: "Team member" },
  "tp.col.assigned": { ar: "المُسند", en: "Assigned" },
  "tp.col.active": { ar: "قيد العمل", en: "Active" },
  "tp.col.completed": { ar: "مكتمل", en: "Completed" },
  "tp.col.blocked": { ar: "متوقف", en: "Blocked" },
  "tp.col.capacity": { ar: "السعة", en: "Capacity" },
  "tp.col.utilization": { ar: "الاستخدام", en: "Utilization" },
  "tp.col.coverage": { ar: "تغطية البيانات", en: "Data coverage" },
  "tp.na": { ar: "غير متاح", en: "N/A" },
  "tp.capacity.notConfigured": { ar: "السعة غير مُعدّة", en: "Capacity not configured" },
  "tp.coverage.noEstimates": { ar: "بلا تقديرات: {a}", en: "Unestimated: {a}" },
  "tp.coverage.stageAge": {
    ar: "وسيط العمر في المرحلة الحالية: {a}",
    en: "Median age in current stage: {a}",
  },
  "tp.coverage.noStageAge": { ar: "عمر المرحلة غير متاح", en: "Stage age unavailable" },
  "tp.sort.label": { ar: "ترتيب حسب", en: "Sort by" },
  "tp.sort.name": { ar: "الاسم", en: "Display name" },

  "tp.dist.title": { ar: "توزيع العمل", en: "Work distribution" },
  "tp.dist.subtitle": {
    ar: "توزيع فعلي حسب الحالة والنوع والإسناد.",
    en: "Real distribution by state, type, and assignment.",
  },
  "tp.dist.byState": { ar: "حسب فئة الحالة", en: "By state category" },
  "tp.dist.byType": { ar: "حسب نوع العنصر", en: "By work item type" },
  "tp.dist.byAssignment": { ar: "الإسناد", en: "Assignment" },
  "tp.dist.assigned": { ar: "مُسند", en: "Assigned" },
  "tp.dist.unassigned": { ar: "غير مُسند", en: "Unassigned" },

  "tp.state.proposed": { ar: "مقترح", en: "Proposed" },
  "tp.state.inProgress": { ar: "قيد التنفيذ", en: "In progress" },
  "tp.state.resolved": { ar: "تم الحل", en: "Resolved" },
  "tp.state.completed": { ar: "مكتمل", en: "Completed" },
  "tp.state.removed": { ar: "مُزال", en: "Removed" },
  "tp.state.unknown": { ar: "غير معروف", en: "Unknown" },

  "tp.type.epic": { ar: "ملحمة", en: "Epic" },
  "tp.type.feature": { ar: "ميزة", en: "Feature" },
  "tp.type.story": { ar: "قصة", en: "Story" },
  "tp.type.requirement": { ar: "متطلب", en: "Requirement" },
  "tp.type.issue": { ar: "مسألة", en: "Issue" },
  "tp.type.bug": { ar: "خلل", en: "Bug" },
  "tp.type.task": { ar: "مهمة", en: "Task" },
  "tp.type.testCase": { ar: "حالة اختبار", en: "Test case" },
  "tp.type.custom": { ar: "نوع مخصص", en: "Custom" },

  "tp.items.title": { ar: "عناصر عمل الفريق", en: "Team work items" },
  "tp.items.subtitle": { ar: "{a} عنصر بعد التصفية", en: "{a} items after filters" },
  "tp.items.search": { ar: "بحث بالعنوان أو الرقم", en: "Search by title or ID" },
  "tp.filter.allMembers": { ar: "كل الأعضاء", en: "All members" },
  "tp.filter.allStates": { ar: "كل الحالات", en: "All states" },
  "tp.filter.allTypes": { ar: "كل الأنواع", en: "All types" },
  "tp.filter.blockedOnly": { ar: "المتوقف فقط", en: "Blocked only" },
  "tp.filter.unassignedOnly": { ar: "بلا مسؤول فقط", en: "Unassigned only" },
  "tp.filter.unestimatedOnly": { ar: "بلا تقدير فقط", en: "Unestimated only" },
  "tp.filter.clear": { ar: "مسح التصفية", en: "Clear filters" },
  "tp.col.id": { ar: "المعرّف", en: "ID" },
  "tp.col.title": { ar: "العنوان", en: "Title" },
  "tp.col.type": { ar: "النوع", en: "Type" },
  "tp.col.state": { ar: "الحالة", en: "State" },
  "tp.col.assignee": { ar: "المسؤول", en: "Assignee" },
  "tp.col.estimate": { ar: "التقدير", en: "Estimate" },
  "tp.unassigned": { ar: "بدون مسؤول", en: "Unassigned" },
  "tp.blocked": { ar: "متوقف", en: "Blocked" },
  "tp.noEstimate": { ar: "بلا تقدير", en: "No estimate" },
  "tp.detail.title": { ar: "تفاصيل عنصر العمل", en: "Work item detail" },
  "tp.detail.azureType": { ar: "نوع Azure الأصلي", en: "Original Azure type" },
  "tp.detail.azureState": { ar: "حالة Azure الأصلية", en: "Original Azure state" },
  "tp.detail.changed": { ar: "آخر تغيير", en: "Last changed" },
  "tp.detail.stageAge": { ar: "العمر في المرحلة الحالية", en: "Age in current stage" },
  "tp.detail.openAzure": { ar: "فتح في Azure DevOps", en: "Open in Azure DevOps" },
  "tp.detail.noDescription": {
    ar: "الوصف التفصيلي غير معروض هنا؛ افتح العنصر في Azure DevOps.",
    en: "Full description is not shown here; open the item in Azure DevOps.",
  },

  "tp.notice.title": { ar: "ملاحظات جودة البيانات", en: "Data quality notices" },
  "tp.notice.capacity": {
    ar: "سعة الفريق غير مُعدّة في Azure DevOps لهذا السبرنت، لذلك لا تُحتسب نسب الاستخدام.",
    en: "Team capacity is not configured in Azure DevOps for this sprint, so utilization is not calculated.",
  },
  "tp.notice.assignment": {
    ar: "تغطية الإسناد {a}٪ — يوجد {b} عنصر بلا مسؤول.",
    en: "Assignment coverage is {a}% — {b} items have no assignee.",
  },
  "tp.notice.estimate": {
    ar: "تغطية التقديرات {a}٪ فقط، وهي أقل من الحد المفيد للتحليل (٦٠٪).",
    en: "Estimate coverage is only {a}%, below the 60% threshold useful for analysis.",
  },
  "tp.notice.partial": {
    ar: "المزامنة جزئية؛ قد تكون بعض العناصر ناقصة.",
    en: "Sync is partial; some items may be missing.",
  },
  "tp.notice.stale": {
    ar: "آخر مزامنة لعناصر العمل تجاوزت ٢٤ ساعة.",
    en: "The last work item sync is more than 24 hours old.",
  },
  "tp.notice.missingNotZero": {
    ar: "البيانات الناقصة تظهر كـ«غير متاح» ولا تُعامل كأداء صفري.",
    en: "Missing data is shown as N/A and is never treated as zero performance.",
  },

  "tp.exec.title": { ar: "عرض تنفيذي مُجمّع", en: "Aggregate-only executive view" },
  "tp.exec.body": {
    ar: "دورك التنفيذي يمنح الأرقام المُجمّعة فقط؛ أسماء الأعضاء وعناصرهم غير معروضة.",
    en: "Your executive role shows aggregate figures only; member names and their items are hidden.",
  },
  "tp.empty.noItems": {
    ar: "لا توجد عناصر عمل مزامَنة لهذا السبرنت بعد. شغّل المزامنة من النظرة العامة.",
    en: "No synchronized work items for this sprint yet. Run the sync from Overview.",
  },
  "tp.empty.noMembers": {
    ar: "لا يوجد أعضاء مزامَنون لهذا الفريق.",
    en: "No synchronized members for this team.",
  },
  "tp.empty.noFiltered": {
    ar: "لا توجد عناصر مطابقة للتصفية.",
    en: "No items match the current filters.",
  },
  "tp.error.forbidden": {
    ar: "لا تملك صلاحية عرض هذا الفريق.",
    en: "You do not have access to this team.",
  },
  "tp.lastSync": { ar: "آخر مزامنة لعناصر العمل", en: "Last work item sync" },
  "tp.lastSync.never": { ar: "لم تتم بعد", en: "Never" },
} satisfies Dict;

export type TKey = keyof typeof dictionary;

type Ctx = {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  n: (value: number, opts?: Intl.NumberFormatOptions) => string;
  days: (value: number) => string;
  hours: (value: number) => string;
};

/** Arabic-aware day count: يوم / يومان / أيام / يوماً. */
export function formatDays(value: number, locale: Locale) {
  if (locale === "en") return `${value} ${value === 1 ? "day" : "days"}`;
  if (value === 1) return "يوم واحد";
  if (value === 2) return "يومان";
  if (value >= 3 && value <= 10) return `${value} أيام`;
  return `${value} يوماً`;
}

/** Arabic-aware hour count with a real space before the unit. */
export function formatHours(value: number, locale: Locale) {
  if (locale === "en") return `${value}h`;
  if (value === 1) return "ساعة واحدة";
  if (value === 2) return "ساعتان";
  if (value >= 3 && value <= 10) return `${value} ساعات`;
  return `${value} ساعة`;
}

// Keep one context instance across hot reloads so providers and consumers always match.
const g = globalThis as unknown as { __matnLocaleContext?: React.Context<Ctx | null> };
const LocaleContext = (g.__matnLocaleContext ??= createContext<Ctx | null>(null));

const STORAGE_KEY = "matn.locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLocaleState(stored);
  }, []);

  useEffect(() => {
    const dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      let out = dictionary[key]?.[locale] ?? String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.replaceAll(`{${k}}`, String(v));
        }
      }
      return out;
    },
    [locale],
  );

  const n = useCallback(
    (value: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat("en-US", opts).format(value),
    [],
  );

  const days = useCallback((v: number) => formatDays(v, locale), [locale]);
  const hours = useCallback((v: number) => formatHours(v, locale), [locale]);

  const value = useMemo(
    () => ({
      locale,
      dir: (locale === "ar" ? "rtl" : "ltr") as "rtl" | "ltr",
      setLocale,
      t,
      n,
      days,
      hours,
    }),
    [locale, setLocale, t, n, days, hours],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside LocaleProvider");
  return ctx;
}
