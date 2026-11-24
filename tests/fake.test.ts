import { describe, expect, it } from "vitest";
import { getDataSource } from "../src/lib/data";
import { createFakeSource, DEFAULT_FAKE_OPTIONS, generateFakeRecords } from "../src/lib/data/fake";
import { computeWeekMetrics } from "../src/lib/metrics";
import { parseWeekId, weekRange } from "../src/lib/weeks";

const records = generateFakeRecords(DEFAULT_FAKE_OPTIONS);
const now = weekRange(DEFAULT_FAKE_OPTIONS.anchorWeek).to.getTime();

describe("generateFakeRecords", () => {
  it("is deterministic for the same options", () => {
    expect(generateFakeRecords(DEFAULT_FAKE_OPTIONS)).toEqual(records);
  });

  it("changes when the seed changes", () => {
    const other = generateFakeRecords({ ...DEFAULT_FAKE_OPTIONS, seed: 7 });
    expect(other.leads.map((l) => l.createdAt)).not.toEqual(records.leads.map((l) => l.createdAt));
  });

  it("keeps a week stable when more history is generated", () => {
    const longer = generateFakeRecords({ ...DEFAULT_FAKE_OPTIONS, weeks: 30 });
    const range = weekRange("2026-W38");
    const inWeek = (iso: string) => Date.parse(iso) >= range.from.getTime() && Date.parse(iso) < range.to.getTime();
    const leadsIn = (all: typeof records) => all.leads.filter((l) => inWeek(l.createdAt));
    expect(leadsIn(longer).length).toBeGreaterThan(0);
    expect(leadsIn(longer)).toEqual(leadsIn(records));
  });

  it("produces every kind of record", () => {
    expect(records.leads.length).toBeGreaterThan(300);
    expect(records.jobs.length).toBeGreaterThan(30);
    expect(records.changeOrders.length).toBeGreaterThan(5);
    expect(records.reviewRequests.length).toBeGreaterThan(10);
  });

  it("never stamps an event after the simulated now", () => {
    const stamps = [
      ...records.leads.flatMap((l) => [l.createdAt, l.firstResponseAt, l.bookedAt, l.decidedAt]),
      ...records.jobs.map((j) => j.completedAt),
      ...records.changeOrders.flatMap((c) => [c.requestedAt, c.resolvedAt]),
      ...records.reviewRequests.flatMap((r) => [r.sentAt, r.reviewReceivedAt]),
    ].filter((s): s is string => s !== null);
    for (const stamp of stamps) expect(Date.parse(stamp)).toBeLessThan(now);
  });

  it("keeps each lead's events in order and its fields consistent", () => {
    for (const lead of records.leads) {
      const created = Date.parse(lead.createdAt);
      if (lead.firstResponseAt) expect(Date.parse(lead.firstResponseAt)).toBeGreaterThanOrEqual(created);
      if (lead.bookedAt) expect(Date.parse(lead.bookedAt)).toBeGreaterThan(created);
      if (lead.decidedAt) expect(Date.parse(lead.decidedAt)).toBeGreaterThan(Date.parse(lead.bookedAt as string));
      expect(lead.outcome === "open").toBe(lead.decidedAt === null);
    }
    const won = new Set(records.leads.filter((l) => l.outcome === "won").map((l) => l.id));
    for (const job of records.jobs) {
      expect(won.has(job.leadId)).toBe(true);
      expect(job.revenue).toBeGreaterThan(0);
      expect(job.cost).toBeGreaterThan(0);
      expect(job.cost).toBeLessThan(job.revenue);
    }
    for (const order of records.changeOrders) expect(order.resolution === null).toBe(order.resolvedAt === null);
    for (const request of records.reviewRequests) expect(request.rating === null).toBe(request.reviewReceivedAt === null);
  });

  it("contains no personal data fields", () => {
    const text = JSON.stringify(records);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/"(name|phone|email|address)[a-z_]*"\s*:/i);
  });

  it("gives plausible numbers for the anchor week", () => {
    const metrics = computeWeekMetrics(records, DEFAULT_FAKE_OPTIONS.anchorWeek);
    expect(metrics.leads).toBeGreaterThan(5);
    expect(metrics.speedToLeadMinutes).not.toBeNull();
    expect(metrics.revenue).toBeGreaterThan(0);
    expect(metrics.jobMargin as number).toBeGreaterThan(0.1);
    expect(metrics.jobMargin as number).toBeLessThan(0.6);
  });

  it("rejects bad options", () => {
    expect(() => generateFakeRecords({ seed: 1, anchorWeek: "bad", weeks: 4 })).toThrow(/anchor week/);
    expect(() => generateFakeRecords({ seed: 1, anchorWeek: "2026-W40", weeks: 0 })).toThrow(/positive integer/);
  });
});

describe("createFakeSource", () => {
  const source = createFakeSource();

  it("lists consecutive weeks ending at the anchor", async () => {
    const weeks = await source.listWeeks();
    expect(weeks).toHaveLength(DEFAULT_FAKE_OPTIONS.weeks);
    expect(weeks[weeks.length - 1]).toBe(DEFAULT_FAKE_OPTIONS.anchorWeek);
    expect(weeks.every((w) => parseWeekId(w) !== null)).toBe(true);
    expect([...weeks].sort()).toEqual(weeks);
  });

  it("returns enough records to reproduce a week computed from everything", async () => {
    const week = "2026-W33";
    const subset = await source.fetchRecords(weekRange(week));
    expect(subset.leads.length).toBeLessThan(records.leads.length);
    expect(computeWeekMetrics(subset, week)).toEqual(computeWeekMetrics(records, week));
  });
});

describe("getDataSource", () => {
  it("defaults to the fake source with no environment at all", async () => {
    const source = getDataSource({});
    expect(source.name).toBe("fake (seed 42)");
    expect((await source.listWeeks()).at(-1)).toBe("2026-W40");
  });

  it("reads fake options from the environment and ignores invalid ones", async () => {
    const source = getDataSource({ FAKE_SEED: "7", FAKE_ANCHOR_WEEK: "2026-W10", FAKE_WEEKS: "5" });
    expect(source.name).toBe("fake (seed 7)");
    expect(await source.listWeeks()).toEqual(["2026-W06", "2026-W07", "2026-W08", "2026-W09", "2026-W10"]);
    const fallback = getDataSource({ FAKE_SEED: "x", FAKE_ANCHOR_WEEK: "soon", FAKE_WEEKS: "-3" });
    expect(fallback.name).toBe("fake (seed 42)");
    expect(await fallback.listWeeks()).toHaveLength(26);
  });

  it("fails loudly for supabase without credentials or an unknown source", () => {
    expect(() => getDataSource({ DATA_SOURCE: "supabase" })).toThrow(/SUPABASE_URL/);
    expect(() => getDataSource({ DATA_SOURCE: "spreadsheet" })).toThrow(/Unknown DATA_SOURCE/);
  });
});
