/**
 * Pure reconciliation rules for the tenant-scoped Azure team natural key
 * (tenant_id, project_id, azure_team_id).
 *
 * Identity/ownership columns are never part of an update payload, and
 * freshness-only touches (last_seen_at / last_synced_at) are not content
 * changes: they count as `unchanged`.
 */

export interface TeamSourceFields {
  readonly azureTeamId: string;
  readonly name: string;
  readonly description: string | null;
  readonly areaPaths: readonly string[];
  readonly defaultIterationPath: string | null;
}

export interface ExistingTeamRow {
  readonly id: string;
  readonly azure_team_name: string | null;
  readonly name_en: string | null;
  readonly description: string | null;
  readonly area_paths: string[] | null;
  readonly default_iteration_path: string | null;
  readonly source_status: string | null;
  readonly is_deleted: boolean | null;
}

export interface TeamMutablePayload {
  readonly azure_team_name: string;
  readonly name_en: string;
  readonly description: string | null;
  readonly area_paths: string[];
  readonly default_iteration_path: string | null;
  readonly source_status: "active";
  readonly is_deleted: boolean;
}

/** Columns that must never appear in an update payload. */
export const IMMUTABLE_TEAM_COLUMNS = [
  "id",
  "tenant_id",
  "organization_id",
  "project_id",
  "azure_team_id",
  "created_at",
  "name_ar",
] as const;

const normText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const normPaths = (values: readonly string[] | null | undefined): string[] =>
  [...(values ?? [])]
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .sort();

export function mutableTeamPayload(source: TeamSourceFields): TeamMutablePayload {
  return {
    azure_team_name: normText(source.name) ?? source.azureTeamId,
    name_en: normText(source.name) ?? source.azureTeamId,
    description: normText(source.description),
    area_paths: normPaths(source.areaPaths),
    default_iteration_path: normText(source.defaultIterationPath),
    source_status: "active",
    is_deleted: false,
  };
}

/** Returns null when the stored row already matches the source (unchanged). */
export function diffTeam(
  existing: ExistingTeamRow,
  source: TeamSourceFields,
): TeamMutablePayload | null {
  const next = mutableTeamPayload(source);
  const same =
    normText(existing.azure_team_name) === next.azure_team_name &&
    normText(existing.name_en) === next.name_en &&
    normText(existing.description) === next.description &&
    JSON.stringify(normPaths(existing.area_paths)) === JSON.stringify(next.area_paths) &&
    normText(existing.default_iteration_path) === next.default_iteration_path &&
    (existing.source_status ?? null) === next.source_status &&
    (existing.is_deleted ?? false) === next.is_deleted;
  return same ? null : next;
}
