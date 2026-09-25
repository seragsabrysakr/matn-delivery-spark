/** GET {org}/_apis/projects/{project}/teams */
export interface AzureTeam {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly url: string;
  readonly identityUrl?: string;
  readonly projectId?: string;
  readonly projectName?: string;
}

/** GET {org}/{project}/{team}/_apis/work/teamsettings/teamfieldvalues */
export interface AzureTeamFieldValues {
  readonly field: { readonly referenceName: string };
  readonly defaultValue: string;
  readonly values: readonly { readonly value: string; readonly includeChildren: boolean }[];
}

/** GET {org}/{project}/{team}/_apis/work/boards */
export interface AzureBoardReference {
  readonly id: string;
  readonly name: string;
  readonly url?: string;
}

/** GET {org}/{project}/{team}/_apis/work/boards/{board}/columns */
export interface AzureBoardColumn {
  readonly id: string;
  readonly name: string;
  readonly itemLimit?: number;
  /** Work item type name -> state name, exactly as configured on the board. */
  readonly stateMappings?: Readonly<Record<string, string>>;
  readonly isSplit?: boolean;
  readonly description?: string;
  readonly columnType?: string;
}
