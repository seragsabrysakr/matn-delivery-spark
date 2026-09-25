import { describe, expect, it } from "vitest";
import { deriveAzureUiState } from "../ui-state";
import type { ConnectionValidationResult, ProjectDiscoveryResult } from "../contracts";

const connected: ConnectionValidationResult = {
  connected: true,
  status: "connected",
  organization: "matnsolutions",
  accessibleProjectCount: 1,
  checkedAt: "2026-08-27T08:00:00.000Z",
  error: null,
  diagnostic: null,
};

const discovery = (patch: Partial<ProjectDiscoveryResult>): ProjectDiscoveryResult => ({
  status: "complete",
  projects: [],
  projectCount: 0,
  pagesFetched: 1,
  elapsedMs: 120,
  warning: null,
  error: null,
  ...patch,
});

const base = {
  statusConnection: "connected" as const,
  validation: connected,
  discovery: null,
  discoveryFailed: false,
  sync: null,
  syncFailed: false,
};

describe("azure settings ui state", () => {
  it("keeps Connected when discovery times out", () => {
    const ui = deriveAzureUiState({
      ...base,
      discovery: discovery({ status: "failed", warning: "request_timeout", projectCount: 0 }),
    });
    expect(ui.connectionStatus).toBe("connected");
    expect(ui.connectionError).toBeNull();
    expect(ui.discoveryError).toBe("request_timeout");
    expect(ui.showEmptyProjects).toBe(false);
  });

  it("shows no readable projects only for a complete empty response", () => {
    expect(
      deriveAzureUiState({ ...base, discovery: discovery({ status: "complete", projectCount: 0 }) })
        .showEmptyProjects,
    ).toBe(true);
    expect(
      deriveAzureUiState({ ...base, discovery: discovery({ status: "partial", projectCount: 0 }) })
        .showEmptyProjects,
    ).toBe(false);
  });

  it("flags partial discovery separately", () => {
    const ui = deriveAzureUiState({
      ...base,
      discovery: discovery({ status: "partial", projectCount: 3 }),
    });
    expect(ui.showPartialDiscovery).toBe(true);
    expect(ui.discoveryError).toBeNull();
  });

  it("clears the stale discovery error when a later attempt succeeds", () => {
    const failed = deriveAzureUiState({
      ...base,
      discovery: discovery({ status: "failed", warning: "request_timeout" }),
    });
    expect(failed.discoveryError).toBe("request_timeout");
    const retried = deriveAzureUiState({
      ...base,
      discovery: discovery({ status: "complete", projectCount: 2, projects: [] }),
    });
    expect(retried.discoveryError).toBeNull();
    expect(retried.connectionStatus).toBe("connected");
  });

  it("keeps sync errors in their own slot", () => {
    const ui = deriveAzureUiState({ ...base, syncFailed: true });
    expect(ui.syncError).toBe("unknown");
    expect(ui.connectionStatus).toBe("connected");
    expect(ui.discoveryError).toBeNull();
  });
});
