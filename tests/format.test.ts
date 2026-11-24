import { describe, expect, it } from "vitest";
import { formatDelta, formatMinutes, formatValue } from "../src/lib/format";
import { sparkGeometry, sparkText } from "../src/lib/sparkline";

describe("formatValue", () => {
  it("formats each kind", () => {
    expect(formatValue("count", 1234)).toBe("1,234");
    expect(formatValue("money", 48250)).toBe("$48,250");
    expect(formatValue("money", 1234567)).toBe("$1,234,567");
    expect(formatValue("percent", 0.4567)).toBe("45.7%");
    expect(formatValue("minutes", 7.4)).toBe("7 min");
  });

  it("shows n/a for missing values", () => {
    expect(formatValue("percent", null)).toBe("n/a");
    expect(formatValue("minutes", Number.NaN)).toBe("n/a");
  });

  it("switches minutes to hours past one hour", () => {
    expect(formatMinutes(59)).toBe("59 min");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(135)).toBe("2h 15m");
  });
});

describe("formatDelta", () => {
  it("uses the unit that fits the metric kind", () => {
    expect(formatDelta("count", 24, 20)).toBe("+4");
    expect(formatDelta("count", 18, 20)).toBe("-2");
    expect(formatDelta("count", 20, 20)).toBe("0");
    expect(formatDelta("minutes", 9, 14)).toBe("-5 min");
    expect(formatDelta("percent", 0.45, 0.4)).toBe("+5.0 pts");
    expect(formatDelta("percent", 0.38, 0.4)).toBe("-2.0 pts");
    expect(formatDelta("money", 11000, 10000)).toBe("+10.0%");
    expect(formatDelta("money", 7500, 10000)).toBe("-25.0%");
  });

  it("handles a zero or missing previous value", () => {
    expect(formatDelta("money", 5000, 0)).toBe("+$5,000");
    expect(formatDelta("money", 0, 0)).toBe("0.0%");
    expect(formatDelta("percent", null, 0.4)).toBe("n/a");
    expect(formatDelta("count", 3, null)).toBe("n/a");
  });
});

describe("sparkline", () => {
  it("maps the lowest value to the bottom and the highest to the top", () => {
    const geo = sparkGeometry([0, 5, 10], 100, 40, 0);
    expect(geo.points).toEqual([
      { x: 0, y: 40 },
      { x: 50, y: 20 },
      { x: 100, y: 0 },
    ]);
    expect(geo.path).toBe("M0 40 L50 20 L100 0");
    expect(geo.last).toEqual({ x: 100, y: 0 });
  });

  it("breaks the line at null values", () => {
    const geo = sparkGeometry([1, null, 3, 5], 90, 30, 0);
    expect(geo.points[1]).toBeNull();
    expect(geo.path).toBe("M0 30 M60 15 L90 0");
  });

  it("draws a flat series through the middle and survives empty input", () => {
    expect(sparkGeometry([4, 4], 10, 20, 0).points).toEqual([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(sparkGeometry([null, null], 10, 20).path).toBe("");
    expect(sparkGeometry([], 10, 20).last).toBeNull();
  });

  it("renders a text sparkline with one character per value", () => {
    expect(sparkText([0, 10])).toBe("▁█");
    expect(sparkText([1, null, 1])).toBe("▅ ▅");
    expect(sparkText([3, 1, 2])).toHaveLength(3);
  });
});
