// ISO 8601 week helpers. Weeks start on Monday 00:00 UTC and are named
// like "2026-W40". All math is done in UTC so results do not depend on the
// machine the code runs on.

import type { TimeRange } from "./types";

export const MS_MINUTE = 60_000;
export const MS_HOUR = 60 * MS_MINUTE;
export const MS_DAY = 24 * MS_HOUR;
export const MS_WEEK = 7 * MS_DAY;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Monday 00:00 UTC of the week containing the given instant. */
export function weekStart(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * MS_DAY);
}

export function addWeeks(date: Date, count: number): Date {
  return new Date(date.getTime() + count * MS_WEEK);
}

/** ISO week id of the week containing the given instant. */
export function weekId(date: Date): string {
  const monday = weekStart(date);
  // The ISO year of a week is the calendar year of its Thursday.
  const thursday = new Date(monday.getTime() + 3 * MS_DAY);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / MS_WEEK) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday of the given ISO week, or null when the id is malformed or does not exist. */
export function parseWeekId(id: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  // January 4th always falls in ISO week 1.
  const firstMonday = weekStart(new Date(Date.UTC(year, 0, 4)));
  const monday = addWeeks(firstMonday, week - 1);
  // Rejects week 53 in years that only have 52 weeks.
  return weekId(monday) === id ? monday : null;
}

export function isWeekId(id: string): boolean {
  return parseWeekId(id) !== null;
}

function requireWeek(id: string): Date {
  const monday = parseWeekId(id);
  if (!monday) throw new Error(`Invalid ISO week id: ${id}`);
  return monday;
}

export function weekRange(id: string): TimeRange {
  const from = requireWeek(id);
  return { from, to: addWeeks(from, 1) };
}

export function shiftWeek(id: string, count: number): string {
  return weekId(addWeeks(requireWeek(id), count));
}

/** The n weeks ending with (and including) the given week, oldest first. */
export function trailingWeeks(id: string, count: number): string[] {
  const end = requireWeek(id);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(weekId(addWeeks(end, -i)));
  return out;
}

/** Every week from first to last inclusive, oldest first. */
export function weeksBetween(firstId: string, lastId: string): string[] {
  const first = requireWeek(firstId);
  const last = requireWeek(lastId);
  const out: string[] = [];
  for (let t = first.getTime(); t <= last.getTime(); t += MS_WEEK) out.push(weekId(new Date(t)));
  return out;
}

/** Human label such as "Sep 28 to Oct 4, 2026". */
export function weekLabel(id: string): string {
  const from = requireWeek(id);
  const last = new Date(from.getTime() + 6 * MS_DAY);
  const a = `${MONTHS[from.getUTCMonth()]} ${from.getUTCDate()}`;
  const b = `${MONTHS[last.getUTCMonth()]} ${last.getUTCDate()}, ${last.getUTCFullYear()}`;
  return `${a} to ${b}`;
}
