import { describe, expect, it } from "vitest";
import { buildDashboard, buildMetricViews, compare, METRICS } from "../src/lib/dashboard";
import type { DataSource } from "../src/lib/data/adapter";
import { createFakeSource, DEFAULT_FAKE_OPTIONS, generateFakeRecords } from "../src/lib/data/fake";
import { computeWeekMetrics } from "../src/lib/metrics";
import type { TimeRange, WeekMetrics } from "../src/lib/types";

const source = createFakeSource();
const all = generateFakeRecords(DEFAULT_FAKE_OPTIONS);

const week = (over: Partial<WeekMetrics>): WeekMetrics => ({
  weekId: "2026-W40",
  leads: 20,
  speedToLeadMinutes: 10,
  respondedLeads: 18,
  booked: 8,
  closeRate: 0.4,
  won: 4,
  decided: 10,
  revenue: 10000,
  jobMargin: 0.3,
  jobsCompleted: 3,
  openChangeOrders: 2,
  openChangeOrderValue: 900,
  reviewRate: 0.5,
  reviewRequests: 4,
  reviewsReceived: 2,
  ...over,
});

describe("compare", () => {
  it("treats a rise as good when higher is better and bad when lower is better", () => {
    expect(compare(12, 10, "higher")).toEqual({ delta: 2, direction: "up", good: true });
    expect(compare(12, 10, "lower")).toEqual({ delta: 2, direction: "up", good: false });
    expect(compare(8, 10, "lower")).toEqual({ delta: -2, direction: "down", good: true });
    expect(compare(8, 10, "higher")).toEqual({ delta: -2, direction: "down", good: false });
  });

  it("is neutral when flat or when either side is missing", () => {
    expect(compare(5, 5, "higher")).toEqual({ delta: 0, direction: "flat", good: null });
    expect(compare(null, 5, "higher")).toEqual({ delta: null, direction: "none", good: null });
    expect(compare(5, null, "lower")).toEqual({ delta: null, direction: "none", good: null });
  });
});

describe("buildMetricViews", () => {
  it("covers the eight owner metrics in order", () => {
    expect(METRICS.map((m) => m.key)).toEqual([
      "leads",
      "speedToLead",
      "booked",
      "closeRate",
      "revenue",
      "jobMargin",
      "openChangeOrders",
      "reviewRate",
    ]);
  });

  it("marks faster responses and fewer open change orders as good", () => {
    const previous = week({ weekId: "2026-W39", speedToLeadMinutes: 25, openChangeOrders: 5, revenue: 12500 });
    const views = buildMetricViews([previous, week({})], previous);
    const byKey = Object.fromEntries(views.map((v) => [v.key, v]));
    expect(byKey.speedToLead).toMatchObject({ display: "10 min", deltaDisplay: "-15 min", direction: "down", good: true });
    expect(byKey.openChangeOrders).toMatchObject({ display: "2", deltaDisplay: "-3", good: true });
    expect(byKey.revenue).toMatchObject({ display: "$10,000", deltaDisplay: "-20.0%", direction: "down", good: false });
    expect(byKey.leads).toMatchObject({ direction: "flat", good: null, series: [20, 20] });
    expect(byKey.closeRate.detail).toBe("4 won of 10 decided");
  });

  it("has no comparison without a previous week", () => {
    const views = buildMetricViews([week({})], null);
    expect(views.every((v) => v.direction === "none" && v.deltaDisplay === "n/a")).toBe(true);
  });
});

describe("buildDashboard", () => {
  it("defaults to the latest week with a twelve week trend", async () => {
    const view = await buildDashboard(source);
    expect(view.weekId).toBe("2026-W40");
    expect(view.weekLabel).toBe("Sep 28 to Oct 4, 2026");
    expect(view.trendWeeks).toHaveLength(12);
    expect(view.trendWeeks[0]).toBe("2026-W29");
    expect(view.trendWeeks.at(-1)).toBe("2026-W40");
    expect(view.previousWeek).toBe("2026-W39");
    expect(view.nextWeek).toBeNull();
    expect(view.notice).toBeNull();
    expect(view.metrics).toHaveLength(8);
    for (const metric of view.metrics) expect(metric.series).toHaveLength(12);
  });

  it("matches metrics computed straight from the full record set", async () => {
    const view = await buildDashboard(source, { week: "2026-W35" });
    const direct = computeWeekMetrics(all, "2026-W35");
    const before = computeWeekMetrics(all, "2026-W34");
    const byKey = Object.fromEntries(view.metrics.map((m) => [m.key, m]));
    expect(byKey.leads.value).toBe(direct.leads);
    expect(byKey.speedToLead.value).toBe(direct.speedToLeadMinutes);
    expect(byKey.booked.value).toBe(direct.booked);
    expect(byKey.closeRate.value).toBe(direct.closeRate);
    expect(byKey.revenue.value).toBe(direct.revenue);
    expect(byKey.jobMargin.value).toBe(direct.jobMargin);
    expect(byKey.openChangeOrders.value).toBe(direct.openChangeOrders);
    expect(byKey.reviewRate.value).toBe(direct.reviewRate);
    expect(byKey.revenue.previous).toBe(before.revenue);
    expect(byKey.leads.series.at(-1)).toBe(direct.leads);
    expect(byKey.leads.series.at(-2)).toBe(before.leads);
    expect(view.nextWeek).toBe("2026-W36");
  });

  it("shortens the trend and drops the comparison at the first week", async () => {
    const weeks = await source.listWeeks();
    const view = await buildDashboard(source, { week: weeks[0] });
    expect(view.trendWeeks).toEqual([weeks[0]]);
    expect(view.previousWeek).toBeNull();
    expect(view.nextWeek).toBe(weeks[1]);
    expect(view.metrics.every((m) => m.direction === "none")).toBe(true);
  });

  it("honours a custom trend length", async () => {
    const view = await buildDashboard(source, { trendLength: 4 });
    expect(view.trendWeeks).toEqual(["2026-W37", "2026-W38", "2026-W39", "2026-W40"]);
  });

  it("falls back to the latest week with a notice for bad or missing weeks", async () => {
    const invalid = await buildDashboard(source, { week: "last-week" });
    expect(invalid.weekId).toBe("2026-W40");
    expect(invalid.notice).toMatch(/not a valid ISO week/);
    const missing = await buildDashboard(source, { week: "2031-W01" });
    expect(missing.weekId).toBe("2026-W40");
    expect(missing.notice).toMatch(/No data for 2031-W01/);
  });

  it("asks the source for one range that covers the trend and comparison week", async () => {
    const calls: TimeRange[] = [];
    const spy: DataSource = {
      name: "spy",
      listWeeks: () => source.listWeeks(),
      fetchRecords: (range) => {
        calls.push(range);
        return source.fetchRecords(range);
      },
    };
    await buildDashboard(spy, { week: "2026-W40", trendLength: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].from.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(calls[0].to.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("rejects a source with no weeks", async () => {
    const empty: DataSource = { name: "empty", listWeeks: async () => [], fetchRecords: async () => all };
    await expect(buildDashboard(empty)).rejects.toThrow(/no weeks/);
  });
});
