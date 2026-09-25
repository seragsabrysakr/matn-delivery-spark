/** Pure, testable normalization rules shared by the foundation sync. */
import type { Database } from "@/integrations/supabase/types";
import type { AzureIteration } from "@/types/azure";

export type ProcessTemplateKind = Database["public"]["Enums"]["process_template_kind"];
export type IterationPhase = Database["public"]["Enums"]["iteration_phase"];

export const templateFromName = (name: string | null | undefined): ProcessTemplateKind => {
  const value = (name ?? "").toLowerCase();
  if (value.includes("scrum")) return "scrum";
  if (value.includes("cmmi")) return "cmmi";
  if (value.includes("basic")) return "basic";
  if (value.includes("agile")) return "agile";
  return "custom";
};

export const iterationPhase = (iteration: AzureIteration, now: Date): IterationPhase => {
  const start = iteration.attributes?.startDate ? new Date(iteration.attributes.startDate) : null;
  const finish = iteration.attributes?.finishDate
    ? new Date(iteration.attributes.finishDate)
    : null;
  if (!start || !finish) return "undated";
  if (now < start) return "future";
  if (now > finish) return "completed";
  return "current";
};

export const dateOnly = (value: string | null | undefined): string | null =>
  value ? new Date(value).toISOString().slice(0, 10) : null;

/** Descriptor precedence: stable descriptor, then identity id, then unique name. */
export const memberKey = (identity: {
  descriptor?: string | undefined;
  id?: string | undefined;
  uniqueName?: string | undefined;
}): string | null => identity.descriptor ?? identity.id ?? identity.uniqueName ?? null;
