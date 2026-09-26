import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
