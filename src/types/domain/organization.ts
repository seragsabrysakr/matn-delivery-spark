import type {
  CustomFields,
  IsoTimestamp,
  Localized,
  RecordMeta,
  SourceTracked,
  TenantScoped,
  Uuid,
} from "./common";

/** Top-level customer boundary. One tenant owns many Azure organizations. */
export interface Tenant extends RecordMeta {
  readonly id: Uuid;
  readonly name: Localized;
  /** Immutable slug used in URLs and storage prefixes. */
  readonly slug: string;
  readonly defaultLocale: "ar" | "en";
  readonly isActive: boolean;
}

/** Azure DevOps organization (dev.azure.com/{name}). Current-state record. */
export interface Organization extends TenantScoped, RecordMeta, SourceTracked {
  readonly id: Uuid;
  /** Azure organization GUID when available (accounts API), else null. */
  readonly azureOrganizationId: string | null;
  /** Azure organization name segment — required, unique per tenant. */
  readonly azureOrganizationName: string;
  readonly name: Localized;
  readonly baseUrl: string;
  readonly connectedAt: IsoTimestamp | null;
  readonly customFields: CustomFields;
}
