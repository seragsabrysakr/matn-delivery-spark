/**
 * Server-only, bounded Azure DevOps team reader.
 *
 * One project at a time, addressed by its **Azure project id** (never its name):
 *   GET /_apis/projects/{projectId}/teams?api-version=7.1&$top=100
 *
 * Bounded by design: at most 5 pages and 500 teams per project, a 30s timeout
 * per request, one retry only for 429/502/503/504 and no retry for
 * 400/401/403/404/AbortError. Pages already fetched are preserved as a
 * `partial` result instead of discarding the whole project.
 *
 * Never returns provider bodies, headers, credentials or stack traces.
 */
import { AzureDevOpsError, type AzureErrorCode } from "./errors";
import { normalizeOrganization } from "./validate.server";
import type { AzureFailure } from "./errors";

export const TEAMS_MAX_PAGES = 5;
export const TEAMS_MAX_PER_PROJECT = 500;
export const TEAMS_PAGE_SIZE = 100;
export const TEAMS_REQUEST_TIMEOUT_MS = 30_000;

const RETRY_ONCE = new Set([429, 502, 503, 504]);

export interface DiscoveredTeam {
  readonly azureTeamId: string;
  readonly name: string;
  readonly description: string | null;
}

export type TeamReadStatus = "complete" | "partial" | "failed";

export interface TeamReadResult {
  readonly status: TeamReadStatus;
  readonly azureProjectId: string;
  readonly teams: readonly DiscoveredTeam[];
  readonly teamCount: number;
  readonly pagesFetched: number;
  readonly elapsedMs: number;
  readonly httpStatus: number | null;
  readonly warning: AzureErrorCode | null;
  readonly error: AzureFailure | null;
}

export interface TeamReadOptions {
  readonly organization: string | null | undefined;
  readonly pat: string | null | undefined;
  readonly azureProjectId: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxPages?: number;
  readonly maxTeams?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface RawTeam {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export function sanitizeTeam(raw: RawTeam): DiscoveredTeam | null {
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  return { azureTeamId: id, name, description: str(raw.description) };
}

const statusToWarning = (status: number): AzureErrorCode => {
  if (status === 401 || status === 203) return "invalid_credentials";
  if (status === 403) return "insufficient_permissions";
  if (status === 404) return "organization_not_found";
  if (status === 400) return "invalid_configuration";
  if (status === 429) return "throttled";
  return "provider_unavailable";
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Reads every team of one project, bounded and sanitized. */
export async function readProjectTeams(options: TeamReadOptions): Promise<TeamReadResult> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const elapsed = () => Math.max(0, Math.round(now() - startedAt));
  // Bind the global so the call never relies on an implicit receiver: an
  // unbound `fetch` reference throws "Illegal invocation" in the worker runtime.
  const fetchImpl =
    options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? TEAMS_REQUEST_TIMEOUT_MS;
  const maxPages = options.maxPages ?? TEAMS_MAX_PAGES;
  const maxTeams = options.maxTeams ?? TEAMS_MAX_PER_PROJECT;

  const teams: DiscoveredTeam[] = [];
  let pagesFetched = 0;
  let lastHttpStatus: number | null = null;

  const result = (status: TeamReadStatus, warning: AzureErrorCode | null): TeamReadResult => ({
    status,
    azureProjectId: options.azureProjectId,
    teams: [...teams],
    teamCount: teams.length,
    pagesFetched,
    elapsedMs: elapsed(),
    httpStatus: lastHttpStatus,
    warning,
    error: warning
      ? new AzureDevOpsError(warning, { httpStatus: lastHttpStatus }).toFailure()
      : null,
  });

  const pat = (options.pat ?? "").trim();
  const organization = normalizeOrganization(options.organization);
  if (!pat || !(options.organization ?? "").trim())
    return result("failed", "missing_configuration");
  if (!organization) return result("failed", "invalid_configuration");
  if (!options.azureProjectId) return result("failed", "invalid_configuration");

  const authorization = `Basic ${btoa(`:${pat}`)}`;
  const base =
    `https://dev.azure.com/${encodeURIComponent(organization)}` +
    `/_apis/projects/${encodeURIComponent(options.azureProjectId)}/teams` +
    `?api-version=7.1&$top=${TEAMS_PAGE_SIZE}`;

  for (let page = 0; page < maxPages; page += 1) {
    const url = page === 0 ? base : `${base}&$skip=${page * TEAMS_PAGE_SIZE}`;
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

      lastHttpStatus = response.status;
      if (response.status === 200) {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("json")) {
          outcome = { kind: "error", warning: "invalid_credentials" };
          break;
        }
        try {
          outcome = {
            kind: "ok",
            body: await response.json(),
            token: response.headers.get("x-ms-continuationtoken"),
          };
        } catch {
          outcome = { kind: "error", warning: "provider_unavailable" };
        }
        break;
      }

      if (RETRY_ONCE.has(response.status) && attempt === 0) {
        await sleep(1_000);
        continue;
      }
      outcome = { kind: "error", warning: statusToWarning(response.status) };
      break;
    }

    if (!outcome || outcome.kind === "error") {
      const warning = outcome?.warning ?? "unknown";
      return result(teams.length > 0 ? "partial" : "failed", warning);
    }

    pagesFetched += 1;
    const value = (outcome.body as { value?: unknown })?.value;
    const rows = Array.isArray(value) ? value : [];
    for (const row of rows) {
      if (teams.length >= maxTeams) return result("partial", "provider_unavailable");
      const team = sanitizeTeam((row ?? {}) as RawTeam);
      if (team) teams.push(team);
    }

    const bodyToken = (outcome.body as { continuationToken?: unknown })?.continuationToken;
    const hasToken =
      Boolean(outcome.token) || (typeof bodyToken === "string" && bodyToken.length > 0);
    // The teams endpoint pages with $skip; a short page means the end.
    if (!hasToken && rows.length < TEAMS_PAGE_SIZE) return result("complete", null);
  }

  return result("partial", "provider_unavailable");
}
