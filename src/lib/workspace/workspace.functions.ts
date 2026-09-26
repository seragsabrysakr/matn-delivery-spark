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
