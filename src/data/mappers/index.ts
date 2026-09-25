/**
 * Phase 3 mapper boundary.
 *
 * Generated database row types (`src/integrations/supabase/types.ts`) and the
 * hand-written domain contracts (`src/types/domain/*`) are deliberately kept
 * apart. Everything that crosses that line must go through a mapper declared
 * here, so Phase 4 normalization has exactly one place to change.
 *
 * Nothing in this module reads the database. The UI stays in mock mode until
 * Phase 4 wires real fetchers.
 */
import type { Tables } from "@/integrations/supabase/types";
import type { Iteration, Project, Team, TeamIteration, WorkItem } from "@/types/domain";

/** Convenience alias so mappers read as `Row<"core_projects">`. */
export type Row<T extends keyof DatabaseTables> = DatabaseTables[T];
type DatabaseTables = {
  readonly core_projects: Tables<"core_projects">;
  readonly core_teams: Tables<"core_teams">;
  readonly core_iterations: Tables<"core_iterations">;
  readonly core_team_iterations: Tables<"core_team_iterations">;
  readonly az_work_items: Tables<"az_work_items">;
};

/** A mapper is always total and pure: one row in, one domain record out. */
export type RowMapper<TRow, TDomain> = (row: TRow) => TDomain;

/** The mapper surface Phase 4 must implement. Declared, not yet implemented. */
export interface DomainMappers {
  readonly project: RowMapper<Row<"core_projects">, Project>;
  readonly team: RowMapper<Row<"core_teams">, Team>;
  readonly iteration: RowMapper<Row<"core_iterations">, Iteration>;
  readonly teamIteration: RowMapper<Row<"core_team_iterations">, TeamIteration>;
  readonly workItem: RowMapper<Row<"az_work_items">, WorkItem>;
}

/** Localized pair helper shared by every mapper (`name_en` / `name_ar`). */
export const toLocalized = (en: string, ar: string): { en: string; ar: string } => ({ en, ar });
