// Seeded fake data source. It simulates a small service business: leads come
// in, some get a reply, some book an estimate, some estimates are won, won
// work becomes jobs, jobs pick up change orders and review requests.
//
// Everything is derived from (seed, anchor week, week count). There is no
// call to Date.now() or Math.random(), so the output is identical everywhere.
// All records are synthetic. No names, phones, emails or addresses exist.

import type { ChangeOrder, Job, Lead, LeadSource, RawRecords, ReviewRequest, TimeRange } from "../types";
import { chance, mixSeed, mulberry32, pick, randomInt, type Rng } from "../prng";
import { addWeeks, MS_DAY, MS_HOUR, MS_MINUTE, MS_WEEK, parseWeekId, weekId } from "../weeks";
import { filterRecords, type DataSource } from "./adapter";

export interface FakeOptions {
  seed: number;
  /** Last week with data. The simulated "now" is the end of this week. */
  anchorWeek: string;
  /** How many weeks of history to generate. */
  weeks: number;
}

export const DEFAULT_FAKE_OPTIONS: FakeOptions = { seed: 42, anchorWeek: "2026-W40", weeks: 26 };

const SOURCES: readonly LeadSource[] = ["web_form", "web_form", "phone", "phone", "referral", "repeat"];
// Monday to Sunday. Weekends are quieter.
const DAY_WEIGHTS = [5, 5, 5, 4, 4, 2, 1];

function weightedDay(rng: Rng): number {
  const total = DAY_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let day = 0; day < DAY_WEIGHTS.length; day++) {
    roll -= DAY_WEIGHTS[day];
    if (roll < 0) return day;
  }
  return DAY_WEIGHTS.length - 1;
}

// The simulated team improves over this many weeks leading up to the anchor.
const RAMP_WEEKS = 26;

/** Response delay in minutes: mostly quick, with a long tail of slow replies. */
function responseDelayMinutes(rng: Rng, age: number): number {
  // Replies get faster toward the anchor week, so the trend line has a shape.
  const improvement = 1 - 0.45 * Math.max(0, 1 - age / RAMP_WEEKS);
  if (chance(rng, 0.7)) return Math.round((2 + rng() * 22) * improvement);
  if (chance(rng, 0.7)) return Math.round((30 + rng() * 150) * improvement);
  return Math.round(240 + rng() * 1200);
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

export function generateFakeRecords(options: FakeOptions = DEFAULT_FAKE_OPTIONS): RawRecords {
  const anchorStart = parseWeekId(options.anchorWeek);
  if (!anchorStart) throw new Error(`Invalid anchor week: ${options.anchorWeek}`);
  if (!Number.isInteger(options.weeks) || options.weeks < 1) throw new Error("weeks must be a positive integer");

  const now = addWeeks(anchorStart, 1).getTime();
  // Events that would land after the simulated "now" have not happened yet.
  const happened = (t: number) => t < now;
  const iso = (t: number) => new Date(t).toISOString();

  const leads: Lead[] = [];
  const jobs: Job[] = [];
  const changeOrders: ChangeOrder[] = [];
  const reviewRequests: ReviewRequest[] = [];

  for (let w = 0; w < options.weeks; w++) {
    // Everything about a week depends only on the seed, the week itself and
    // its distance from the anchor, never on how much history was requested.
    // That keeps a week identical when the history length changes.
    const age = options.weeks - 1 - w;
    const start = addWeeks(anchorStart, -age);
    const tag = weekId(start);
    const absoluteWeek = Math.round(start.getTime() / MS_WEEK);
    const rng = mulberry32(mixSeed(options.seed, absoluteWeek));
    const season = 6 * Math.sin(absoluteWeek / 4);
    const growth = 8 * Math.max(0, 1 - age / RAMP_WEEKS);
    const leadCount = Math.max(4, Math.round(20 + season + growth + (rng() * 8 - 4)));

    for (let n = 1; n <= leadCount; n++) {
      const id = `${tag}-${String(n).padStart(3, "0")}`;
      const created =
        start.getTime() + weightedDay(rng) * MS_DAY + randomInt(rng, 7, 19) * MS_HOUR + randomInt(rng, 0, 59) * MS_MINUTE;
      const lead: Lead = {
        id: `lead-${id}`,
        source: pick(rng, SOURCES),
        createdAt: iso(created),
        firstResponseAt: null,
        bookedAt: null,
        outcome: "open",
        decidedAt: null,
      };
      leads.push(lead);

      if (chance(rng, 0.88)) {
        const responded = created + responseDelayMinutes(rng, age) * MS_MINUTE;
        if (happened(responded)) lead.firstResponseAt = iso(responded);
      }
      if (!lead.firstResponseAt || !chance(rng, 0.52)) continue;

      const booked = Date.parse(lead.firstResponseAt) + randomInt(rng, 1, 96) * MS_HOUR;
      if (!happened(booked)) continue;
      lead.bookedAt = iso(booked);
      if (!chance(rng, 0.8)) continue;

      const decided = booked + randomInt(rng, 2, 12) * MS_DAY + randomInt(rng, 0, 9) * MS_HOUR;
      if (!happened(decided)) continue;
      lead.decidedAt = iso(decided);
      lead.outcome = chance(rng, 0.46 + 0.1 * Math.sin(absoluteWeek / 3)) ? "won" : "lost";
      if (lead.outcome !== "won") continue;

      const revenue = roundTo(chance(rng, 0.75) ? 600 + rng() * 5400 : 6000 + rng() * 18000, 25);
      const costShare = 0.52 + rng() * 0.26;
      const completed = decided + randomInt(rng, 5, 30) * MS_DAY + randomInt(rng, 0, 8) * MS_HOUR;
      const job: Job = {
        id: `job-${id}`,
        leadId: lead.id,
        completedAt: happened(completed) ? iso(completed) : null,
        revenue,
        cost: roundTo(revenue * costShare, 5),
      };
      jobs.push(job);

      if (chance(rng, 0.35)) {
        const requested = decided + Math.round(rng() * (completed - decided));
        const resolved = requested + randomInt(rng, 1, 14) * MS_DAY;
        const willResolve = chance(rng, 0.85);
        if (happened(requested)) {
          const isResolved = willResolve && happened(resolved);
          changeOrders.push({
            id: `co-${id}`,
            jobId: job.id,
            amount: roundTo(150 + rng() * 2350, 25),
            requestedAt: iso(requested),
            resolvedAt: isResolved ? iso(resolved) : null,
            resolution: isResolved ? (chance(rng, 0.8) ? "approved" : "declined") : null,
          });
        }
      }

      if (job.completedAt && chance(rng, 0.85)) {
        const sent = completed + randomInt(rng, 1, 3) * MS_DAY;
        if (happened(sent)) {
          const received = sent + randomInt(rng, 0, 9) * MS_DAY + randomInt(rng, 1, 20) * MS_HOUR;
          const got = chance(rng, 0.38) && happened(received);
          reviewRequests.push({
            id: `rr-${id}`,
            jobId: job.id,
            sentAt: iso(sent),
            reviewReceivedAt: got ? iso(received) : null,
            rating: got ? (chance(rng, 0.8) ? 5 : 4) : null,
          });
        }
      }
    }
  }

  return { leads, jobs, changeOrders, reviewRequests };
}

export function createFakeSource(options: Partial<FakeOptions> = {}): DataSource {
  const resolved: FakeOptions = { ...DEFAULT_FAKE_OPTIONS, ...options };
  // Generation is cheap, but there is no reason to repeat it per request.
  let cache: RawRecords | null = null;
  const all = () => (cache ??= generateFakeRecords(resolved));
  const anchorStart = parseWeekId(resolved.anchorWeek);
  if (!anchorStart) throw new Error(`Invalid anchor week: ${resolved.anchorWeek}`);

  return {
    name: `fake (seed ${resolved.seed})`,
    async listWeeks() {
      const out: string[] = [];
      for (let w = resolved.weeks - 1; w >= 0; w--) out.push(weekId(addWeeks(anchorStart, -w)));
      return out;
    },
    async fetchRecords(range: TimeRange) {
      return filterRecords(all(), range);
    },
  };
}
