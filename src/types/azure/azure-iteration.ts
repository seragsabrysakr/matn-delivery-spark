/** GET {org}/{project}/{team}/_apis/work/teamsettings/iterations */
export interface AzureIteration {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly attributes: {
    /** ISO 8601; null when the sprint has no dates. */
    readonly startDate: string | null;
    readonly finishDate: string | null;
    readonly timeFrame?: "past" | "current" | "future";
  };
  readonly url: string;
}

/** GET .../teamsettings — weekdays and backlog iteration defaults. */
export interface AzureTeamSettings {
  readonly workingDays: readonly (
    "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"
  )[];
  readonly backlogIteration: { readonly id: string; readonly path?: string };
  readonly defaultIteration?: { readonly id: string; readonly path?: string };
  /** How the team plans bugs: "asRequirements", "asTasks" or "off". */
  readonly bugsBehavior?: string;
}

/** GET .../teamsettings/iterations/{id}/teamdaysoff */
export interface AzureTeamDaysOff {
  readonly daysOff: readonly { readonly start: string; readonly end: string }[];
}
