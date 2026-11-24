// Display formatting for metric values and week over week changes.

export type MetricKind = "count" | "minutes" | "percent" | "money";

const EMPTY = "n/a";

function sign(value: number): string {
  return value > 0 ? "+" : value < 0 ? "-" : "";
}

function withCommas(value: number): string {
  return Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMinutes(minutes: number): string {
  const total = Math.round(Math.abs(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatMoney(dollars: number): string {
  return `${dollars < 0 ? "-" : ""}$${withCommas(dollars)}`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatValue(kind: MetricKind, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return EMPTY;
  switch (kind) {
    case "count":
      return `${value < 0 ? "-" : ""}${withCommas(value)}`;
    case "minutes":
      return formatMinutes(value);
    case "percent":
      return formatPercent(value);
    case "money":
      return formatMoney(value);
  }
}

/**
 * True when a change is too small to show at the precision formatDelta prints.
 * The dashboard treats such a change as flat, so a card never reads
 * "0 min" next to an up or down arrow.
 */
export function roundsToZero(kind: MetricKind, current: number, previous: number): boolean {
  const delta = current - previous;
  switch (kind) {
    case "count":
      return delta === 0;
    case "minutes":
      return Math.round(delta) === 0;
    case "percent":
      return Math.abs(delta * 100) < 0.05;
    case "money":
      return previous === 0 ? delta === 0 : Math.abs((delta / previous) * 100) < 0.05;
  }
}

/**
 * Week over week change. Counts show the absolute change, money shows percent
 * change, rates show percentage points and durations show minutes.
 */
export function formatDelta(kind: MetricKind, current: number | null, previous: number | null): string {
  if (current === null || previous === null) return EMPTY;
  const delta = current - previous;
  switch (kind) {
    case "count":
      return delta === 0 ? "0" : `${sign(delta)}${withCommas(delta)}`;
    case "minutes":
      return Math.round(delta) === 0 ? "0 min" : `${sign(delta)}${formatMinutes(delta)}`;
    case "percent": {
      const points = delta * 100;
      return Math.abs(points) < 0.05 ? "0.0 pts" : `${sign(points)}${Math.abs(points).toFixed(1)} pts`;
    }
    case "money": {
      if (previous === 0) return delta === 0 ? "0.0%" : `${sign(delta)}${formatMoney(Math.abs(delta))}`;
      const change = (delta / previous) * 100;
      return Math.abs(change) < 0.05 ? "0.0%" : `${sign(change)}${Math.abs(change).toFixed(1)}%`;
    }
  }
}
