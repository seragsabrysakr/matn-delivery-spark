/**
 * Server-only Azure DevOps REST client.
 *
 * The PAT is read from the server environment inside the constructor factory,
 * never at module scope, never returned, never logged.
 */
import { AzureDevOpsError, statusToCode } from "./errors";
import { isAllowedReadPostKind, type AzureReadPostKind } from "./wiql";

import type {
  AzureIteration,
  AzureListResponse,
  AzureIdentityRef,
  AzureProject,
  AzureTeam,
  AzureTeamFieldValues,
  AzureTeamSettings,
} from "@/types/azure";

const API_VERSION = "7.1";
const RETRYABLE = new Set([429, 502, 503, 504]);

export interface AzureClientOptions {
  readonly organization: string;
  readonly pat: string;
  readonly timeoutMs?: number;
  readonly maxPages?: number;
  readonly maxRetries?: number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

export interface AzureRequestOptions {
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly apiVersion?: string;
  readonly baseUrl?: string;
  readonly signal?: AbortSignal | undefined;
}

/** Reads the two required secrets. Throws a sanitized `not_configured`. */
export function readAzureSecrets(): { organization: string; pat: string } {
  const organization = process.env["AZURE_DEVOPS_ORGANIZATION"]?.trim();
  const pat = process.env["AZURE_DEVOPS_PAT"]?.trim();
  if (!organization || !pat) throw new AzureDevOpsError("not_configured");
  return { organization, pat };
}

export function hasAzureSecrets(): boolean {
  return Boolean(
    process.env["AZURE_DEVOPS_ORGANIZATION"]?.trim() && process.env["AZURE_DEVOPS_PAT"]?.trim(),
  );
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AzureDevOpsClient {
  readonly organization: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly maxPages: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: AzureClientOptions) {
    this.organization = options.organization;
    this.authHeader = `Basic ${btoa(`:${options.pat}`)}`;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxPages = options.maxPages ?? 50;
    this.maxRetries = options.maxRetries ?? 3;
    // Bind the global: an unbound `fetch` reference throws "Illegal invocation"
    // in the deployed worker runtime, which surfaced as a generic timeout.
    this.fetchImpl =
      options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  static fromEnvironment(overrides: Partial<AzureClientOptions> = {}): AzureDevOpsClient {
    const { organization, pat } = readAzureSecrets();
    return new AzureDevOpsClient({ organization, pat, ...overrides });
  }

  private buildUrl(path: string, options: AzureRequestOptions, continuationToken?: string): string {
    const base =
      options.baseUrl ?? `https://dev.azure.com/${encodeURIComponent(this.organization)}`;
    const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    url.searchParams.set("api-version", options.apiVersion ?? API_VERSION);
    if (continuationToken) url.searchParams.set("continuationToken", continuationToken);
    return url.toString();
  }

  private backoffMs(attempt: number, retryAfterSeconds: number | null): number {
    if (retryAfterSeconds != null) return Math.min(retryAfterSeconds * 1000, 30_000);
    const base = Math.min(500 * 2 ** attempt, 8_000);
    return base + Math.floor(this.random() * 250);
  }

  /** Single GET with sanitized errors and bounded retries. */
  async get<T>(
    path: string,
    options: AzureRequestOptions = {},
    continuationToken?: string,
  ): Promise<{
    body: T;
    continuationToken: string | null;
  }> {
    const url = this.buildUrl(path, options, continuationToken);

    for (let attempt = 0; ; attempt += 1) {
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), this.timeoutMs);
      const onOuterAbort = () => timeoutController.abort();
      options.signal?.addEventListener("abort", onOuterAbort);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "GET",
          headers: { authorization: this.authHeader, accept: "application/json" },
          signal: timeoutController.signal,
        });
      } catch {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onOuterAbort);
        if (options.signal?.aborted) throw new AzureDevOpsError("timeout");
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt, null));
          continue;
        }
        throw new AzureDevOpsError("timeout");
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onOuterAbort);
      }

      if (response.ok) {
        const token = response.headers.get("x-ms-continuationtoken");
        // A sign-in redirect body means the credential was rejected silently.
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("json"))
          throw new AzureDevOpsError("invalid_credentials", { httpStatus: 203 });
        return {
          body: (await response.json()) as T,
          continuationToken: token && token.length > 0 ? token : null,
        };
      }

      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;
      const safeRetryAfter = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null;

      if (RETRYABLE.has(response.status) && attempt < this.maxRetries) {
        await this.sleep(this.backoffMs(attempt, safeRetryAfter));
        continue;
      }

      throw new AzureDevOpsError(statusToCode(response.status), {
        httpStatus: response.status,
        retryAfterSeconds: safeRetryAfter,
      });
    }
  }

  /** Paged GET following `x-ms-continuationtoken`, with a hard page ceiling. */
  async list<T>(path: string, options: AzureRequestOptions = {}): Promise<T[]> {
    const items: T[] = [];
    let token: string | undefined;
    for (let page = 0; page < this.maxPages; page += 1) {
      const { body, continuationToken } = await this.get<AzureListResponse<T>>(
        path,
        options,
        token,
      );
      items.push(...(body.value ?? []));
      const next = continuationToken ?? body.continuationToken ?? null;
      if (!next) return items;
      token = next;
    }
    return items;
  }

  /**
   * The ONLY POST surface. Azure DevOps requires POST for WIQL and for the
   * work-items batch reader; both are pure reads. The caller passes an
   * allowlisted kind — never a path — so no write endpoint is reachable.
   */
  async postAllowlisted<T>(
    kind: AzureReadPostKind,
    project: string,
    body: unknown,
    options: AzureRequestOptions = {},
  ): Promise<T> {
    if (!isAllowedReadPostKind(kind)) throw new AzureDevOpsError("forbidden");
    if (!project || /[\\/?#]/.test(project)) throw new AzureDevOpsError("invalid_configuration");
    const path =
      kind === "wiql"
        ? `/${encodeURIComponent(project)}/_apis/wit/wiql`
        : `/${encodeURIComponent(project)}/_apis/wit/workitemsbatch`;
    const url = this.buildUrl(path, options);
    const payload = JSON.stringify(body);

    for (let attempt = 0; ; attempt += 1) {
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), this.timeoutMs);
      const onOuterAbort = () => timeoutController.abort();
      options.signal?.addEventListener("abort", onOuterAbort);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            authorization: this.authHeader,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: payload,
          signal: timeoutController.signal,
        });
      } catch {
        if (options.signal?.aborted) throw new AzureDevOpsError("timeout");
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt, null));
          continue;
        }
        throw new AzureDevOpsError("timeout");
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onOuterAbort);
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("json"))
          throw new AzureDevOpsError("invalid_credentials", { httpStatus: 203 });
        return (await response.json()) as T;
      }

      const retryAfterHeader = response.headers.get("retry-after");
      const parsed = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;
      const safeRetryAfter = parsed !== null && Number.isFinite(parsed) ? parsed : null;
      if (RETRYABLE.has(response.status) && attempt < this.maxRetries) {
        await this.sleep(this.backoffMs(attempt, safeRetryAfter));
        continue;
      }
      throw new AzureDevOpsError(statusToCode(response.status), {
        httpStatus: response.status,
        retryAfterSeconds: safeRetryAfter,
      });
    }
  }

  listProjects(signal?: AbortSignal): Promise<AzureProject[]> {
    return this.list<AzureProject>("/_apis/projects", { query: { $top: 200 }, signal });
  }

  listTeams(projectId: string, signal?: AbortSignal): Promise<AzureTeam[]> {
    return this.list<AzureTeam>(`/_apis/projects/${encodeURIComponent(projectId)}/teams`, {
      query: { $top: 200 },
      signal,
    });
  }

  listTeamIterations(
    projectId: string,
    teamId: string,
    signal?: AbortSignal,
  ): Promise<AzureIteration[]> {
    return this.list<AzureIteration>(
      `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations`,
      { signal },
    );
  }

  async getTeamSettings(
    projectId: string,
    teamId: string,
    signal?: AbortSignal,
  ): Promise<AzureTeamSettings | null> {
    try {
      const { body } = await this.get<AzureTeamSettings>(
        `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings`,
        { signal },
      );
      return body;
    } catch {
      return null;
    }
  }

  async getTeamFieldValues(
    projectId: string,
    teamId: string,
    signal?: AbortSignal,
  ): Promise<AzureTeamFieldValues | null> {
    try {
      const { body } = await this.get<AzureTeamFieldValues>(
        `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/teamfieldvalues`,
        { signal },
      );
      return body;
    } catch {
      return null;
    }
  }

  listTeamMembers(
    projectId: string,
    teamId: string,
    signal?: AbortSignal,
  ): Promise<{ identity: AzureIdentityRef }[]> {
    return this.list<{ identity: AzureIdentityRef }>(
      `/_apis/projects/${encodeURIComponent(projectId)}/teams/${encodeURIComponent(teamId)}/members`,
      { query: { $top: 200 }, signal },
    );
  }
}

/** Runs tasks with bounded concurrency to stay under Azure DevOps throttling. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
