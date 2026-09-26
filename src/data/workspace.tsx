import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  defaultFilters,
  getDeliverySnapshot,
  getIteration,
  iterations,
  organizations,
  projects,
  teams,
} from "./mock";
import type {
  DeliverySnapshot,
  Iteration,
  Organization,
  Project,
  Team,
  WorkspaceFilters,
} from "./types";
import {
  advanceBacklogWorkItemSync,
  advanceHistoryWorkItemSync,
  advanceSprintWorkItemSync,
  getRealOverview,
  getWorkspaceSelectors,
  startBacklogWorkItemSync,
  startHistoryWorkItemSync,
  startSprintWorkItemSync,
} from "@/lib/workspace/workspace.functions";
import { supabase } from "@/integrations/supabase/client";

export type PreviewState = "normal" | "loading" | "empty" | "error" | "stale" | "partial";

/** Real synchronized data and mock data are never blended. */
export type WorkspaceMode = "mock" | "real";

export const isDevPreview = import.meta.env.DEV;

type Options = {
  organizations: Organization[];
  projects: Project[];
  teams: Team[];
  iterations: Iteration[];
};

/** Honest work-item/Overview data state — never Foundation-sync freshness. */
export type RealDataState = "notSynced" | "syncing" | "current" | "partial" | "failed" | "stale";

export type WorkItemSyncReport = {
  readonly discoveredIds: number;
  readonly read: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly detached: number;
  readonly failed: number;
  readonly truncated: boolean;
  /** Sprint capacity read from Azure; null when unavailable. */
  readonly capacity: { members: number; configured: number; teamDaysOff: number } | null;
  readonly status: "succeeded" | "partial" | "failed";
};

/** Result of the project backlog sync that follows a sprint sync (ADR-014). */
export type BacklogSyncReport = {
  readonly mode: "full" | "incremental";
  readonly discoveredIds: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly rechecked: number;
  readonly unavailable: number;
  readonly failed: number;
  readonly truncated: boolean;
  readonly status: "succeeded" | "partial" | "failed";
  readonly message: string | null;
};

/** Result of the revision-history sync that follows the backlog sync (ADR-017). */
export type HistorySyncReport = {
  readonly items: number;
  readonly revisions: number;
  readonly transitions: number;
  readonly scopeChanges: number;
  readonly remaining: number;
  readonly failed: number;
  readonly status: "succeeded" | "partial" | "failed";
  readonly message: string | null;
};

type Ctx = {
  mode: WorkspaceMode;
  filters: WorkspaceFilters;
  previewState: PreviewState;
  setPreviewState: (s: PreviewState) => void;
  setFilter: (key: keyof WorkspaceFilters, value: string) => void;
  snapshot: DeliverySnapshot | null;
  iteration: Iteration | undefined;
  loading: boolean;
  error: boolean;
  refresh: () => void;
  /** Metrics/sections with no trustworthy synchronized source. */
  unavailable: Record<string, string>;
  syncing: boolean;
  syncMessage: string | null;
  runSync: () => void;
  options: Options;
  dataState: RealDataState;
  syncReport: WorkItemSyncReport | null;
  backlogReport: BacklogSyncReport | null;
  historyReport: HistorySyncReport | null;
  /** True when the sprint has no real start/finish dates. */
  sprintDatesUnavailable: boolean;
};

const WorkspaceContext = createContext<Ctx | null>(null);

const MAX_SYNC_ADVANCES = 40;

async function runBacklogSync(teamIterationId: string): Promise<BacklogSyncReport> {
  const failed = (message: string | null): BacklogSyncReport => ({
    mode: "full",
    discoveredIds: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    rechecked: 0,
    unavailable: 0,
    failed: 0,
    truncated: false,
    status: "failed",
    message,
  });
  const started = await startBacklogWorkItemSync({ data: { teamIterationId } });
  if (!started.ok) return failed(started.failure.message);
  let status = started.status;
  for (let i = 0; i < MAX_SYNC_ADVANCES && status.cursor.phase !== "done"; i += 1) {
    const advanced = await advanceBacklogWorkItemSync({
      data: { teamIterationId, runId: status.runId },
    });
    if (!advanced.ok) return failed(advanced.failure.message);
    status = advanced.status;
    if (status.status === "failed") return failed(status.failure?.message ?? null);
  }
  const c = status.cursor;
  return {
    mode: c.mode,
    discoveredIds: c.ids.length,
    inserted: c.inserted,
    updated: c.updated,
    unchanged: c.unchanged,
    rechecked: c.staleIds.length,
    unavailable: c.unavailable,
    failed: c.failed,
    truncated: c.truncated,
    status: status.status === "succeeded" ? "succeeded" : "partial",
    message: null,
  };
}

async function runHistorySync(teamIterationId: string): Promise<HistorySyncReport> {
  const failed = (message: string | null): HistorySyncReport => ({
    items: 0,
    revisions: 0,
    transitions: 0,
    scopeChanges: 0,
    remaining: 0,
    failed: 0,
    status: "failed",
    message,
  });
  const started = await startHistoryWorkItemSync({ data: { teamIterationId } });
  if (!started.ok) return failed(started.failure.message);
  let status = started.status;
  for (let i = 0; i < MAX_SYNC_ADVANCES && status.cursor.phase !== "done"; i += 1) {
    const advanced = await advanceHistoryWorkItemSync({
      data: { teamIterationId, runId: status.runId },
    });
    if (!advanced.ok) return failed(advanced.failure.message);
    status = advanced.status;
    if (status.status === "failed") return failed(status.failure?.message ?? null);
  }
  const c = status.cursor;
  return {
    items: c.items,
    revisions: c.revisions,
    transitions: c.transitions,
    scopeChanges: c.scopeChanges,
    remaining: c.remaining + Math.max(0, c.pending.length - c.next),
    failed: c.failed,
    status: status.status === "succeeded" ? "succeeded" : "partial",
    message: null,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<WorkspaceFilters>(defaultFilters);
  const [touched, setTouched] = useState(false);
  const [baseLoading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewState>("normal");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<WorkItemSyncReport | null>(null);
  const [backlogReport, setBacklogReport] = useState<BacklogSyncReport | null>(null);
  const [historyReport, setHistoryReport] = useState<HistorySyncReport | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);

  // Protected server functions need a bearer token: never call them during SSR
  // or while signed out (that throws "No authorization header provided").
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const selectorsQuery = useQuery({
    queryKey: ["workspace", "selectors"],
    queryFn: () => getWorkspaceSelectors(),
    enabled: hasSession,
    retry: false,
    staleTime: 60_000,
  });

  const selectors =
    selectorsQuery.data?.ok && selectorsQuery.data.selectors.teamIterations.length > 0
      ? selectorsQuery.data.selectors
      : null;

  const mode: WorkspaceMode = selectors ? "real" : "mock";

  // Adopt the server-resolved current sprint once, before the user chooses.
  useEffect(() => {
    if (!selectors || touched) return;
    const d = selectors.defaults;
    if (!d.teamIterationId) return;
    setFilters({
      organizationId: d.organizationId ?? "",
      projectId: d.projectId ?? "",
      teamId: d.teamId ?? "",
      iterationId: d.teamIterationId,
    });
  }, [selectors, touched]);

  const realSelectionReady = Boolean(
    selectors &&
    filters.iterationId &&
    selectors.teamIterations.some((it) => it.id === filters.iterationId),
  );

  const overviewQuery = useQuery({
    queryKey: ["workspace", "overview", filters.iterationId, tick],
    queryFn: () => getRealOverview({ data: { teamIterationId: filters.iterationId } }),
    enabled: realSelectionReady,
    retry: false,
  });

  const realOverview = overviewQuery.data?.ok ? overviewQuery.data.overview : null;

  // Mock async read, used only while the workspace has no synchronized sprint.
  useEffect(() => {
    if (mode === "real") return;
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(timer);
  }, [filters, tick, mode]);

  const setFilter = useCallback(
    (key: keyof WorkspaceFilters, value: string) => {
      setTouched(true);
      setFilters((prev) => {
        const next: WorkspaceFilters = { ...prev, [key]: value };
        if (selectors) {
          if (key === "organizationId") {
            next.projectId = selectors.projects.find((p) => p.organizationId === value)?.id ?? "";
          }
          if (key === "organizationId" || key === "projectId") {
            next.teamId = selectors.teams.find((t) => t.projectId === next.projectId)?.id ?? "";
          }
          if (key !== "iterationId") {
            const list = selectors.teamIterations.filter((it) => it.teamId === next.teamId);
            next.iterationId = (list.find((it) => it.isCurrent) ?? list[list.length - 1])?.id ?? "";
          }
          return next;
        }
        if (key === "organizationId") {
          next.projectId = projects.find((x) => x.organizationId === value)?.id ?? prev.projectId;
        }
        if (key === "organizationId" || key === "projectId") {
          next.teamId = teams.find((x) => x.projectId === next.projectId)?.id ?? prev.teamId;
        }
        if (key !== "iterationId") {
          next.iterationId =
            iterations.find((x) => x.teamId === next.teamId)?.id ?? prev.iterationId;
        }
        return next;
      });
    },
    [selectors],
  );

  const options = useMemo<Options>(() => {
    if (!selectors) {
      return {
        organizations,
        projects: projects.filter((p) => p.organizationId === filters.organizationId),
        teams: teams.filter((t) => t.projectId === filters.projectId),
        iterations: iterations.filter((i) => i.teamId === filters.teamId),
      };
    }
    const total = realOverview?.sprint.totalWorkingDays ?? 0;
    const current = realOverview?.sprint.currentWorkingDay ?? 0;
    return {
      organizations: selectors.organizations.map((o) => ({
        id: o.id,
        name: { ar: o.nameAr, en: o.nameEn },
      })),
      projects: selectors.projects
        .filter((p) => !filters.organizationId || p.organizationId === filters.organizationId)
        .map((p) => ({
          id: p.id,
          organizationId: p.organizationId,
          name: { ar: p.nameAr, en: p.nameEn },
        })),
      teams: selectors.teams
        .filter((t) => !filters.projectId || t.projectId === filters.projectId)
        .map((t) => ({ id: t.id, projectId: t.projectId, name: { ar: t.nameAr, en: t.nameEn } })),
      iterations: selectors.teamIterations
        .filter((it) => !filters.teamId || it.teamId === filters.teamId)
        .map((it) => ({
          id: it.id,
          teamId: it.teamId,
          name: { ar: it.nameAr, en: it.nameEn },
          startDate: it.startDate ?? "",
          endDate: it.finishDate ?? "",
          currentDay: it.id === filters.iterationId ? current : 0,
          totalDays: it.id === filters.iterationId ? total : 0,
        })),
    };
  }, [selectors, filters, realOverview]);

  const mockSnapshot = useMemo(() => {
    if (mode === "real") return null;
    if (baseLoading || previewState === "loading" || previewState === "error") return null;
    const base = getDeliverySnapshot(filters);
    if (previewState === "empty") {
      return { ...base, kpis: [], risks: [], funnel: [], teamLoad: [], actions: [] };
    }
    if (previewState === "stale")
      return { ...base, freshness: "stale" as const, lastSyncMinutesAgo: 96 };
    if (previewState === "partial") {
      return { ...base, freshness: "partial" as const, actions: base.actions.slice(0, 1) };
    }
    return base;
  }, [filters, baseLoading, previewState, mode]);

  const runSync = useCallback(async () => {
    if (mode !== "real" || !filters.iterationId || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncReport(null);
    setBacklogReport(null);
    setHistoryReport(null);
    try {
      const started = await startSprintWorkItemSync({
        data: { teamIterationId: filters.iterationId },
      });
      if (!started.ok) {
        setSyncMessage(started.failure.message);
        setSyncFailed(true);
        return;
      }
      let status = started.status;
      for (let i = 0; i < MAX_SYNC_ADVANCES && status.cursor.phase !== "done"; i += 1) {
        const advanced = await advanceSprintWorkItemSync({
          data: { teamIterationId: filters.iterationId, runId: status.runId },
        });
        if (!advanced.ok) {
          setSyncMessage(advanced.failure.message);
          setSyncFailed(true);
          return;
        }
        status = advanced.status;
        if (status.status === "failed") {
          setSyncMessage(status.failure?.message ?? null);
          setSyncFailed(true);
          return;
        }
      }
      const c = status.cursor;
      setSyncFailed(false);
      setSyncReport({
        discoveredIds: c.ids.length,
        read: c.inserted + c.updated + c.unchanged,
        inserted: c.inserted,
        updated: c.updated,
        unchanged: c.unchanged,
        detached: c.removedFromSprint,
        failed: c.failed,
        truncated: c.truncated,
        capacity: c.capacity
          ? {
              members: c.capacity.members,
              configured: c.capacity.configured,
              teamDaysOff: c.capacity.teamDaysOff,
            }
          : null,
        status:
          status.status === "partial"
            ? "partial"
            : status.status === "failed"
              ? "failed"
              : "succeeded",
      });
      await queryClient.invalidateQueries({ queryKey: ["workspace", "overview"] });
      setTick((t) => t + 1);
      // The backlog follows the sprint; its outcome never changes the sprint's.
      setBacklogReport(await runBacklogSync(filters.iterationId));
      // History follows the items it describes; it never changes the sprint result.
      setHistoryReport(await runHistorySync(filters.iterationId));
      await queryClient.invalidateQueries({ queryKey: ["workspace", "overview"] });
    } finally {
      setSyncing(false);
    }
  }, [mode, filters.iterationId, syncing, queryClient]);

  const value = useMemo<Ctx>(() => {
    const realIteration = selectors?.teamIterations.find((it) => it.id === filters.iterationId);
    const snapshot = mode === "real" ? (realOverview?.snapshot ?? null) : mockSnapshot;
    const unavailable = mode === "real" ? (realOverview?.unavailable ?? {}) : {};
    const error =
      mode === "real"
        ? overviewQuery.isError || overviewQuery.data?.ok === false
        : previewState === "error";

    const dataState: RealDataState = (() => {
      if (mode !== "real") return snapshot?.freshness === "stale" ? "stale" : "current";
      if (syncing) return "syncing";
      if (error || syncFailed) return "failed";
      if (unavailable["workItems"]) return "notSynced";
      if (syncReport?.status === "partial" || syncReport?.failed) return "partial";
      if (snapshot?.freshness === "stale") return "stale";
      if (snapshot?.freshness === "partial") return "partial";
      return "current";
    })();

    return {
      mode,
      filters,
      previewState,
      setPreviewState,
      setFilter,
      snapshot,
      iteration:
        mode === "real"
          ? realIteration
            ? {
                id: realIteration.id,
                teamId: realIteration.teamId,
                name: { ar: realIteration.nameAr, en: realIteration.nameEn },
                startDate: realIteration.startDate ?? "",
                endDate: realIteration.finishDate ?? "",
                currentDay: realOverview?.sprint.currentWorkingDay ?? 0,
                totalDays: realOverview?.sprint.totalWorkingDays ?? 0,
              }
            : undefined
          : getIteration(filters.iterationId),
      loading:
        mode === "real"
          ? selectorsQuery.isLoading || overviewQuery.isLoading || !realSelectionReady
          : previewState === "loading" || baseLoading,
      error,
      refresh: () => setTick((t) => t + 1),
      unavailable,
      syncing,
      syncMessage,
      runSync: () => {
        void runSync();
      },
      options,
      dataState,
      syncReport,
      backlogReport,
      historyReport,
      sprintDatesUnavailable: mode === "real" && Boolean(unavailable["sprintCalendar"]),
    };
  }, [
    mode,
    filters,
    previewState,
    setFilter,
    realOverview,
    mockSnapshot,
    selectors,
    selectorsQuery.isLoading,
    overviewQuery.isLoading,
    overviewQuery.isError,
    overviewQuery.data,
    realSelectionReady,
    baseLoading,
    syncing,
    syncMessage,
    runSync,
    options,
    syncReport,
    backlogReport,
    historyReport,
    syncFailed,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
