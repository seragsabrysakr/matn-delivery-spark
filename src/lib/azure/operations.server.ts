/** Server-only implementations behind the Azure DevOps server functions. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsClient, hasAzureSecrets } from "./client.server";
import {
  OUTCOME_TO_CODE,
  VALIDATION_DEADLINE_MS,
  normalizeOrganization,
  validateAzureOrganization,
  type ValidationDiagnostic,
} from "./validate.server";
import { AzureDevOpsError, toAzureFailure } from "./errors";
import {
  assertCanReadSyncStatus,
  assertCanRunSync,
  canRunSync,
  resolveTenantContext,
  writeAudit,
  type TenantContext,
} from "./authz.server";
import { ensureConnection, ensureOrganization } from "./sync.server";
import { discoverAzureProjectsBounded } from "./discovery.server";
import type { JobState } from "./job-rules";
import type {
  ConnectionStatus,
  ConnectionValidationResult,
  ProjectDiscoveryResult,
  SyncDomain,
  SyncRunReport,
  SyncStatusResult,
} from "./contracts";

const organizationName = (): string | null =>
  normalizeOrganization(process.env["AZURE_DEVOPS_ORGANIZATION"]);

async function context(authUserId: string, tenantId: string | null): Promise<TenantContext> {
  return resolveTenantContext(authUserId, tenantId);
}

export async function readSyncStatus(
  authUserId: string,
  tenantId: string | null,
): Promise<SyncStatusResult> {
  const ctx = await context(authUserId, tenantId);
  assertCanReadSyncStatus(ctx);
  const org = organizationName();
  const configured = hasAzureSecrets();

  const { data: connection } = await supabaseAdmin
    .from("ops_sync_connections")
    .select("id, status, status_message, last_verified_at, organization_id")
    .eq("tenant_id", ctx.tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: activeLock } = await supabaseAdmin
    .from("ops_sync_locks")
    .select("run_id, acquired_at")
    .eq("tenant_id", ctx.tenantId)
    .is("released_at", null)
    .limit(1)
    .maybeSingle();

  const { data: lastRun } = await supabaseAdmin
    .from("ops_sync_runs")
    .select("details")
    .eq("tenant_id", ctx.tenantId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const report = (lastRun?.details ?? null) as SyncRunReport | null;
  const freshness: Partial<Record<SyncDomain, string | null>> = {};
  if (report?.domains) {
    for (const [domain, counts] of Object.entries(report.domains)) {
      freshness[domain as SyncDomain] = counts.freshnessAt;
    }
  }

  return {
    configured,
    organization: org,
    connectionStatus: (connection?.status ??
      (configured ? "pending" : "unconfigured")) as ConnectionStatus,
    lastVerifiedAt: connection?.last_verified_at ?? null,
    statusMessage: connection?.status_message ?? null,
    activeRun: activeLock?.run_id
      ? { runId: activeLock.run_id, startedAt: activeLock.acquired_at ?? null }
      : null,
    lastRun: report && typeof report === "object" && "runId" in report ? report : null,
    freshness,
    canValidate: canRunSync(ctx) && configured,
    canSync: canRunSync(ctx) && configured,
  };
}

export async function validateConnection(
  authUserId: string,
  tenantId: string | null,
): Promise<ConnectionValidationResult> {
  const ctx = await context(authUserId, tenantId);
  assertCanRunSync(ctx);
  const checkedAt = new Date().toISOString();
  const org = organizationName();

  if (!hasAzureSecrets() || !org) {
    const code =
      org === null && process.env["AZURE_DEVOPS_ORGANIZATION"]?.trim()
        ? "invalid_configuration"
        : "missing_configuration";
    await writeAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.coreUserId,
      action: "azure.connection.validate",
      entityType: "sync_connection",
      outcome: "failure",
      metadata: { code },
    });
    return {
      connected: false,
      status: "unconfigured",
      organization: null,
      accessibleProjectCount: null,
      checkedAt,
      error: new AzureDevOpsError(code).toFailure(),
      diagnostic: {
        outcome:
          code === "invalid_configuration" ? "invalid_configuration" : "missing_configuration",
        stage: "configuration",
        elapsedMs: 0,
        httpStatus: null,
        projectCount: null,
      },
    };
  }

  const organizationId = await ensureOrganization(ctx.tenantId, org, checkedAt);
  const connectionId = await ensureConnection(ctx.tenantId, organizationId);

  const startedAt = Date.now();
  // The outer deadline is strictly longer than the fetch timeout, so the
  // wrapper can never terminate before the request itself times out.
  const deadline = new Promise<ValidationDiagnostic>((resolve) =>
    setTimeout(
      () =>
        resolve({
          outcome: "request_timeout",
          stage: "server_deadline",
          elapsedMs: Date.now() - startedAt,
          httpStatus: null,
          projectCount: null,
        }),
      VALIDATION_DEADLINE_MS,
    ),
  );

  const diagnostic = await Promise.race([
    validateAzureOrganization({
      organization: org,
      pat: process.env["AZURE_DEVOPS_PAT"] ?? null,
    }),
    deadline,
  ]);

  const connected = diagnostic.outcome === "connected";
  const code = OUTCOME_TO_CODE[diagnostic.outcome];

  await supabaseAdmin
    .from("ops_sync_connections")
    .update({
      status: connected ? "connected" : "error",
      status_message: connected ? null : (code ?? "unknown"),
      last_verified_at: checkedAt,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", connectionId);

  await writeAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.coreUserId,
    action: "azure.connection.validate",
    entityType: "sync_connection",
    entityId: connectionId,
    outcome: connected ? "success" : "failure",
    metadata: {
      outcome: diagnostic.outcome,
      stage: diagnostic.stage,
      elapsedMs: diagnostic.elapsedMs,
      httpStatus: diagnostic.httpStatus,
    },
  });

  return {
    connected,
    status: connected ? "connected" : "error",
    organization: org,
    accessibleProjectCount: diagnostic.projectCount,
    checkedAt,
    error: code
      ? new AzureDevOpsError(code, { httpStatus: diagnostic.httpStatus }).toFailure()
      : null,
    diagnostic,
  };
}

export async function discoverProjects(
  authUserId: string,
  tenantId: string | null,
): Promise<ProjectDiscoveryResult> {
  const ctx = await context(authUserId, tenantId);
  assertCanRunSync(ctx);
  const result = await discoverAzureProjectsBounded({
    organization: process.env["AZURE_DEVOPS_ORGANIZATION"] ?? null,
    pat: process.env["AZURE_DEVOPS_PAT"] ?? null,
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.coreUserId,
    action: "azure.projects.discover",
    entityType: "project",
    outcome: result.status === "failed" ? "failure" : "success",
    metadata: {
      status: result.status,
      count: result.projectCount,
      pages: result.pagesFetched,
      elapsedMs: result.elapsedMs,
      warning: result.warning,
    },
  });
  return result;
}

export async function startFoundationSync(
  authUserId: string,
  tenantId: string | null,
): Promise<JobState> {
  const ctx = await context(authUserId, tenantId);
  assertCanRunSync(ctx);
  const org = organizationName();
  if (!hasAzureSecrets() || !org) throw new AzureDevOpsError("not_configured");

  const { startFoundationJob } = await import("./job.server");
  const { state, reused } = await startFoundationJob({
    tenantId: ctx.tenantId,
    actorUserId: ctx.coreUserId,
    organizationName: org,
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.coreUserId,
    action: "azure.sync.foundation.start",
    entityType: "sync_run",
    entityId: state.runId,
    outcome: reused ? "noop" : "success",
    correlationId: state.runId,
    metadata: { status: state.status, reused },
  });

  return state;
}

/** Advances an active run by one bounded slice; safe to call repeatedly. */
export async function advanceFoundationSync(
  authUserId: string,
  tenantId: string | null,
  runId: string,
): Promise<JobState> {
  const ctx = await context(authUserId, tenantId);
  assertCanRunSync(ctx);
  if (!hasAzureSecrets()) throw new AzureDevOpsError("not_configured");
  const { advanceFoundationJob } = await import("./job.server");
  return advanceFoundationJob(ctx.tenantId, runId, AzureDevOpsClient.fromEnvironment());
}

/** Cancels an active run and frees its lock. */
export async function cancelFoundationSync(
  authUserId: string,
  tenantId: string | null,
  runId: string,
): Promise<void> {
  const ctx = await context(authUserId, tenantId);
  assertCanRunSync(ctx);
  const { cancelFoundationJob } = await import("./job.server");
  await cancelFoundationJob(ctx.tenantId, runId);
  await writeAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.coreUserId,
    action: "azure.sync.foundation.cancel",
    entityType: "sync_run",
    entityId: runId,
    outcome: "success",
    correlationId: runId,
  });
}
