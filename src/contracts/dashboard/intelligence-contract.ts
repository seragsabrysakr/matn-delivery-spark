import type {
  DataQualityIssue,
  Localized,
  Recommendation,
  RiskSignal,
  SyncRun,
} from "@/types/domain";
import type { ReleaseReadinessResult, SprintConfidenceResult } from "@/types/domain/kpi";
import type { DashboardContractBase, Section } from "./shared";

/** Read-only explanation surface; AI never writes back to Azure DevOps. */
export interface CopilotAnswer {
  readonly question: string;
  readonly answer: Localized;
  readonly citedEntityIds: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly generatedAt: string;
  readonly model: string;
}

/** Payload backing the Intelligence page. */
export interface IntelligenceContract extends DashboardContractBase {
  readonly confidence: Section<SprintConfidenceResult>;
  readonly releaseReadiness: Section<ReleaseReadinessResult>;
  readonly riskSignals: Section<readonly RiskSignal[]>;
  readonly recommendations: Section<readonly Recommendation[]>;
  readonly dataQuality: Section<readonly DataQualityIssue[]>;
  readonly syncHistory: Section<readonly SyncRun[]>;
  readonly latestAnswers: Section<readonly CopilotAnswer[]>;
}
