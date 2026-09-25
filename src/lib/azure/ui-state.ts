/**
 * Pure derivation of the Azure settings screen state.
 *
 * The three operations are tracked independently so a discovery or sync error
 * can never overwrite a successful connection validation, and "no readable
 * projects" is only ever shown for a *complete* Azure response with zero rows.
 */
import type {
  ConnectionStatus,
  ConnectionValidationResult,
  ProjectDiscoveryResult,
  SyncRunReport,
} from "./contracts";
import type { AzureErrorCode } from "./errors";

export interface AzureUiInput {
  readonly statusConnection: ConnectionStatus;
  readonly validation: ConnectionValidationResult | null;
  readonly discovery: ProjectDiscoveryResult | null;
  readonly discoveryFailed: boolean;
  readonly sync: SyncRunReport | null;
  readonly syncFailed: boolean;
}

export interface AzureUiState {
  readonly connectionStatus: ConnectionStatus;
  readonly connectionError: AzureErrorCode | null;
  readonly discoveryError: AzureErrorCode | null;
  readonly showEmptyProjects: boolean;
  readonly showPartialDiscovery: boolean;
  readonly syncError: AzureErrorCode | null;
}

export function deriveAzureUiState(input: AzureUiInput): AzureUiState {
  // A completed validation is authoritative for the connection status; later
  // operations report their own errors in their own slots.
  const connectionStatus: ConnectionStatus = input.validation
    ? input.validation.status
    : input.statusConnection;
  const connectionError =
    input.validation && !input.validation.connected
      ? (input.validation.error?.code ?? "unknown")
      : null;

  const discovery = input.discovery;
  const discoveryError: AzureErrorCode | null = input.discoveryFailed
    ? "unknown"
    : discovery && discovery.status === "failed"
      ? (discovery.warning ?? discovery.error?.code ?? "unknown")
      : null;

  return {
    connectionStatus,
    connectionError,
    discoveryError,
    showEmptyProjects: Boolean(
      discovery && discovery.status === "complete" && discovery.projectCount === 0,
    ),
    showPartialDiscovery: Boolean(discovery && discovery.status === "partial"),
    syncError: input.syncFailed ? "unknown" : (input.sync?.error?.code ?? null),
  };
}
