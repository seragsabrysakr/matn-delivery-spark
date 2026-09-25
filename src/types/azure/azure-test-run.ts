/** GET {org}/{project}/_apis/test/runs */
export interface AzureTestRun {
  readonly id: number;
  readonly name: string;
  readonly state: "NotStarted" | "InProgress" | "Completed" | "Aborted" | "Waiting" | "Unspecified";
  readonly isAutomated: boolean;
  readonly startedDate?: string;
  readonly completedDate?: string;
  readonly totalTests?: number;
  readonly passedTests?: number;
  readonly unanalyzedTests?: number;
  readonly notApplicableTests?: number;
  readonly incompleteTests?: number;
  readonly build?: { readonly id: string };
  readonly release?: { readonly id: number; readonly environmentId?: number };
  readonly webAccessUrl?: string;
}

/** GET .../runs/{id}/results — subset used for summaries. */
export interface AzureTestResult {
  readonly id: number;
  readonly outcome?:
    "Passed" | "Failed" | "Blocked" | "NotExecuted" | "Warning" | "Error" | "Inconclusive" | "None";
  readonly testCaseTitle?: string;
  readonly durationInMs?: number;
  readonly associatedBugs?: readonly { readonly id: number }[];
}
