import { describe, expect, it } from "vitest";
import {
  bookedCount,
  closeRate,
  computeWeekMetrics,
  inRange,
  leadsCreated,
  median,
  openChangeOrders,
  ratio,
  revenueAndMargin,
  reviewRate,
  speedToLead,
} from "../src/lib/metrics";
import type { ChangeOrder, Job, Lead, RawRecords, ReviewRequest } from "../src/lib/types";
import { weekRange } from "../src/lib/weeks";

// Week 2026-W40 runs Mon Sep 28 to Sun Oct 4, 2026 (UTC).
const WEEK = "2026-W40";
const range = weekRange(WEEK);

let counter = 0;
const lead = (over: Partial<Lead>): Lead => ({
  id: `lead-${++counter}`,
  source: "web_form",
  createdAt: "2026-09-29T10:00:00.000Z",
  firstResponseAt: null,
  bookedAt: null,
  outcome: "open",
  decidedAt: null,
  ...over,
});
const job = (over: Partial<Job>): Job => ({
  id: `job-${++counter}`,
  leadId: "lead-x",
  completedAt: "2026-09-30T16:00:00.000Z",
  revenue: 1000,
  cost: 600,
  ...over,
});
const changeOrder = (over: Partial<ChangeOrder>): ChangeOrder => ({
  id: `co-${++counter}`,
  jobId: "job-x",
  amount: 500,
  requestedAt: "2026-09-29T09:00:00.000Z",
  resolvedAt: null,
  resolution: null,
  ...over,
});
const review = (over: Partial<ReviewRequest>): ReviewRequest => ({
  id: `rr-${++counter}`,
  jobId: "job-x",
  sentAt: "2026-09-30T09:00:00.000Z",
  reviewReceivedAt: null,
  rating: null,
  ...over,
});

describe("helpers", () => {
  it("inRange includes the start and excludes the end", () => {
    expect(inRange("2026-09-28T00:00:00.000Z", range)).toBe(true);
    expect(inRange("2026-10-04T23:59:59.999Z", range)).toBe(true);
    expect(inRange("2026-10-05T00:00:00.000Z", range)).toBe(false);
    expect(inRange("2026-09-27T23:59:59.999Z", range)).toBe(false);
    expect(inRange(null, range)).toBe(false);
    expect(inRange("not a date", range)).toBe(false);
  });

  it("median handles odd, even and empty input without mutating it", () => {
    const values = [9, 1, 5];
    expect(median(values)).toBe(5);
    expect(values).toEqual([9, 1, 5]);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("ratio returns null instead of dividing by zero", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(3, 0)).toBeNull();
  });
});

describe("leads", () => {
  it("counts only leads created inside the week", () => {
    const leads = [
      lead({ createdAt: "2026-09-28T00:00:00.000Z" }),
      lead({ createdAt: "2026-10-04T23:00:00.000Z" }),
      lead({ createdAt: "2026-09-27T23:59:00.000Z" }),
      lead({ createdAt: "2026-10-05T00:00:00.000Z" }),
    ];
    expect(leadsCreated(leads, range)).toHaveLength(2);
  });
});

describe("speedToLead", () => {
  it("takes the median response time in minutes", () => {
    const leads = [
      lead({ createdAt: "2026-09-29T10:00:00.000Z", firstResponseAt: "2026-09-29T10:04:00.000Z" }),
      lead({ createdAt: "2026-09-29T11:00:00.000Z", firstResponseAt: "2026-09-29T11:10:00.000Z" }),
      // One lead that sat for a day does not drag the median.
      lead({ createdAt: "2026-09-30T08:00:00.000Z", firstResponseAt: "2026-10-01T08:00:00.000Z" }),
    ];
    expect(speedToLead(leads, range)).toEqual({ medianMinutes: 10, responded: 3, total: 3 });
  });

  it("leaves unanswered leads out of the median but keeps them in the total", () => {
    const leads = [
      lead({ firstResponseAt: "2026-09-29T10:06:00.000Z" }),
      lead({ firstResponseAt: "2026-09-29T10:12:00.000Z" }),
      lead({ firstResponseAt: null }),
    ];
    expect(speedToLead(leads, range)).toEqual({ medianMinutes: 9, responded: 2, total: 3 });
  });

  it("ignores responses stamped before the lead arrived", () => {
    const leads = [lead({ firstResponseAt: "2026-09-29T09:00:00.000Z" }), lead({ firstResponseAt: "2026-09-29T10:20:00.000Z" })];
    expect(speedToLead(leads, range)).toEqual({ medianMinutes: 20, responded: 1, total: 2 });
  });

  it("counts a response in a later week against the week the lead arrived", () => {
    const leads = [lead({ createdAt: "2026-10-04T23:50:00.000Z", firstResponseAt: "2026-10-05T00:20:00.000Z" })];
    expect(speedToLead(leads, range).medianMinutes).toBe(30);
    expect(speedToLead(leads, weekRange("2026-W41")).total).toBe(0);
  });

  it("is null when nothing was answered", () => {
    expect(speedToLead([lead({})], range).medianMinutes).toBeNull();
    expect(speedToLead([], range)).toEqual({ medianMinutes: null, responded: 0, total: 0 });
  });
});

describe("bookedCount", () => {
  it("counts by booking date, not by lead arrival date", () => {
    const leads = [
      lead({ createdAt: "2026-09-20T10:00:00.000Z", bookedAt: "2026-09-29T10:00:00.000Z" }),
      lead({ createdAt: "2026-09-29T10:00:00.000Z", bookedAt: "2026-10-06T10:00:00.000Z" }),
      lead({ bookedAt: "2026-10-01T10:00:00.000Z" }),
      lead({ bookedAt: null }),
    ];
    expect(bookedCount(leads, range)).toBe(2);
  });
});

describe("closeRate", () => {
  it("is won over decided for estimates decided in the week", () => {
    const leads = [
      lead({ outcome: "won", decidedAt: "2026-09-29T10:00:00.000Z" }),
      lead({ outcome: "won", decidedAt: "2026-10-02T10:00:00.000Z" }),
      lead({ outcome: "lost", decidedAt: "2026-09-30T10:00:00.000Z" }),
      lead({ outcome: "lost", decidedAt: "2026-10-01T10:00:00.000Z" }),
      lead({ outcome: "lost", decidedAt: "2026-10-03T10:00:00.000Z" }),
    ];
    expect(closeRate(leads, range)).toEqual({ rate: 0.4, won: 2, decided: 5 });
  });

  it("does not count open estimates or decisions from other weeks", () => {
    const leads = [
      lead({ outcome: "won", decidedAt: "2026-09-29T10:00:00.000Z" }),
      lead({ outcome: "open", decidedAt: null }),
      lead({ outcome: "open", decidedAt: "2026-09-29T10:00:00.000Z" }),
      lead({ outcome: "lost", decidedAt: "2026-09-22T10:00:00.000Z" }),
    ];
    expect(closeRate(leads, range)).toEqual({ rate: 1, won: 1, decided: 1 });
  });

  it("is null when nothing was decided", () => {
    expect(closeRate([lead({})], range)).toEqual({ rate: null, won: 0, decided: 0 });
  });
});

describe("revenueAndMargin", () => {
  it("sums jobs completed in the week", () => {
    const jobs = [
      job({ revenue: 1000, cost: 600 }),
      job({ revenue: 3000, cost: 2400 }),
      job({ revenue: 9999, cost: 1, completedAt: "2026-10-06T10:00:00.000Z" }),
      job({ revenue: 9999, cost: 1, completedAt: null }),
    ];
    const result = revenueAndMargin(jobs, range);
    expect(result.revenue).toBe(4000);
    expect(result.cost).toBe(3000);
    expect(result.jobs).toBe(2);
  });

  it("weights margin by revenue instead of averaging per job margins", () => {
    // Per job margins are 40% and 20%. A plain average would say 30%.
    const jobs = [job({ revenue: 1000, cost: 600 }), job({ revenue: 3000, cost: 2400 })];
    expect(revenueAndMargin(jobs, range).margin).toBeCloseTo(0.25, 10);
  });

  it("reports a negative margin when jobs lost money", () => {
    expect(revenueAndMargin([job({ revenue: 1000, cost: 1200 })], range).margin).toBeCloseTo(-0.2, 10);
  });

  it("is null with no completed jobs or no revenue", () => {
    expect(revenueAndMargin([], range)).toEqual({ revenue: 0, cost: 0, margin: null, jobs: 0 });
    expect(revenueAndMargin([job({ revenue: 0, cost: 50 })], range).margin).toBeNull();
  });
});

describe("openChangeOrders", () => {
  const asOf = range.to;

  it("counts orders requested before the cutoff and not yet resolved", () => {
    const orders = [changeOrder({ amount: 500 }), changeOrder({ amount: 250, requestedAt: "2026-08-01T09:00:00.000Z" })];
    expect(openChangeOrders(orders, asOf)).toEqual({ count: 2, value: 750 });
  });

  it("drops orders resolved before the cutoff, whatever the resolution", () => {
    const orders = [
      changeOrder({ resolvedAt: "2026-10-02T09:00:00.000Z", resolution: "approved" }),
      changeOrder({ resolvedAt: "2026-10-03T09:00:00.000Z", resolution: "declined" }),
      changeOrder({ amount: 300 }),
    ];
    expect(openChangeOrders(orders, asOf)).toEqual({ count: 1, value: 300 });
  });

  it("still counts orders that were resolved after the cutoff", () => {
    const orders = [changeOrder({ amount: 800, resolvedAt: "2026-10-07T09:00:00.000Z", resolution: "approved" })];
    expect(openChangeOrders(orders, asOf)).toEqual({ count: 1, value: 800 });
    expect(openChangeOrders(orders, weekRange("2026-W41").to)).toEqual({ count: 0, value: 0 });
  });

  it("ignores orders requested at or after the cutoff", () => {
    const orders = [
      changeOrder({ requestedAt: "2026-10-05T00:00:00.000Z" }),
      changeOrder({ requestedAt: "2026-10-09T00:00:00.000Z" }),
    ];
    expect(openChangeOrders(orders, asOf)).toEqual({ count: 0, value: 0 });
  });
});

describe("reviewRate", () => {
  it("is reviews received over requests sent in the week", () => {
    const requests = [
      review({ reviewReceivedAt: "2026-10-01T09:00:00.000Z", rating: 5 }),
      // A review that arrived the following week still counts for the week it was asked for.
      review({ reviewReceivedAt: "2026-10-08T09:00:00.000Z", rating: 4 }),
      review({}),
      review({}),
      review({ sentAt: "2026-09-21T09:00:00.000Z", reviewReceivedAt: "2026-09-30T09:00:00.000Z", rating: 5 }),
    ];
    expect(reviewRate(requests, range)).toEqual({ rate: 0.5, sent: 4, received: 2 });
  });

  it("is null when no requests were sent", () => {
    expect(reviewRate([], range)).toEqual({ rate: null, sent: 0, received: 0 });
  });
});

describe("computeWeekMetrics", () => {
  const records: RawRecords = {
    leads: [
      lead({ firstResponseAt: "2026-09-29T10:05:00.000Z", bookedAt: "2026-09-30T10:00:00.000Z" }),
      lead({ firstResponseAt: "2026-09-29T10:15:00.000Z" }),
      lead({}),
      lead({ createdAt: "2026-09-15T10:00:00.000Z", outcome: "won", decidedAt: "2026-10-01T10:00:00.000Z" }),
      lead({ createdAt: "2026-09-16T10:00:00.000Z", outcome: "lost", decidedAt: "2026-10-02T10:00:00.000Z" }),
    ],
    jobs: [job({ revenue: 2000, cost: 1300 }), job({ revenue: 500, cost: 200, completedAt: "2026-09-22T10:00:00.000Z" })],
    changeOrders: [changeOrder({ amount: 400 }), changeOrder({ resolvedAt: "2026-09-30T10:00:00.000Z", resolution: "approved" })],
    reviewRequests: [review({ reviewReceivedAt: "2026-10-02T09:00:00.000Z", rating: 5 }), review({}), review({}), review({})],
  };

  it("assembles all eight numbers for the week", () => {
    expect(computeWeekMetrics(records, WEEK)).toEqual({
      weekId: WEEK,
      leads: 3,
      speedToLeadMinutes: 10,
      respondedLeads: 2,
      booked: 1,
      closeRate: 0.5,
      won: 1,
      decided: 2,
      revenue: 2000,
      jobMargin: 0.35,
      jobsCompleted: 1,
      openChangeOrders: 1,
      openChangeOrderValue: 400,
      reviewRate: 0.25,
      reviewRequests: 4,
      reviewsReceived: 1,
    });
  });

  it("returns zeros and nulls, never NaN, for an empty week", () => {
    const empty = computeWeekMetrics({ leads: [], jobs: [], changeOrders: [], reviewRequests: [] }, WEEK);
    expect(empty.leads).toBe(0);
    expect(empty.revenue).toBe(0);
    expect(empty.speedToLeadMinutes).toBeNull();
    expect(empty.closeRate).toBeNull();
    expect(empty.jobMargin).toBeNull();
    expect(empty.reviewRate).toBeNull();
    for (const value of Object.values(empty)) expect(Number.isNaN(value)).toBe(false);
  });
});
