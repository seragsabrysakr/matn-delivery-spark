import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const teamIterationInput = z.object({ teamIterationId: uuid, tenantId: uuid.optional() }).strict();

/** Tenant-scoped selector options plus the server-resolved current sprint. */
export const getWorkspaceSelectors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { loadWorkspaceSelectors } = await import("./context.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId);
      return { ok: true as const, selectors: await loadWorkspaceSelectors(tenant) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Real, deterministic Overview payload for one validated team iteration. */
export const getRealOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { buildRealOverview } = await import("@/lib/overview/overview.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, overview: await buildRealOverview(target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Starts (or rejoins) the resumable current-sprint work item sync. */
export const startSprintWorkItemSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanRunSync, writeAudit } =
      await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { startWorkItemSync } = await import("@/lib/azure/work-item-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanRunSync(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      const status = await startWorkItemSync(target, tenant.coreUserId);
      await writeAudit({
        tenantId: tenant.tenantId,
        actorUserId: tenant.coreUserId,
        action: "azure.work_items.sync.start",
        entityType: "core_team_iterations",
        entityId: target.teamIterationId,
        outcome: "success",
      });
      return { ok: true as const, status };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Performs one bounded, checkpointed slice of the sync. Call until done. */
export const advanceSprintWorkItemSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ teamIterationId: uuid, runId: uuid, tenantId: uuid.optional() })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanRunSync } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { advanceWorkItemSync } = await import("@/lib/azure/work-item-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanRunSync(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, status: await advanceWorkItemSync(data.runId, target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

export const getSprintWorkItemSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanReadSyncStatus } =
      await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { getWorkItemSyncStatus } = await import("@/lib/azure/work-item-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanReadSyncStatus(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, status: await getWorkItemSyncStatus(target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/**
 * Starts (or rejoins) the resumable backlog sync for the selected sprint's
 * project: open items in the teams' areas, regardless of iteration.
 */
export const startBacklogWorkItemSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanRunSync, writeAudit } =
      await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { startBacklogSync } = await import("@/lib/azure/backlog-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanRunSync(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      const status = await startBacklogSync(target, tenant.coreUserId);
      await writeAudit({
        tenantId: tenant.tenantId,
        actorUserId: tenant.coreUserId,
        action: "azure.backlog.sync.start",
        entityType: "core_projects",
        entityId: target.projectId,
        outcome: "success",
      });
      return { ok: true as const, status };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Performs one bounded, checkpointed slice of the backlog sync. Call until done. */
export const advanceBacklogWorkItemSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ teamIterationId: uuid, runId: uuid, tenantId: uuid.optional() })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanRunSync } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { advanceBacklogSync } = await import("@/lib/azure/backlog-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanRunSync(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, status: await advanceBacklogSync(data.runId, target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Starts (or rejoins) the resumable revision-history sync for the sprint's project. */
export const startHistoryWorkItemSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanRunSync, writeAudit } =
      await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { startHistorySync } = await import("@/lib/azure/history-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanRunSync(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      const status = await startHistorySync(target, tenant.coreUserId);
      await writeAudit({
        tenantId: tenant.tenantId,
        actorUserId: tenant.coreUserId,
        action: "azure.history.sync.start",
        entityType: "core_projects",
        entityId: target.projectId,
        outcome: "success",
      });
      return { ok: true as const, status };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Performs one bounded, checkpointed slice of the history sync. Call until done. */
export const advanceHistoryWorkItemSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ teamIterationId: uuid, runId: uuid, tenantId: uuid.optional() })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, assertCanRunSync } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { advanceHistorySync } = await import("@/lib/azure/history-sync.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      assertCanRunSync(tenant);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, status: await advanceHistorySync(data.runId, target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Sprint history of the selected sprint's team, from revision history (ADR-018). */
export const getSprintHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { buildSprintHistory } = await import("@/lib/delivery/sprint-history.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, history: await buildSprintHistory(target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Real, tenant-scoped Team page payload for one validated team iteration. */
export const getRealTeamPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { buildTeamPage } = await import("@/lib/team/team.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, team: await buildTeamPage(tenant, target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Delivery schedule of the selected sprint's project (ADR-021). */
export const getDeliverySchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { buildDeliverySchedule } = await import("@/lib/delivery/deliverables.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, schedule: await buildDeliverySchedule(tenant, target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Saves how the project's deliverables are found in Azure. Delivery managers and admins. */
export const saveDeliveryMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        teamIterationId: uuid,
        tenantId: uuid.optional(),
        mode: z.enum(["work_item_type", "tag", "area_path", "saved_query"]),
        value: z.string().min(1).max(400),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { saveDeliveryMapping: save } = await import("@/lib/delivery/deliverables.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      await save(tenant, target, { mode: data.mode, value: data.value });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Starts (or rejoins) the resumable deliverables refresh for the project. */
export const startDeliveryRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext, writeAudit } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { canManageDelivery } = await import("@/lib/delivery/deliverables.server");
    const { startDeliverySync } = await import("@/lib/delivery/delivery-sync.server");
    const { AzureDevOpsError, toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      if (!canManageDelivery(tenant)) throw new AzureDevOpsError("forbidden");
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      const status = await startDeliverySync(target, tenant.coreUserId);
      await writeAudit({
        tenantId: tenant.tenantId,
        actorUserId: tenant.coreUserId,
        action: "delivery.refresh.start",
        entityType: "core_projects",
        entityId: target.projectId,
        outcome: "success",
      });
      return { ok: true as const, status };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** One bounded, checkpointed slice of the deliverables refresh. Call until done. */
export const advanceDeliveryRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ teamIterationId: uuid, runId: uuid, tenantId: uuid.optional() })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { canManageDelivery } = await import("@/lib/delivery/deliverables.server");
    const { advanceDeliverySync } = await import("@/lib/delivery/delivery-sync.server");
    const { AzureDevOpsError, toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      if (!canManageDelivery(tenant)) throw new AzureDevOpsError("forbidden");
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, status: await advanceDeliverySync(data.runId, target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Confirms or changes a deliverable's committed date, with a required reason. */
export const setDeliverableCommittedDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        teamIterationId: uuid,
        tenantId: uuid.optional(),
        deliverableId: uuid,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { setCommittedDate } = await import("@/lib/delivery/deliverables.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      await setCommittedDate(tenant, target, {
        deliverableId: data.deliverableId,
        date: data.date,
        reason: data.reason,
      });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Client visibility and notes of a deliverable. */
export const updateDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        teamIterationId: uuid,
        tenantId: uuid.optional(),
        deliverableId: uuid,
        clientVisible: z.boolean().optional(),
        notes: z.string().max(4000).nullable().optional(),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { updateDeliverableDetails } = await import("@/lib/delivery/deliverables.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      await updateDeliverableDetails(tenant, target, {
        deliverableId: data.deliverableId,
        clientVisible: data.clientVisible,
        notes: data.notes,
      });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** The selected sprint's project as a work item tree with roll-ups (ADR-024). */
export const getProjectHierarchy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { buildProjectHierarchy } = await import("@/lib/hierarchy/hierarchy.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, hierarchy: await buildProjectHierarchy(target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** The team's Azure board for the selected sprint, with aging and stuck cards (ADR-025). */
export const getSprintBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => teamIterationInput.parse(data))
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { requireTeamIteration } = await import("./context.server");
    const { buildSprintBoardPayload } = await import("@/lib/board/board.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      const target = await requireTeamIteration(tenant, data.teamIterationId);
      return { ok: true as const, board: await buildSprintBoardPayload(target) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });

/** Stuck work across every team the user can see (ADR-025). */
export const getStuckWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ tenantId: uuid.optional() })
      .strict()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { resolveTenantContext } = await import("@/lib/azure/authz.server");
    const { buildStuckAcrossTeams } = await import("@/lib/board/board.server");
    const { toAzureFailure } = await import("@/lib/azure/errors");
    try {
      const tenant = await resolveTenantContext(context.userId, data.tenantId ?? null);
      return { ok: true as const, stuck: await buildStuckAcrossTeams(tenant) };
    } catch (error) {
      return { ok: false as const, failure: toAzureFailure(error) };
    }
  });
