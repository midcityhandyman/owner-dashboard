import { describe, expect, it } from "vitest";
import { createSupabaseSource, mapChangeOrder, mapJob, mapLead, mapReviewRequest } from "../src/lib/data/supabase";
import { weekRange } from "../src/lib/weeks";

// These tests run against a mocked fetch. Nothing here touches the network.

type Call = { table: string; params: URLSearchParams; headers: Record<string, string> };

function mockFetch(tables: Record<string, unknown[]>, calls: Call[], status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop() as string;
    calls.push({ table, params: url.searchParams, headers: (init?.headers ?? {}) as Record<string, string> });
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    const rows = (tables[table] ?? []).slice(offset, offset + limit);
    return new Response(JSON.stringify(rows), { status });
  }) as typeof fetch;
}

const config = (tables: Record<string, unknown[]>, calls: Call[], extra = {}) => ({
  url: "https://project.example.com/",
  key: "test-key-not-real",
  fetchImpl: mockFetch(tables, calls),
  now: () => new Date("2026-10-01T12:00:00Z"),
  ...extra,
});

describe("row mappers", () => {
  it("maps snake_case rows to record types", () => {
    expect(
      mapLead({
        id: "l1",
        source: "phone",
        created_at: "2026-09-29T10:00:00Z",
        first_response_at: "2026-09-29T10:05:00Z",
        booked_at: null,
        outcome: "won",
        decided_at: "2026-10-01T10:00:00Z",
      }),
    ).toEqual({
      id: "l1",
      source: "phone",
      createdAt: "2026-09-29T10:00:00Z",
      firstResponseAt: "2026-09-29T10:05:00Z",
      bookedAt: null,
      outcome: "won",
      decidedAt: "2026-10-01T10:00:00Z",
    });
    expect(mapJob({ id: "j1", lead_id: "l1", completed_at: null, revenue: "1500.00", cost: 900 })).toEqual({
      id: "j1",
      leadId: "l1",
      completedAt: null,
      revenue: 1500,
      cost: 900,
    });
    expect(mapChangeOrder({ id: "c1", job_id: "j1", amount: 250, requested_at: "2026-09-29T10:00:00Z" })).toEqual({
      id: "c1",
      jobId: "j1",
      amount: 250,
      requestedAt: "2026-09-29T10:00:00Z",
      resolvedAt: null,
      resolution: null,
    });
    expect(mapReviewRequest({ id: "r1", job_id: "j1", sent_at: "2026-09-30T10:00:00Z", rating: 5 }).rating).toBe(5);
  });

  it("falls back on unknown enum values and rejects rows without required columns", () => {
    const lead = mapLead({ id: "l2", source: "billboard", created_at: "2026-09-29T10:00:00Z", outcome: "maybe" });
    expect(lead.source).toBe("web_form");
    expect(lead.outcome).toBe("open");
    expect(() => mapLead({ id: "l3" })).toThrow(/created_at/);
    expect(() => mapChangeOrder({ id: "c2" })).toThrow(/requested_at/);
  });
});

describe("createSupabaseSource", () => {
  it("requires a url and a key", () => {
    expect(() => createSupabaseSource({ url: "", key: "" })).toThrow(/SUPABASE_URL/);
  });

  it("lists weeks from the earliest lead to the current week", async () => {
    const calls: Call[] = [];
    const source = createSupabaseSource(config({ leads: [{ id: "l1", created_at: "2026-09-15T09:00:00Z" }] }, calls));
    expect(await source.listWeeks()).toEqual(["2026-W38", "2026-W39", "2026-W40"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].params.get("order")).toBe("created_at.asc");
    expect(calls[0].params.get("limit")).toBe("1");
  });

  it("returns only the current week when there are no leads", async () => {
    const source = createSupabaseSource(config({}, []));
    expect(await source.listWeeks()).toEqual(["2026-W40"]);
  });

  it("queries the four tables with range filters and auth headers", async () => {
    const calls: Call[] = [];
    const source = createSupabaseSource(
      config(
        {
          leads: [{ id: "l1", source: "phone", created_at: "2026-09-29T10:00:00Z", outcome: "open" }],
          jobs: [{ id: "j1", lead_id: "l1", completed_at: "2026-09-30T10:00:00Z", revenue: 1000, cost: 700 }],
          change_orders: [{ id: "c1", job_id: "j1", amount: 200, requested_at: "2026-09-29T12:00:00Z" }],
          review_requests: [{ id: "r1", job_id: "j1", sent_at: "2026-10-01T10:00:00Z" }],
        },
        calls,
      ),
    );
    const records = await source.fetchRecords(weekRange("2026-W40"));
    expect(records.leads).toHaveLength(1);
    expect(records.jobs[0].revenue).toBe(1000);
    expect(records.changeOrders[0].resolvedAt).toBeNull();
    expect(records.reviewRequests[0].jobId).toBe("j1");

    const byTable = Object.fromEntries(calls.map((c) => [c.table, c]));
    expect(Object.keys(byTable).sort()).toEqual(["change_orders", "jobs", "leads", "review_requests"]);
    expect(byTable.leads.params.get("or")).toContain("created_at.gte.2026-09-28T00:00:00.000Z");
    expect(byTable.leads.params.get("or")).toContain("decided_at.lt.2026-10-05T00:00:00.000Z");
    expect(byTable.change_orders.params.get("requested_at")).toBe("lt.2026-10-05T00:00:00.000Z");
    expect(byTable.change_orders.params.get("or")).toBe("(resolved_at.is.null,resolved_at.gte.2026-09-28T00:00:00.000Z)");
    expect(byTable.jobs.headers.apikey).toBe("test-key-not-real");
    expect(byTable.jobs.headers.Authorization).toBe("Bearer test-key-not-real");
  });

  it("pages through results larger than one page", async () => {
    const calls: Call[] = [];
    const jobs = Array.from({ length: 5 }, (_, i) => ({ id: `j${i}`, completed_at: "2026-09-30T10:00:00Z", revenue: 100, cost: 50 }));
    const source = createSupabaseSource(config({ jobs }, calls, { pageSize: 2 }));
    const records = await source.fetchRecords(weekRange("2026-W40"));
    expect(records.jobs.map((j) => j.id)).toEqual(["j0", "j1", "j2", "j3", "j4"]);
    expect(calls.filter((c) => c.table === "jobs").map((c) => c.params.get("offset"))).toEqual(["0", "2", "4", "5"]);
  });

  it("keeps reading when the server caps a page below the requested size", async () => {
    // A project can cap rows per response. A short page must not end the read,
    // or a busy week would silently lose jobs and under-report revenue.
    const calls: Call[] = [];
    const jobs = Array.from({ length: 7 }, (_, i) => ({ id: `j${i}`, completed_at: "2026-09-30T10:00:00Z", revenue: 100, cost: 50 }));
    const serverCap = 3;
    const capped = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop() as string;
      const offset = Number(url.searchParams.get("offset"));
      calls.push({ table, params: url.searchParams, headers: {} });
      const rows = table === "jobs" ? jobs.slice(offset, offset + serverCap) : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }) as typeof fetch;
    const source = createSupabaseSource({ url: "https://project.example.com", key: "test-key-not-real", fetchImpl: capped, pageSize: 1000 });
    const records = await source.fetchRecords(weekRange("2026-W40"));
    expect(records.jobs).toHaveLength(7);
    expect(calls.filter((c) => c.table === "jobs").map((c) => c.params.get("offset"))).toEqual(["0", "3", "6", "7"]);
  });

  it("surfaces http errors", async () => {
    const source = createSupabaseSource({
      url: "https://project.example.com",
      key: "test-key-not-real",
      fetchImpl: mockFetch({}, [], 401),
    });
    await expect(source.listWeeks()).rejects.toThrow(/status 401/);
  });
});
