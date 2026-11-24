import { NextResponse } from "next/server";
import { buildDashboard } from "../../../lib/dashboard";
import { getDataSource } from "../../../lib/data";

export const dynamic = "force-dynamic";

// GET /api/metrics?week=2026-W40&trend=12
// Returns the same view model the page renders, as JSON.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? undefined;
  const trend = Number(url.searchParams.get("trend"));
  try {
    const view = await buildDashboard(getDataSource(), {
      week,
      trendLength: Number.isInteger(trend) && trend >= 1 && trend <= 52 ? trend : undefined,
    });
    return NextResponse.json(view);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
