import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AzureDevOpsClient } from "../client.server";
import { advanceFoundationJob, cancelFoundationJob, startFoundationJob } from "../job.server";
import type { JobState } from "../job-rules";
import type { TeamReadResult } from "../teams.server";

const enabled = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);
const integration = enabled ? describe : describe.skip;
const tenantId = crypto.randomUUID();
const organizationName = `teams-persistence-${tenantId.slice(0, 8)}`;
const projectSizes = [2, 1, 2, 2] as const;
let organizationId = "";
let projectRows: { id: string; azure_project_id: string }[] = [];

const client = new AzureDevOpsClient({
  organization: organizationName,
  pat: "integration-test-only",
  fetchImpl: async (input) => {
    const url = String(input);
    if (url.includes("teamfieldvalues")) {
      return Response.json({ values: [{ value: "Area" }] });
    }
    if (url.includes("teamsettings")) {
      return Response.json({ defaultIteration: { path: "Sprint 1" } });
    }
    return Response.json({ value: [] });
  },
  maxRetries: 0,
});

const teamReader = async ({
  azureProjectId,
}: {
  azureProjectId: string;
}): Promise<TeamReadResult> => {
  const index = projectRows.findIndex((project) => project.azure_project_id === azureProjectId);
  const count = projectSizes[index] ?? 0;
  return {
    status: "complete",
    azureProjectId,
    teams: Array.from({ length: count }, (_, teamIndex) => ({
      azureTeamId: `${azureProjectId}-team-${teamIndex}`,
      name: `Team ${index + 1}.${teamIndex + 1}`,
      description: null,
    })),
    teamCount: count,
    pagesFetched: 1,
    elapsedMs: 1,
    httpStatus: 200,
    warning: null,
    error: null,
  };
};

async function seedTeamsCursor(runId: string, startedAt: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("ops_sync_runs")
    .select("details")
    .eq("tenant_id", tenantId)
    .eq("id", runId)
    .single();
  if (error || !data) throw error ?? new Error("Missing integration run");
  const details = data.details as unknown as JobState;
  const next: JobState = {
    ...details,
    status: "running",
    startedAt,
    cursor: { domain: "teams", index: 0 },
    domains: {
      ...details.domains,
      organization: {
        ...details.domains.organization,
        discovered: 1,
        unchanged: 1,
        complete: true,
      },
      projects: { ...details.domains.projects, discovered: 4, unchanged: 4, complete: true },
    },
    scannedDomains: ["organization", "projects"],
    scopes: {},
  };
  const { error: updateError } = await supabaseAdmin
    .from("ops_sync_runs")
    .update({ status: "running", details: next as never })
    .eq("tenant_id", tenantId)
    .eq("id", runId);
  if (updateError) throw updateError;
}

async function executeTeamsStage() {
  const started = await startFoundationJob({ tenantId, actorUserId: null, organizationName });
  await seedTeamsCursor(started.state.runId, started.state.startedAt);
  let reloaded: JobState | null = null;
  for (let unit = 0; unit < 4; unit += 1) {
    await advanceFoundationJob(tenantId, started.state.runId, client, 60_000, {
      maxUnits: 1,
      stopAfterDomain: "teams",
      readTeams: teamReader as never,
    });
    const { data, error } = await supabaseAdmin
      .from("ops_sync_runs")
      .select("details")
      .eq("tenant_id", tenantId)
      .eq("id", started.state.runId)
      .single();
    if (error || !data) throw error ?? new Error("Missing checkpoint");
    reloaded = data.details as unknown as JobState;
  }
  if (!reloaded) throw new Error("No persisted state");
  return reloaded;
}

integration.sequential("Teams persisted finalization", () => {
  beforeAll(async () => {
    const { error: tenantError } = await supabaseAdmin.from("core_tenants").insert({
      id: tenantId,
      slug: `teams-test-${tenantId.slice(0, 8)}`,
      name_en: "Teams persistence test",
      name_ar: "Teams persistence test",
      is_demo: true,
    });
    if (tenantError) throw tenantError;
    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("core_organizations")
      .insert({
        tenant_id: tenantId,
        azure_organization_name: organizationName,
        base_url: `https://dev.azure.com/${organizationName}`,
        name_en: organizationName,
        name_ar: organizationName,
      })
      .select("id")
      .single();
    if (organizationError || !organization)
      throw organizationError ?? new Error("Missing organization");
    organizationId = organization.id;
    const { data: projects, error: projectsError } = await supabaseAdmin
      .from("core_projects")
      .insert(
        projectSizes.map((_, index) => ({
          tenant_id: tenantId,
          organization_id: organizationId,
          azure_project_id: `project-${index + 1}`,
          azure_project_name: `Project ${index + 1}`,
          name_en: `Project ${index + 1}`,
          name_ar: `Project ${index + 1}`,
        })),
      )
      .select("id, azure_project_id");
    if (projectsError || !projects) throw projectsError ?? new Error("Missing projects");
    projectRows = projects.sort((a, b) => a.id.localeCompare(b.id));
  });

  afterAll(async () => {
    await supabaseAdmin.from("core_tenants").delete().eq("id", tenantId);
  });

  it("reloads after every unit, finalizes 4/4 scopes, and is idempotent", async () => {
    const first = await executeTeamsStage();
    expect(first.domains.teams).toMatchObject({
      complete: true,
      discovered: 7,
      inserted: 7,
      updated: 0,
      unchanged: 0,
      failed: 0,
    });
    expect(first.scopes?.teams).toEqual({
      expected: 4,
      attempted: 4,
      completed: 4,
      failed: 0,
      remainingContinuationTokens: 0,
    });
    expect(first.cursor?.domain).toBe("iterations");
    const { data: firstRows } = await supabaseAdmin
      .from("core_teams")
      .select("azure_team_id, id")
      .eq("tenant_id", tenantId)
      .order("azure_team_id");
    await cancelFoundationJob(tenantId, first.runId);

    const second = await executeTeamsStage();
    expect(second.domains.teams).toMatchObject({
      complete: true,
      discovered: 7,
      inserted: 0,
      updated: 0,
      unchanged: 7,
      failed: 0,
    });
    const { data: secondRows } = await supabaseAdmin
      .from("core_teams")
      .select("azure_team_id, id")
      .eq("tenant_id", tenantId)
      .order("azure_team_id");
    expect(secondRows).toEqual(firstRows);
    await cancelFoundationJob(tenantId, second.runId);
  }, 30_000);
});
