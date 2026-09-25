/**
 * Server-only Azure DevOps project discovery.
 *
 * Bounded by design: at most 5 pages, 500 projects, a 30s timeout per request
 * and a 50s total operation deadline. No retry for 400/401/403/404/abort; at
 * most one retry for 429/502/503/504. A later-page failure returns the pages
 * already fetched as a `partial` result instead of failing the operation.
 *
 * Never returns provider bodies, headers, credentials or stack traces.
 */
import { AzureDevOpsError, type AzureErrorCode } from "./errors";
import { normalizeOrganization } from "./validate.server";
import type { DiscoveredProject, ProjectDiscoveryResult } from "./contracts";

export const DISCOVERY_MAX_PAGES = 5;
export const DISCOVERY_MAX_PROJECTS = 500;
export const DISCOVERY_PAGE_SIZE = 100;
export const DISCOVERY_REQUEST_TIMEOUT_MS = 30_000;
export const DISCOVERY_DEADLINE_MS = 50_000;

const RETRY_ONCE = new Set([429, 502, 503, 504]);

export interface DiscoveryOptions {
  readonly organization: string | null | undefined;
  readonly pat: string | null | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly deadlineMs?: number;
  readonly maxPages?: number;
  readonly maxProjects?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface RawProject {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
  readonly state?: unknown;
  readonly visibility?: unknown;
  readonly lastUpdateTime?: unknown;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Projects the wire payload down to the six safe fields. */
export function sanitizeProject(raw: RawProject): DiscoveredProject | null {
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return {
    azureProjectId: id,
    name,
    description: str(raw.description),
    state: str(raw.state) ?? "unknown",
    visibility: str(raw.visibility),
    lastUpdateTime: str(raw.lastUpdateTime),
  };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const statusToWarning = (status: number): AzureErrorCode => {
  if (status === 401 || status === 203) return "invalid_credentials";
  if (status === 403) return "insufficient_permissions";
  if (status === 404) return "organization_not_found";
  if (status === 400) return "invalid_configuration";
  if (status === 429) return "throttled";
  return "provider_unavailable";
};

/** Discovers projects with hard page, item and time ceilings. */
export async function discoverAzureProjectsBounded(
  options: DiscoveryOptions,
): Promise<ProjectDiscoveryResult> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const elapsed = () => Math.max(0, Math.round(now() - startedAt));
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DISCOVERY_REQUEST_TIMEOUT_MS;
  const deadlineMs = options.deadlineMs ?? DISCOVERY_DEADLINE_MS;
  const maxPages = options.maxPages ?? DISCOVERY_MAX_PAGES;
  const maxProjects = options.maxProjects ?? DISCOVERY_MAX_PROJECTS;

  const projects: DiscoveredProject[] = [];
  let pagesFetched = 0;

  const result = (
    status: ProjectDiscoveryResult["status"],
    warning: AzureErrorCode | null,
  ): ProjectDiscoveryResult => ({
    status,
    projects: [...projects],
    projectCount: projects.length,
    pagesFetched,
    elapsedMs: elapsed(),
    warning,
    error: warning && status === "failed" ? new AzureDevOpsError(warning).toFailure() : null,
  });

  const pat = (options.pat ?? "").trim();
  const organization = normalizeOrganization(options.organization);
  if (!pat || !(options.organization ?? "").trim())
    return result("failed", "missing_configuration");
  if (!organization) return result("failed", "invalid_configuration");

  const authorization = `Basic ${btoa(`:${pat}`)}`;
  const base = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?api-version=7.1&$top=${DISCOVERY_PAGE_SIZE}`;
  let continuationToken: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    if (elapsed() >= deadlineMs) {
      return result(projects.length > 0 ? "partial" : "failed", "request_timeout");
    }

    const url = continuationToken
      ? `${base}&continuationToken=${encodeURIComponent(continuationToken)}`
      : base;

    let outcome:
      | { kind: "ok"; body: unknown; token: string | null }
      | { kind: "error"; warning: AzureErrorCode }
      | null = null;

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { authorization, accept: "application/json" },
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        const name = error instanceof Error ? error.name : "";
        // Aborts are our own timeout and are never retried.
        outcome = {
          kind: "error",
          warning:
            name === "AbortError" || name === "TimeoutError" || controller.signal.aborted
              ? "request_timeout"
              : "network_unreachable",
        };
        break;
      } finally {
        clearTimeout(timer);
      }

      const status = response.status;
      if (status === 200) {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          outcome = { kind: "error", warning: "invalid_credentials" };
          break;
        }
        try {
          const body = await response.json();
          outcome = { kind: "ok", body, token: response.headers.get("x-ms-continuationtoken") };
        } catch {
          outcome = { kind: "error", warning: "provider_unavailable" };
        }
        break;
      }

      if (RETRY_ONCE.has(status) && attempt === 0 && elapsed() < deadlineMs - 2_000) {
        await sleep(1_000);
        continue;
      }
      outcome = { kind: "error", warning: statusToWarning(status) };
      break;
    }

    if (!outcome || outcome.kind === "error") {
      const warning = outcome?.warning ?? "unknown";
      return result(projects.length > 0 ? "partial" : "failed", warning);
    }

    pagesFetched += 1;
    const value = (outcome.body as { value?: unknown })?.value;
    const rows = Array.isArray(value) ? value : [];
    for (const row of rows) {
      if (projects.length >= maxProjects) return result("partial", "provider_unavailable");
      const project = sanitizeProject((row ?? {}) as RawProject);
      if (project) projects.push(project);
    }

    const bodyToken = (outcome.body as { continuationToken?: unknown })?.continuationToken;
    continuationToken =
      outcome.token || (typeof bodyToken === "string" && bodyToken ? bodyToken : null);
    if (!continuationToken) return result("complete", null);
  }

  // Page ceiling reached with more data still available.
  return result("partial", "provider_unavailable");
}
