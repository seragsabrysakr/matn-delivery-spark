import type {
  IsoDate,
  IsoTimestamp,
  Localized,
  RecordMeta,
  SourceTracked,
  TenantScoped,
  TimeZone,
  Uuid,
} from "./common";

/** Lifecycle of a sprint relative to "now". */
export type IterationPhase = "future" | "current" | "completed" | "undated";

/** A non-working day inside an iteration (weekend, public holiday, team day off). */
export interface NonWorkingDay {
  readonly date: IsoDate;
  readonly kind: "weekend" | "holiday" | "team_off";
  readonly label: Localized | null;
}

/**
 * A single Azure iteration **node**, owned by the project — never by a team.
 * One node may be subscribed to by many teams (see `TeamIteration`); the node
 * is stored exactly once, so dates and paths cannot diverge between teams.
 * Table: `core_iterations`, unique on `(tenant_id, project_id, azure_iteration_id)`.
 */
export interface Iteration extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly azureIterationId: string;
  readonly azureIterationPath: string;
  readonly name: Localized;
  /** Null when the sprint has no dates configured in Azure. */
  readonly startDate: IsoDate | null;
  readonly finishDate: IsoDate | null;
  /** Phase computed from the node dates in the project default time zone. */
  readonly phase: IterationPhase;
}

/**
 * A team's subscription to an iteration node, plus everything that is
 * genuinely team-specific (time zone, working weekdays, sync selection).
 * Table: `core_team_iterations`, unique on `(tenant_id, team_id, iteration_id)`;
 * a partial unique index enforces one `is_current` row per `(tenant_id, team_id)`.
 */
export interface TeamIteration extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  readonly teamId: Uuid;
  readonly iterationId: Uuid;
  /** True for the team's current sprint; at most one per team. */
  readonly isCurrent: boolean;
  /** Team time zone used to resolve day boundaries and snapshot dates. */
  readonly timeZone: TimeZone;
  /** Weekday numbers considered working days (0 = Sunday). */
  readonly workingWeekdays: readonly number[];
  /** Team days off inside this iteration, from Azure team settings. */
  readonly teamDaysOff: readonly { readonly start: IsoDate; readonly end: IsoDate }[];
  /** Team-level phase, which can differ from the node phase across time zones. */
  readonly phase: IterationPhase;
  /** Whether this team/iteration pair is included in scheduled synchronization. */
  readonly selectedForSync: boolean;
}

/**
 * Derived sprint calendar. Always keyed on a `TeamIteration`, because working
 * days and time zone are team properties, not properties of the Azure node.
 */
export interface SprintCalendar {
  readonly teamIterationId: Uuid;
  readonly iterationId: Uuid;
  readonly teamId: Uuid;
  readonly timeZone: TimeZone;
  readonly workingWeekdays: readonly number[];
  readonly nonWorkingDays: readonly NonWorkingDay[];
  readonly totalWorkingDays: number | null;
  readonly elapsedWorkingDays: number | null;
  /** 1-based current day, null for undated or non-current sprints. */
  readonly currentWorkingDay: number | null;
  /** elapsedWorkingDays / totalWorkingDays * 100, null when dates are missing. */
  readonly elapsedPercentage: number | null;
  readonly computedAt: IsoTimestamp;
}
