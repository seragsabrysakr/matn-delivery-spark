import type {
  IsoTimestamp,
  Localized,
  RecordMeta,
  SourceTracked,
  TenantScoped,
  Uuid,
} from "./common";

/** Azure DevOps team inside a project. Current-state record. */
export interface Team extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly projectId: Uuid;
  /** Azure team GUID — required, unique within a project. */
  readonly azureTeamId: string;
  readonly azureTeamName: string;
  readonly name: Localized;
  readonly description: string | null;
  /** Area paths owned by the team; used to attribute work items. */
  readonly areaPaths: readonly string[];
  readonly defaultIterationPath: string | null;
  /** Team-level override of the project process mapping. */
  readonly processMappingId: Uuid | null;
}

/** Membership is history-bearing: a member can join and leave mid-iteration. */
export interface TeamMembership extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly teamId: Uuid;
  readonly memberId: Uuid;
  readonly role: "lead" | "member" | "admin" | "unknown";
  readonly joinedAt: IsoTimestamp | null;
  /** Null while the membership is active. */
  readonly leftAt: IsoTimestamp | null;
  readonly isActive: boolean;
}
