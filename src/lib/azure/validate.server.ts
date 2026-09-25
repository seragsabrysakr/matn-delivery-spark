/**
 * Server-only Azure DevOps connection validation.
 *
 * One minimal request, a 30s fetch timeout, at most one retry for transient
 * status codes, and a sanitized diagnostic. The PAT and the Authorization
 * header are never logged, returned or embedded in a URL.
 */
import type { AzureErrorCode } from "./errors";
import type { ValidationDiagnostic, ValidationOutcome, ValidationStage } from "./contracts";

export type { ValidationDiagnostic, ValidationOutcome, ValidationStage };

export const VALIDATION_FETCH_TIMEOUT_MS = 30_000;
/** Must stay above the fetch timeout so the wrapper never cuts the fetch short. */
export const VALIDATION_DEADLINE_MS = 45_000;

const RETRYABLE_ONCE = new Set([429, 502, 503, 504]);

const ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

/** Trims and rejects URLs, slashes, query strings and whitespace. */
export function normalizeOrganization(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/[\s/\\?#:@]/.test(value)) return null;
  if (!ORG_PATTERN.test(value)) return null;
  return value;
}

export const OUTCOME_TO_CODE: Record<ValidationOutcome, AzureErrorCode | null> = {
  connected: null,
  missing_configuration: "missing_configuration",
  invalid_configuration: "invalid_configuration",
  invalid_credentials: "invalid_credentials",
  insufficient_permissions: "insufficient_permissions",
  organization_not_found: "organization_not_found",
  request_timeout: "request_timeout",
  network_unreachable: "network_unreachable",
  provider_unavailable: "provider_unavailable",
};

export interface ValidateOptions {
  readonly organization: string | null | undefined;
  readonly pat: string | null | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface ProjectsBody {
  readonly count?: number;
  readonly value?: readonly unknown[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Performs the single validation request and returns a sanitized diagnostic. */
export async function validateAzureOrganization(
  options: ValidateOptions,
): Promise<ValidationDiagnostic> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const elapsed = () => Math.max(0, Math.round(now() - startedAt));
  const done = (
    outcome: ValidationOutcome,
    stage: ValidationStage,
    extra: { httpStatus?: number | null; projectCount?: number | null } = {},
  ): ValidationDiagnostic => ({
    outcome,
    stage,
    elapsedMs: elapsed(),
    httpStatus: extra.httpStatus ?? null,
    projectCount: extra.projectCount ?? null,
  });

  const pat = (options.pat ?? "").trim();
  const rawOrg = (options.organization ?? "").trim();
  if (!rawOrg || !pat) return done("missing_configuration", "configuration");

  const organization = normalizeOrganization(rawOrg);
  if (!organization) return done("invalid_configuration", "configuration");

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? VALIDATION_FETCH_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?api-version=7.1&$top=1`;
  const authorization = `Basic ${btoa(`:${pat}`)}`;

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
      // An AbortError is our own timeout; it is never retried.
      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (name === "AbortError" || name === "TimeoutError" || controller.signal.aborted) {
        return done("request_timeout", "azure_response");
      }
      if (message.includes("certificate") || message.includes("tls") || message.includes("ssl")) {
        return done("network_unreachable", "tls");
      }
      return done("network_unreachable", "dns_or_connect");
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;

    if (status === 200) {
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) {
        // A sign-in page instead of JSON means the credential was rejected.
        return done("invalid_credentials", "response_parse", { httpStatus: status });
      }
      try {
        const body = (await response.json()) as ProjectsBody;
        const count = typeof body.count === "number" ? body.count : (body.value?.length ?? 0);
        return done("connected", "azure_response", { httpStatus: status, projectCount: count });
      } catch {
        return done("provider_unavailable", "response_parse", { httpStatus: status });
      }
    }

    if (status === 401 || status === 203)
      return done("invalid_credentials", "azure_response", { httpStatus: status });
    if (status === 403)
      return done("insufficient_permissions", "azure_response", { httpStatus: status });
    if (status === 404)
      return done("organization_not_found", "azure_response", { httpStatus: status });
    if (status === 400)
      return done("invalid_configuration", "azure_response", { httpStatus: status });

    if (RETRYABLE_ONCE.has(status) && attempt === 0) {
      const remaining = timeoutMs * 2 - elapsed();
      if (remaining <= 1_000)
        return done("provider_unavailable", "azure_response", { httpStatus: status });
      await sleep(Math.min(1_000, Math.max(0, remaining - 1_000)));
      continue;
    }

    if (status >= 500 || status === 429) {
      return done("provider_unavailable", "azure_response", { httpStatus: status });
    }
    return done("provider_unavailable", "azure_response", { httpStatus: status });
  }

  return done("provider_unavailable", "server_deadline");
}
