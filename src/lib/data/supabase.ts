// Supabase adapter stub.
//
// This talks to the Supabase REST API (PostgREST) with plain fetch, so the
// project needs no Supabase client package. It is a documented starting
// point, not a tested integration: the unit tests exercise it against a
// mocked fetch only, and it has never been run against a live project.
//
// Expected tables are described in docs/supabase-schema.sql. Columns are
// snake_case in the database and mapped to the camelCase record types here.
//
//   leads            id, source, created_at, first_response_at, booked_at, outcome, decided_at
//   jobs             id, lead_id, completed_at, revenue, cost
//   change_orders    id, job_id, amount, requested_at, resolved_at, resolution
//   review_requests  id, job_id, sent_at, review_received_at, rating
//
// Use the service role key on the server only. Never expose it to the browser.
// If your tables differ, change the row mappers below and nothing else.

import type { ChangeOrder, Job, Lead, LeadOutcome, LeadSource, RawRecords, ReviewRequest, TimeRange } from "../types";
import { weekId, weeksBetween } from "../weeks";
import type { DataSource } from "./adapter";

export interface SupabaseOptions {
  /** Project URL, for example https://your-project-ref.supabase.co */
  url: string;
  /** Service role key. Server side only. */
  key: string;
  /** Injected in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests. Defaults to the real clock. */
  now?: () => Date;
  /** Rows per request. PostgREST caps responses, so results are paged. */
  pageSize?: number;
}

type Row = Record<string, unknown>;

const LEAD_SOURCES: readonly LeadSource[] = ["web_form", "phone", "referral", "repeat"];
const OUTCOMES: readonly LeadOutcome[] = ["open", "won", "lost"];

const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const requireText = (row: Row, column: string): string => {
  const value = text(row[column]);
  if (value === null) throw new Error(`Supabase row is missing required column "${column}"`);
  return value;
};

export function mapLead(row: Row): Lead {
  const source = text(row.source) as LeadSource | null;
  const outcome = text(row.outcome) as LeadOutcome | null;
  return {
    id: requireText(row, "id"),
    source: source && LEAD_SOURCES.includes(source) ? source : "web_form",
    createdAt: requireText(row, "created_at"),
    firstResponseAt: text(row.first_response_at),
    bookedAt: text(row.booked_at),
    outcome: outcome && OUTCOMES.includes(outcome) ? outcome : "open",
    decidedAt: text(row.decided_at),
  };
}

export function mapJob(row: Row): Job {
  return {
    id: requireText(row, "id"),
    leadId: text(row.lead_id) ?? "",
    completedAt: text(row.completed_at),
    revenue: num(row.revenue),
    cost: num(row.cost),
  };
}

export function mapChangeOrder(row: Row): ChangeOrder {
  const resolution = text(row.resolution);
  return {
    id: requireText(row, "id"),
    jobId: text(row.job_id) ?? "",
    amount: num(row.amount),
    requestedAt: requireText(row, "requested_at"),
    resolvedAt: text(row.resolved_at),
    resolution: resolution === "approved" || resolution === "declined" ? resolution : null,
  };
}

export function mapReviewRequest(row: Row): ReviewRequest {
  return {
    id: requireText(row, "id"),
    jobId: text(row.job_id) ?? "",
    sentAt: requireText(row, "sent_at"),
    reviewReceivedAt: text(row.review_received_at),
    rating: row.rating === null || row.rating === undefined ? null : num(row.rating),
  };
}

/** PostgREST filter: column falls inside the half open range. */
function within(column: string, range: TimeRange): string {
  return `and(${column}.gte.${range.from.toISOString()},${column}.lt.${range.to.toISOString()})`;
}

export function createSupabaseSource(options: SupabaseOptions): DataSource {
  if (!options.url || !options.key) {
    throw new Error("Supabase adapter needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
  }
  const base = options.url.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const pageSize = options.pageSize ?? 1000;

  async function select(table: string, filters: Record<string, string>, limit?: number): Promise<Row[]> {
    const rows: Row[] = [];
    for (;;) {
      const size = limit ?? pageSize;
      const query = new URLSearchParams({ select: "*", ...filters, limit: String(size), offset: String(rows.length) });
      const response = await doFetch(`${base}/rest/v1/${table}?${query.toString()}`, {
        headers: { apikey: options.key, Authorization: `Bearer ${options.key}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Supabase request for ${table} failed with status ${response.status}`);
      const page = (await response.json()) as Row[];
      rows.push(...page);
      // A short page is not proof of the end: a project can cap rows per
      // response below pageSize. Only an empty page ends the read, so a cap
      // can never silently drop jobs from a revenue total.
      if (limit !== undefined || page.length === 0) return rows;
    }
  }

  return {
    name: "supabase",
    async listWeeks() {
      const current = weekId(now());
      const first = await select("leads", { order: "created_at.asc" }, 1);
      const earliest = first.length > 0 ? text(first[0].created_at) : null;
      if (!earliest || !Number.isFinite(Date.parse(earliest))) return [current];
      const firstWeek = weekId(new Date(earliest));
      return firstWeek > current ? [current] : weeksBetween(firstWeek, current);
    },
    async fetchRecords(range: TimeRange): Promise<RawRecords> {
      const [leads, jobs, changeOrders, reviewRequests] = await Promise.all([
        select("leads", {
          or: `(${within("created_at", range)},${within("booked_at", range)},${within("decided_at", range)})`,
          order: "created_at.asc",
        }),
        select("jobs", { and: `(completed_at.gte.${range.from.toISOString()},completed_at.lt.${range.to.toISOString()})`, order: "id.asc" }),
        select("change_orders", {
          requested_at: `lt.${range.to.toISOString()}`,
          or: `(resolved_at.is.null,resolved_at.gte.${range.from.toISOString()})`,
          order: "id.asc",
        }),
        select("review_requests", { and: `(sent_at.gte.${range.from.toISOString()},sent_at.lt.${range.to.toISOString()})`, order: "id.asc" }),
      ]);
      return {
        leads: leads.map(mapLead),
        jobs: jobs.map(mapJob),
        changeOrders: changeOrders.map(mapChangeOrder),
        reviewRequests: reviewRequests.map(mapReviewRequest),
      };
    },
  };
}
