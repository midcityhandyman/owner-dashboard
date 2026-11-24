// Turns raw records into the view model the page, the JSON API and the
// terminal demo all render: eight metrics, each with its value, the change
// against the previous week and a trend series for the sparkline.

import type { DataSource } from "./data/adapter";
import { formatDelta, formatMoney, formatValue, type MetricKind } from "./format";
import { computeWeekMetrics } from "./metrics";
import type { WeekMetrics } from "./types";
import { isWeekId, shiftWeek, trailingWeeks, weekLabel, weekRange } from "./weeks";

export type MetricKey =
  | "leads"
  | "speedToLead"
  | "booked"
  | "closeRate"
  | "revenue"
  | "jobMargin"
  | "openChangeOrders"
  | "reviewRate";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  kind: MetricKind;
  /** Which direction is good news for the owner. */
  betterWhen: "higher" | "lower";
  description: string;
  value: (m: WeekMetrics) => number | null;
  detail: (m: WeekMetrics) => string;
}

/** "1 job", "3 jobs". */
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const METRICS: readonly MetricDefinition[] = [
  {
    key: "leads",
    label: "Leads",
    kind: "count",
    betterWhen: "higher",
    description: "New leads that arrived during the week.",
    value: (m) => m.leads,
    detail: (m) => `${m.respondedLeads} of ${m.leads} got a response`,
  },
  {
    key: "speedToLead",
    label: "Speed to lead",
    kind: "minutes",
    betterWhen: "lower",
    description: "Median time from a lead arriving to the first response.",
    value: (m) => m.speedToLeadMinutes,
    detail: (m) => `median over ${plural(m.respondedLeads, "responded lead")}`,
  },
  {
    key: "booked",
    label: "Booked",
    kind: "count",
    betterWhen: "higher",
    description: "Estimate visits put on the calendar during the week.",
    value: (m) => m.booked,
    detail: (m) => `${plural(m.leads, "new lead")} the same week`,
  },
  {
    key: "closeRate",
    label: "Close rate",
    kind: "percent",
    betterWhen: "higher",
    description: "Share of estimates decided during the week that were won.",
    value: (m) => m.closeRate,
    detail: (m) => `${m.won} won of ${m.decided} decided`,
  },
  {
    key: "revenue",
    label: "Revenue",
    kind: "money",
    betterWhen: "higher",
    description: "Invoiced amount of jobs completed during the week.",
    value: (m) => m.revenue,
    detail: (m) => `${plural(m.jobsCompleted, "job")} completed`,
  },
  {
    key: "jobMargin",
    label: "Job margin",
    kind: "percent",
    betterWhen: "higher",
    description: "Revenue weighted gross margin of jobs completed during the week.",
    value: (m) => m.jobMargin,
    detail: (m) => `across ${plural(m.jobsCompleted, "completed job")}`,
  },
  {
    key: "openChangeOrders",
    label: "Open change orders",
    kind: "count",
    betterWhen: "lower",
    description: "Change orders requested but not yet approved or declined at week end.",
    value: (m) => m.openChangeOrders,
    detail: (m) => `${formatMoney(m.openChangeOrderValue)} waiting on a decision`,
  },
  {
    key: "reviewRate",
    label: "Review rate",
    kind: "percent",
    betterWhen: "higher",
    description: "Share of review requests sent during the week that produced a review.",
    value: (m) => m.reviewRate,
    detail: (m) => `${plural(m.reviewsReceived, "review")} from ${plural(m.reviewRequests, "request")}`,
  },
];

export type Direction = "up" | "down" | "flat" | "none";

export interface MetricView {
  key: MetricKey;
  label: string;
  description: string;
  kind: MetricKind;
  value: number | null;
  display: string;
  previous: number | null;
  delta: number | null;
  deltaDisplay: string;
  direction: Direction;
  /** True when the change is good news, false when bad, null when flat or unknown. */
  good: boolean | null;
  detail: string;
  /** One value per trend week, oldest first, ending with the selected week. */
  series: (number | null)[];
}

export interface DashboardView {
  source: string;
  weekId: string;
  weekLabel: string;
  /** Weeks the picker can offer, oldest first. */
  availableWeeks: string[];
  previousWeek: string | null;
  nextWeek: string | null;
  trendWeeks: string[];
  /** Set when the requested week could not be shown and another was used. */
  notice: string | null;
  metrics: MetricView[];
}

export interface DashboardOptions {
  /** Requested ISO week id. Defaults to the latest week with data. */
  week?: string;
  /** Number of weeks in each sparkline, including the selected week. */
  trendLength?: number;
}

export const DEFAULT_TREND_LENGTH = 12;

/** Compares two values and says which way the number moved and whether that is good. */
export function compare(
  current: number | null,
  previous: number | null,
  betterWhen: "higher" | "lower",
): { delta: number | null; direction: Direction; good: boolean | null } {
  if (current === null || previous === null) return { delta: null, direction: "none", good: null };
  const delta = current - previous;
  if (Math.abs(delta) < 1e-9) return { delta: 0, direction: "flat", good: null };
  const direction: Direction = delta > 0 ? "up" : "down";
  return { delta, direction, good: (direction === "up") === (betterWhen === "higher") };
}

export function buildMetricViews(byWeek: WeekMetrics[], previous: WeekMetrics | null): MetricView[] {
  const current = byWeek[byWeek.length - 1];
  return METRICS.map((def) => {
    const value = def.value(current);
    const before = previous ? def.value(previous) : null;
    const change = compare(value, before, def.betterWhen);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      kind: def.kind,
      value,
      display: formatValue(def.kind, value),
      previous: before,
      delta: change.delta,
      deltaDisplay: formatDelta(def.kind, value, before),
      direction: change.direction,
      good: change.good,
      detail: def.detail(current),
      series: byWeek.map((week) => def.value(week)),
    };
  });
}

export async function buildDashboard(source: DataSource, options: DashboardOptions = {}): Promise<DashboardView> {
  const availableWeeks = await source.listWeeks();
  if (availableWeeks.length === 0) throw new Error(`Data source "${source.name}" reported no weeks`);
  const latest = availableWeeks[availableWeeks.length - 1];
  const earliest = availableWeeks[0];

  let selected = latest;
  let notice: string | null = null;
  if (options.week !== undefined) {
    if (!isWeekId(options.week)) {
      notice = `"${options.week}" is not a valid ISO week. Showing the latest week instead.`;
    } else if (!availableWeeks.includes(options.week)) {
      notice = `No data for ${options.week}. Showing the latest week instead.`;
    } else {
      selected = options.week;
    }
  }

  const trendLength = Math.max(1, Math.floor(options.trendLength ?? DEFAULT_TREND_LENGTH));
  // Trend weeks never reach back before the first week the source has.
  const trendWeeks = trailingWeeks(selected, trendLength).filter((id) => id >= earliest);
  const previousWeek = selected > earliest ? shiftWeek(selected, -1) : null;
  const nextWeek = selected < latest ? shiftWeek(selected, 1) : null;

  // One fetch covers the trend plus the comparison week.
  const firstNeeded = previousWeek && previousWeek < trendWeeks[0] ? previousWeek : trendWeeks[0];
  const records = await source.fetchRecords({ from: weekRange(firstNeeded).from, to: weekRange(selected).to });

  const byWeek = trendWeeks.map((id) => computeWeekMetrics(records, id));
  const previous = previousWeek ? computeWeekMetrics(records, previousWeek) : null;

  return {
    source: source.name,
    weekId: selected,
    weekLabel: weekLabel(selected),
    availableWeeks,
    previousWeek,
    nextWeek,
    trendWeeks,
    notice,
    metrics: buildMetricViews(byWeek, previous),
  };
}
