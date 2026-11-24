// Raw records the dashboard is computed from. Every data source adapter
// returns these shapes, so the metric math never knows where data came from.
// Timestamps are ISO 8601 strings in UTC. Money is whole dollars.

export type LeadSource = "web_form" | "phone" | "referral" | "repeat";
export type LeadOutcome = "open" | "won" | "lost";

export interface Lead {
  id: string;
  source: LeadSource;
  createdAt: string;
  /** First human or automated reply. Null when nobody has responded yet. */
  firstResponseAt: string | null;
  /** When an estimate visit was put on the calendar. */
  bookedAt: string | null;
  outcome: LeadOutcome;
  /** When the estimate was accepted or declined. Null while outcome is open. */
  decidedAt: string | null;
}

export interface Job {
  id: string;
  leadId: string;
  /** Null while the job is still in progress. */
  completedAt: string | null;
  /** Final invoiced amount. */
  revenue: number;
  /** Labor, materials and subcontract cost booked against the job. */
  cost: number;
}

export type ChangeOrderResolution = "approved" | "declined";

export interface ChangeOrder {
  id: string;
  jobId: string;
  amount: number;
  requestedAt: string;
  resolvedAt: string | null;
  resolution: ChangeOrderResolution | null;
}

export interface ReviewRequest {
  id: string;
  jobId: string;
  sentAt: string;
  reviewReceivedAt: string | null;
  rating: number | null;
}

export interface RawRecords {
  leads: Lead[];
  jobs: Job[];
  changeOrders: ChangeOrder[];
  reviewRequests: ReviewRequest[];
}

/** Half open time range: from is included, to is excluded. */
export interface TimeRange {
  from: Date;
  to: Date;
}

export interface WeekMetrics {
  weekId: string;
  leads: number;
  /** Median minutes from lead created to first response. Null with no responses. */
  speedToLeadMinutes: number | null;
  respondedLeads: number;
  booked: number;
  /** Won divided by decided (won plus lost). Null when nothing was decided. */
  closeRate: number | null;
  won: number;
  decided: number;
  revenue: number;
  /** Revenue weighted gross margin of jobs completed in the week. */
  jobMargin: number | null;
  jobsCompleted: number;
  /** Change orders requested but not resolved as of the end of the week. */
  openChangeOrders: number;
  openChangeOrderValue: number;
  /** Reviews received divided by review requests sent in the week. */
  reviewRate: number | null;
  reviewRequests: number;
  reviewsReceived: number;
}
