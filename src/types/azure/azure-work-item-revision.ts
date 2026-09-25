import type { AzureFieldBag } from "./azure-common";

/** GET {org}/{project}/_apis/wit/workItems/{id}/revisions */
export interface AzureWorkItemRevision {
  readonly id: number;
  readonly rev: number;
  readonly fields: AzureFieldBag;
  readonly url?: string;
}

/** GET .../workItems/{id}/updates — field-level diffs, cheaper than full revisions. */
export interface AzureWorkItemUpdate {
  readonly id: number;
  readonly workItemId: number;
  readonly rev: number;
  readonly revisedDate: string;
  readonly revisedBy?: { readonly displayName: string; readonly descriptor?: string };
  readonly fields?: Readonly<
    Record<string, { readonly oldValue?: unknown; readonly newValue?: unknown }>
  >;
}
