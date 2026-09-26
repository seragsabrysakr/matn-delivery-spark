import { describe, expect, it } from "vitest";
import {
  computeMemberCapacity,
  expandDateRanges,
  matchMember,
  normalizeDateRanges,
  weekdaysFromAzure,
  workingDates,
} from "../capacity-rules";

const SUN_THU = [0, 1, 2, 3, 4];
// Sprint 2: Sunday 2026-09-06 to Thursday 2026-09-17 → 10 Sun–Thu working days.
const calendar = {
  startDate: "2026-09-06",
  finishDate: "2026-09-17",
  workingWeekdays: SUN_THU,
  teamDaysOff: normalizeDateRanges([
    { start: "2026-09-10T00:00:00Z", end: "2026-09-10T00:00:00Z" },
  ]),
};

describe("weekdaysFromAzure", () => {
  it("maps Azure weekday names to 0-based weekdays", () => {
    expect(weekdaysFromAzure(["sunday", "monday", "tuesday", "wednesday", "thursday"])).toEqual(
      SUN_THU,
    );
  });

  it("returns null when Azure sends nothing usable", () => {
    expect(weekdaysFromAzure([])).toBeNull();
    expect(weekdaysFromAzure(undefined)).toBeNull();
  });
});

describe("date ranges", () => {
  it("normalizes Azure timestamps to inclusive date-only ranges", () => {
    expect(
      normalizeDateRanges([{ start: "2026-09-15T00:00:00Z", end: "2026-09-14T00:00:00Z" }]),
    ).toEqual([{ start: "2026-09-14", end: "2026-09-15" }]);
    expect([...expandDateRanges([{ start: "2026-09-14", end: "2026-09-16" }])]).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
  });

  it("counts working dates by the team's weekdays", () => {
    expect(workingDates("2026-09-06", "2026-09-17", SUN_THU)).toHaveLength(10);
    expect(workingDates("2026-09-06", "2026-09-17", SUN_THU, new Set(["2026-09-06"]))).toHaveLength(
      9,
    );
  });
});

describe("computeMemberCapacity", () => {
  it("nets team and personal days off like Azure does", () => {
    const capacity = computeMemberCapacity(
      {
        activities: [
          { name: "Development", capacityPerDay: 6 },
          { name: "Testing", capacityPerDay: 2 },
        ],
        daysOff: [{ start: "2026-09-14T00:00:00Z", end: "2026-09-15T00:00:00Z" }],
      },
      calendar,
    );
    expect(capacity.capacityPerDay).toBe(8);
    expect(capacity.activity).toBe("Development, Testing");
    expect(capacity.availableDays).toBe(7); // 10 − 1 team day − 2 personal days
    expect(capacity.netHours).toBe(56);
  });

  it("does not double-count days off that overlap weekends or team days off", () => {
    const capacity = computeMemberCapacity(
      {
        activities: [{ name: null, capacityPerDay: 6 }],
        daysOff: [{ start: "2026-09-10T00:00:00Z", end: "2026-09-12T00:00:00Z" }],
      },
      calendar,
    );
    expect(capacity.availableDays).toBe(9);
    expect(capacity.netHours).toBe(54);
    expect(capacity.activity).toBeNull();
  });

  it("reports unknown, not zero, when no hours are configured", () => {
    const capacity = computeMemberCapacity(
      { activities: [{ name: "Development", capacityPerDay: 0 }], daysOff: [] },
      calendar,
    );
    expect(capacity.capacityPerDay).toBe(0);
    expect(capacity.netHours).toBeNull();
  });

  it("reports unknown capacity for an undated sprint", () => {
    const capacity = computeMemberCapacity(
      { activities: [{ name: "Development", capacityPerDay: 6 }], daysOff: [] },
      { ...calendar, startDate: null },
    );
    expect(capacity.availableDays).toBeNull();
    expect(capacity.netHours).toBeNull();
  });
});

describe("matchMember", () => {
  const members = [
    { id: "m-1", azureDescriptor: "aad.abc", azureUniqueName: "Sara@Matn.io" },
    { id: "m-2", azureDescriptor: "guid-2", azureUniqueName: null },
  ];

  it("matches by descriptor, then id, then unique name", () => {
    expect(matchMember({ descriptor: "aad.abc" }, members)).toBe("m-1");
    expect(matchMember({ id: "guid-2" }, members)).toBe("m-2");
    expect(matchMember({ uniqueName: "sara@matn.io" }, members)).toBe("m-1");
  });

  it("returns null for an unknown identity", () => {
    expect(matchMember({ descriptor: "aad.zzz", uniqueName: "x@y.z" }, members)).toBeNull();
  });
});
