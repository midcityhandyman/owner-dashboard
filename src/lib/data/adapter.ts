// The data source contract. The dashboard only ever talks to this interface,
// so swapping the seeded fake for a real database is a one file change.

import type { RawRecords, TimeRange } from "../types";

export interface DataSource {
  /** Short name shown in the page footer and the demo output. */
  readonly name: string;

  /** ISO week ids that have data, oldest first. Never empty. */
  listWeeks(): Promise<string[]>;

  /**
   * Records needed to compute metrics for any week inside the range:
   *  - leads with createdAt, bookedAt or decidedAt inside the range
   *  - jobs with completedAt inside the range
   *  - review requests with sentAt inside the range
   *  - change orders requested before the end of the range that were still
   *    open at any moment inside it (unresolved, or resolved at or after its start)
   * Returning extra records is allowed. The metric functions filter again.
   */
  fetchRecords(range: TimeRange): Promise<RawRecords>;
}

export function filterRecords(records: RawRecords, range: TimeRange): RawRecords {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const inside = (iso: string | null) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= from && t < to;
  };
  return {
    leads: records.leads.filter((l) => inside(l.createdAt) || inside(l.bookedAt) || inside(l.decidedAt)),
    jobs: records.jobs.filter((j) => inside(j.completedAt)),
    reviewRequests: records.reviewRequests.filter((r) => inside(r.sentAt)),
    changeOrders: records.changeOrders.filter(
      (c) => Date.parse(c.requestedAt) < to && (c.resolvedAt === null || Date.parse(c.resolvedAt) >= from),
    ),
  };
}
