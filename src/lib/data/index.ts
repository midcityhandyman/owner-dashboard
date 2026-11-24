// Picks the data source from environment variables. The default is the
// seeded fake, so the app, the tests and the demo all run with no keys.

import { isWeekId } from "../weeks";
import type { DataSource } from "./adapter";
import { createFakeSource, DEFAULT_FAKE_OPTIONS } from "./fake";
import { createSupabaseSource } from "./supabase";

export type Env = Record<string, string | undefined>;

export function getDataSource(env: Env = process.env): DataSource {
  const kind = (env.DATA_SOURCE ?? "fake").trim().toLowerCase();

  if (kind === "supabase") {
    return createSupabaseSource({ url: env.SUPABASE_URL ?? "", key: env.SUPABASE_SERVICE_ROLE_KEY ?? "" });
  }
  if (kind !== "fake") {
    throw new Error(`Unknown DATA_SOURCE "${kind}". Use "fake" or "supabase".`);
  }

  const seed = Number(env.FAKE_SEED);
  const weeks = Number(env.FAKE_WEEKS);
  const anchor = env.FAKE_ANCHOR_WEEK;
  return createFakeSource({
    seed: env.FAKE_SEED && Number.isInteger(seed) ? seed : DEFAULT_FAKE_OPTIONS.seed,
    weeks: env.FAKE_WEEKS && Number.isInteger(weeks) && weeks > 0 ? weeks : DEFAULT_FAKE_OPTIONS.weeks,
    anchorWeek: anchor && isWeekId(anchor) ? anchor : DEFAULT_FAKE_OPTIONS.anchorWeek,
  });
}

export type { DataSource } from "./adapter";
