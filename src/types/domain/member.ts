import type {
  CustomFields,
  Localized,
  RecordMeta,
  SourceTracked,
  TenantScoped,
  Uuid,
} from "./common";

/** A person identity resolved from Azure DevOps. Current-state record. */
export interface TeamMember extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  /** Azure identity descriptor, e.g. "aad.<base64>" — stable across renames. */
  readonly azureDescriptor: string;
  /** Azure identity GUID when returned by the API. */
  readonly azureIdentityId: string | null;
  readonly displayName: string;
  /** Null when the graph API does not expose the mail address. */
  readonly uniqueName: string | null;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly role: Localized | null;
  readonly isActive: boolean;
  /** True when the identity could not be resolved and is a placeholder. */
  readonly isUnknownIdentity: boolean;
  readonly customFields: CustomFields;
}
