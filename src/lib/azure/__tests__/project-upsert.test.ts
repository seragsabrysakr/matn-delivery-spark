import { describe, expect, it } from "vitest";
import {
  countsBalance,
  diffProject,
  IMMUTABLE_PROJECT_COLUMNS,
  mutableProjectPayload,
  type ExistingProjectRow,
  type ProjectSourceFields,
} from "../project-upsert";
import { blockingDependency } from "../job-rules";

const source: ProjectSourceFields = {
  azureProjectId: "9fcb3d82",
  name: "Hoteliana",
  description: null,
  state: "wellFormed",
  visibility: "private",
  processTemplateKind: "custom",
};

const rowFrom = (s: ProjectSourceFields, id = "uuid-1"): ExistingProjectRow => ({
  id,
  azure_project_id: s.azureProjectId,
  ...mutableProjectPayload(s),
});

/** Minimal in-memory store emulating the tenant-scoped natural key. */
function makeStore(failOn?: string) {
  const rows = new Map<string, ExistingProjectRow>();
  let seq = 0;
  const counts = { discovered: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0 };
  const updatePayloads: Record<string, unknown>[] = [];
  const run = (projects: readonly ProjectSourceFields[]) => {
    for (const p of projects) {
      counts.discovered += 1;
      if (failOn === p.azureProjectId) {
        counts.failed += 1;
        continue;
      }
      const existing = rows.get(p.azureProjectId);
      if (!existing) {
        seq += 1;
        rows.set(p.azureProjectId, rowFrom(p, `uuid-${seq}`));
        counts.inserted += 1;
        continue;
      }
      const patch = diffProject(existing, p);
      if (patch) {
        updatePayloads.push({ ...patch } as Record<string, unknown>);
        rows.set(p.azureProjectId, { ...existing, ...patch });
        counts.updated += 1;
      } else {
        counts.unchanged += 1;
      }
    }
    return counts;
  };
  return { rows, run, counts, updatePayloads };
}

describe("project idempotent upsert", () => {
  it("first run inserts a project", () => {
    const store = makeStore();
    expect(store.run([source])).toMatchObject({ inserted: 1, updated: 0, unchanged: 0, failed: 0 });
  });

  it("second identical run returns unchanged and preserves the internal UUID", () => {
    const store = makeStore();
    store.run([source]);
    const id = store.rows.get(source.azureProjectId)!.id;
    store.run([source]);
    expect(store.counts).toMatchObject({ inserted: 1, updated: 0, unchanged: 1, failed: 0 });
    expect(store.rows.get(source.azureProjectId)!.id).toBe(id);
  });

  it("changed mutable field returns updated", () => {
    const store = makeStore();
    store.run([source]);
    store.run([{ ...source, description: "New description" }]);
    expect(store.counts).toMatchObject({ inserted: 1, updated: 1, unchanged: 0, failed: 0 });
  });

  it("never includes immutable columns in the update payload", () => {
    const store = makeStore();
    store.run([source]);
    store.run([{ ...source, state: "deleting" }]);
    for (const payload of store.updatePayloads) {
      for (const col of IMMUTABLE_PROJECT_COLUMNS) expect(payload).not.toHaveProperty(col);
    }
  });

  it("four already-existing projects do not become four failures", () => {
    const projects = ["a", "b", "c", "d"].map((k) => ({ ...source, azureProjectId: k, name: k }));
    const store = makeStore();
    store.run(projects);
    const second = makeStore();
    for (const p of projects) second.rows.set(p.azureProjectId, rowFrom(p));
    const counts = second.run(projects);
    expect(counts).toMatchObject({
      discovered: 4,
      inserted: 0,
      updated: 0,
      unchanged: 4,
      failed: 0,
    });
  });

  it("count invariant always holds", () => {
    const projects = ["a", "b", "c"].map((k) => ({ ...source, azureProjectId: k, name: k }));
    const store = makeStore("b");
    expect(countsBalance(store.run(projects))).toBe(true);
    expect(countsBalance(store.run(projects))).toBe(true);
  });

  it("a genuine database failure remains failed", () => {
    const store = makeStore("b");
    const counts = store.run([{ ...source, azureProjectId: "b" }]);
    expect(counts.failed).toBe(1);
  });

  it("normalizes blank description and name whitespace", () => {
    const existing = rowFrom(source);
    expect(diffProject(existing, { ...source, name: " Hoteliana " })).toBeNull();
    expect(diffProject({ ...existing, description: "  " }, source)).toBeNull();
  });

  it("teams becomes runnable when projects completes with unchanged rows", () => {
    const projectCounts = {
      discovered: 4,
      inserted: 0,
      updated: 0,
      unchanged: 4,
      failed: 0,
      missing: 0,
      complete: true,
      blocked: false,
      blockedBy: null,
      freshnessAt: null,
    };
    expect(countsBalance(projectCounts)).toBe(true);
    expect(blockingDependency("teams", { projects: projectCounts } as never)).toBeNull();
  });
});
