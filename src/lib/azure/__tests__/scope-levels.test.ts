import { describe, expect, it } from "vitest";
import { backlogLevelsFromProcessConfiguration } from "../metadata-rules";
import { isScopeType } from "../workitem-map";

// Shape of GET {project}/_apis/work/processconfiguration for an Agile project.
const agile = {
  portfolioBacklogs: [
    { name: "Epics", workItemTypes: [{ name: "Epic" }] },
    { name: "Features", workItemTypes: [{ name: "Feature" }] },
  ],
  requirementBacklog: { name: "Stories", workItemTypes: [{ name: "User Story" }] },
  taskBacklog: { name: "Tasks", workItemTypes: [{ name: "Task" }] },
  bugWorkItems: { name: "Bugs", workItemTypes: [{ name: "Bug" }] },
};

describe("backlogLevelsFromProcessConfiguration", () => {
  it("maps each type to its backlog level", () => {
    const levels = backlogLevelsFromProcessConfiguration(agile);
    expect(Object.fromEntries(levels)).toEqual({
      epic: "portfolio",
      feature: "portfolio",
      "user story": "requirement",
      task: "task",
      bug: "bug",
    });
    expect(levels.has("test case")).toBe(false);
  });

  it("treats a bug planned as a requirement as a bug", () => {
    const levels = backlogLevelsFromProcessConfiguration({
      ...agile,
      requirementBacklog: { workItemTypes: [{ name: "User Story" }, { name: "Bug" }] },
    });
    expect(levels.get("bug")).toBe("bug");
  });

  it("returns nothing for an empty configuration", () => {
    expect(backlogLevelsFromProcessConfiguration({}).size).toBe(0);
  });
});

describe("isScopeType", () => {
  const levels = backlogLevelsFromProcessConfiguration(agile);

  it("counts only requirement-level types with Azure levels", () => {
    expect(isScopeType("User Story", "story", "as_task", levels)).toBe(true);
    expect(isScopeType("Epic", "epic", "as_task", levels)).toBe(false);
    expect(isScopeType("Feature", "feature", "as_task", levels)).toBe(false);
    expect(isScopeType("Task", "task", "as_task", levels)).toBe(false);
    expect(isScopeType("Test Case", "other" as never, "as_task", levels)).toBe(false);
  });

  it("follows the team's bug handling for bug types", () => {
    expect(isScopeType("Bug", "bug", "as_requirement", levels)).toBe(true);
    expect(isScopeType("Bug", "bug", "as_task", levels)).toBe(false);
  });

  it("falls back to the alias rule when levels are not synchronized", () => {
    expect(isScopeType("User Story", "story", "as_task", null)).toBe(true);
    expect(isScopeType("Task", "task", "as_task", null)).toBe(false);
    expect(isScopeType("Bug", "bug", "as_requirement", null)).toBe(true);
  });
});
