/**
 * Client-safe Azure DevOps error contracts.
 * Never carries credentials, headers or raw provider payloads.
 */
export type AzureErrorCode =
  | "not_configured"
  | "missing_configuration"
  | "invalid_configuration"
  | "invalid_credentials"
  | "insufficient_permissions"
  | "organization_not_found"
  | "throttled"
  | "timeout"
  | "request_timeout"
  | "network_unreachable"
  | "provider_unavailable"
  | "unavailable"
  | "partial_sync"
  | "conflict"
  | "forbidden"
  | "unknown";

export interface AzureFailure {
  readonly code: AzureErrorCode;
  readonly message: string;
  readonly httpStatus: number | null;
  readonly retryAfterSeconds: number | null;
}

const SAFE_MESSAGES: Record<AzureErrorCode, string> = {
  not_configured: "Azure DevOps secrets are not configured.",
  missing_configuration: "Azure DevOps secrets are not configured.",
  invalid_configuration: "The configured Azure DevOps organization value is invalid.",
  request_timeout: "The Azure DevOps request timed out.",
  network_unreachable: "Azure DevOps could not be reached from the server.",
  provider_unavailable: "Azure DevOps is temporarily unavailable.",
  invalid_credentials: "Azure DevOps rejected the configured credentials.",
  insufficient_permissions: "The configured credentials lack the required read scopes.",
  organization_not_found: "The configured Azure DevOps organization was not found.",
  throttled: "Azure DevOps is throttling requests.",
  timeout: "The Azure DevOps request timed out.",
  unavailable: "Azure DevOps is temporarily unavailable.",
  partial_sync: "Synchronization completed only partially.",
  conflict: "Another synchronization run is already active.",
  forbidden: "You are not authorized to perform this operation.",
  unknown: "An unexpected error occurred while contacting Azure DevOps.",
};

export class AzureDevOpsError extends Error {
  readonly code: AzureErrorCode;
  readonly httpStatus: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: AzureErrorCode,
    options: {
      httpStatus?: number | null;
      retryAfterSeconds?: number | null;
      detail?: string;
    } = {},
  ) {
    super(SAFE_MESSAGES[code]);
    this.name = "AzureDevOpsError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }

  toFailure(): AzureFailure {
    return {
      code: this.code,
      message: SAFE_MESSAGES[this.code],
      httpStatus: this.httpStatus,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

/** Maps any thrown value to a sanitized failure. Never leaks provider text. */
export function toAzureFailure(error: unknown): AzureFailure {
  if (error instanceof AzureDevOpsError) return error.toFailure();
  return {
    code: "unknown",
    message: SAFE_MESSAGES.unknown,
    httpStatus: null,
    retryAfterSeconds: null,
  };
}

export function statusToCode(status: number): AzureErrorCode {
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "insufficient_permissions";
  if (status === 404) return "organization_not_found";
  if (status === 429) return "throttled";
  if (status === 408) return "timeout";
  if (status >= 500) return "unavailable";
  return "unknown";
}
