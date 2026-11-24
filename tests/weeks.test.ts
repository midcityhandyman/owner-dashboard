import { describe, expect, it } from "vitest";
import {
  isWeekId,
  parseWeekId,
  shiftWeek,
  trailingWeeks,
  weekId,
  weekLabel,
  weekRange,
  weeksBetween,
  weekStart,
} from "../src/lib/weeks";

const utc = (s: string) => new Date(`${s}Z`);

describe("weekStart", () => {
  it("returns Monday 00:00 UTC for any day of the week", () => {
    expect(weekStart(utc("2026-09-30T15:45:00")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(weekStart(utc("2026-09-28T00:00:00")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    // Sunday belongs to the week that started six days earlier.
    expect(weekStart(utc("2026-10-04T23:59:59")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});

describe("weekId", () => {
  it("names ordinary weeks", () => {
    expect(weekId(utc("2026-09-30T12:00:00"))).toBe("2026-W40");
    expect(weekId(utc("2026-01-05T00:00:00"))).toBe("2026-W02");
  });

  it("handles ISO year boundaries", () => {
    // Jan 1 2026 is a Thursday, so it is in week 1 of 2026 along with Dec 29 2025.
    expect(weekId(utc("2025-12-29T00:00:00"))).toBe("2026-W01");
    expect(weekId(utc("2026-01-01T00:00:00"))).toBe("2026-W01");
    // Jan 1 2027 is a Friday, so it still belongs to week 53 of 2026.
    expect(weekId(utc("2027-01-01T00:00:00"))).toBe("2026-W53");
    expect(weekId(utc("2027-01-04T00:00:00"))).toBe("2027-W01");
  });
});

describe("parseWeekId", () => {
  it("round trips with weekId", () => {
    for (const id of ["2026-W01", "2026-W40", "2026-W53", "2027-W01", "2024-W52"]) {
      const monday = parseWeekId(id);
      expect(monday).not.toBeNull();
      expect(weekId(monday as Date)).toBe(id);
      expect((monday as Date).getUTCDay()).toBe(1);
    }
  });

  it("rejects malformed and non existent weeks", () => {
    expect(parseWeekId("2026-40")).toBeNull();
    expect(parseWeekId("2026-W4")).toBeNull();
    expect(parseWeekId("2026-W00")).toBeNull();
    expect(parseWeekId("2026-W54")).toBeNull();
    // 2025 has only 52 ISO weeks.
    expect(parseWeekId("2025-W53")).toBeNull();
    expect(isWeekId("next week")).toBe(false);
    expect(isWeekId("2026-W40")).toBe(true);
  });
});

describe("ranges and navigation", () => {
  it("gives a seven day half open range", () => {
    const range = weekRange("2026-W40");
    expect(range.from.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("shifts across year boundaries", () => {
    expect(shiftWeek("2026-W40", -1)).toBe("2026-W39");
    expect(shiftWeek("2026-W53", 1)).toBe("2027-W01");
    expect(shiftWeek("2026-W01", -1)).toBe("2025-W52");
  });

  it("lists trailing weeks oldest first, ending with the given week", () => {
    expect(trailingWeeks("2026-W02", 4)).toEqual(["2025-W51", "2025-W52", "2026-W01", "2026-W02"]);
    expect(trailingWeeks("2026-W40", 1)).toEqual(["2026-W40"]);
  });

  it("lists weeks between two ids inclusive", () => {
    expect(weeksBetween("2026-W38", "2026-W40")).toEqual(["2026-W38", "2026-W39", "2026-W40"]);
    expect(weeksBetween("2026-W40", "2026-W40")).toEqual(["2026-W40"]);
  });

  it("labels a week with its first and last day", () => {
    expect(weekLabel("2026-W40")).toBe("Sep 28 to Oct 4, 2026");
    expect(weekLabel("2026-W53")).toBe("Dec 28 to Jan 3, 2027");
  });

  it("throws on invalid ids where a week is required", () => {
    expect(() => weekRange("nope")).toThrow(/Invalid ISO week/);
  });
});
