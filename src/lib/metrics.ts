// Pure metric calculations. No I/O, no clock, no randomness: the same
// records always produce the same numbers. This is the file the unit tests
// pin down, because it is the one an owner makes decisions from.

import type { ChangeOrder, Job, Lead, RawRecords, ReviewRequest, TimeRange, WeekMetrics } from "./types";
import { MS_MINUTE, weekRange } from "./weeks";

export function inRange(iso: string | null | undefined, range: TimeRange): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= range.from.getTime() && t < range.to.getTime();
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Safe division. Null instead of NaN or Infinity when there is no denominator. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Leads that arrived in the range. */
export function leadsCreated(leads: Lead[], range: TimeRange): Lead[] {
  return leads.filter((lead) => inRange(lead.createdAt, range));
}

/**
 * Speed to lead: median minutes between a lead arriving and the first response,
 * over leads that arrived in the range. The median is used because one lead
 * that sat all weekend should not hide a week of fast replies. Leads with no
 * response yet, or with a response stamped before the lead itself (bad data),
 * are left out of the median and reported through the responded count.
 */
export function speedToLead(
  leads: Lead[],
  range: TimeRange,
): { medianMinutes: number | null; responded: number; total: number } {
  const cohort = leadsCreated(leads, range);
  const minutes: number[] = [];
  for (const lead of cohort) {
    if (!lead.firstResponseAt) continue;
    const delta = Date.parse(lead.firstResponseAt) - Date.parse(lead.createdAt);
    if (Number.isFinite(delta) && delta >= 0) minutes.push(delta / MS_MINUTE);
  }
  return { medianMinutes: median(minutes), responded: minutes.length, total: cohort.length };
}

/** Estimate visits put on the calendar in the range, whenever the lead arrived. */
export function bookedCount(leads: Lead[], range: TimeRange): number {
  return leads.filter((lead) => inRange(lead.bookedAt, range)).length;
}

/**
 * Close rate: of the estimates decided in the range, the share that were won.
 * Open estimates are not counted as losses.
 */
export function closeRate(leads: Lead[], range: TimeRange): { rate: number | null; won: number; decided: number } {
  let won = 0;
  let decided = 0;
  for (const lead of leads) {
    if (lead.outcome === "open" || !inRange(lead.decidedAt, range)) continue;
    decided += 1;
    if (lead.outcome === "won") won += 1;
  }
  return { rate: ratio(won, decided), won, decided };
}

/**
 * Revenue and margin of jobs completed in the range. Margin is revenue
 * weighted, (revenue minus cost) over revenue across all completed jobs,
 * so a large job counts for more than a small one.
 */
export function revenueAndMargin(
  jobs: Job[],
  range: TimeRange,
): { revenue: number; cost: number; margin: number | null; jobs: number } {
  let revenue = 0;
  let cost = 0;
  let count = 0;
  for (const job of jobs) {
    if (!inRange(job.completedAt, range)) continue;
    revenue += job.revenue;
    cost += job.cost;
    count += 1;
  }
  return { revenue, cost, margin: ratio(revenue - cost, revenue), jobs: count };
}

/**
 * Change orders open at a point in time: requested before it and either
 * unresolved or resolved at or after it. This is a snapshot, not a flow.
 */
export function openChangeOrders(changeOrders: ChangeOrder[], asOf: Date): { count: number; value: number } {
  const cutoff = asOf.getTime();
  let count = 0;
  let value = 0;
  for (const order of changeOrders) {
    const requested = Date.parse(order.requestedAt);
    if (!Number.isFinite(requested) || requested >= cutoff) continue;
    const resolved = order.resolvedAt ? Date.parse(order.resolvedAt) : null;
    if (resolved !== null && resolved < cutoff) continue;
    count += 1;
    value += order.amount;
  }
  return { count, value };
}

/**
 * Review rate: of the review requests sent in the range, the share that have
 * produced a review so far. Recent weeks read low until customers catch up.
 */
export function reviewRate(
  requests: ReviewRequest[],
  range: TimeRange,
): { rate: number | null; sent: number; received: number } {
  let sent = 0;
  let received = 0;
  for (const request of requests) {
    if (!inRange(request.sentAt, range)) continue;
    sent += 1;
    if (request.reviewReceivedAt) received += 1;
  }
  return { rate: ratio(received, sent), sent, received };
}

/** All eight owner numbers for one ISO week. */
export function computeWeekMetrics(records: RawRecords, id: string): WeekMetrics {
  const range = weekRange(id);
  const speed = speedToLead(records.leads, range);
  const close = closeRate(records.leads, range);
  const money = revenueAndMargin(records.jobs, range);
  const open = openChangeOrders(records.changeOrders, range.to);
  const reviews = reviewRate(records.reviewRequests, range);
  return {
    weekId: id,
    leads: speed.total,
    speedToLeadMinutes: speed.medianMinutes,
    respondedLeads: speed.responded,
    booked: bookedCount(records.leads, range),
    closeRate: close.rate,
    won: close.won,
    decided: close.decided,
    revenue: money.revenue,
    jobMargin: money.margin,
    jobsCompleted: money.jobs,
    openChangeOrders: open.count,
    openChangeOrderValue: open.value,
    reviewRate: reviews.rate,
    reviewRequests: reviews.sent,
    reviewsReceived: reviews.received,
  };
}
