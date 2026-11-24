// Offline demo: prints the dashboard as text for two weeks of the seeded
// fake data source, then proves the data is deterministic.
// Run with: npm run demo

import { createHash } from "node:crypto";
import { buildDashboard, type DashboardView } from "../src/lib/dashboard";
import { createFakeSource, DEFAULT_FAKE_OPTIONS, generateFakeRecords } from "../src/lib/data/fake";
import { sparkText } from "../src/lib/sparkline";
import { shiftWeek } from "../src/lib/weeks";

const ARROW = { up: "up", down: "down", flat: "flat", none: "" } as const;

function render(view: DashboardView): string {
  const lines: string[] = [];
  lines.push(`Week ${view.weekId}  (${view.weekLabel})`);
  lines.push(`Trend: ${view.trendWeeks.length} weeks, ${view.trendWeeks[0]} to ${view.weekId}`);
  if (view.notice) lines.push(`Notice: ${view.notice}`);
  lines.push("");
  lines.push(`${"Metric".padEnd(20)}${"Value".padStart(10)}  ${"vs last week".padEnd(22)}${"Trend".padEnd(14)}Detail`);
  lines.push("-".repeat(104));
  for (const m of view.metrics) {
    const verdict = m.good === null ? "" : m.good ? " good" : " bad";
    const change = m.direction === "none" ? "n/a" : `${m.deltaDisplay} (${ARROW[m.direction]}${verdict})`;
    lines.push(
      `${m.label.padEnd(20)}${m.display.padStart(10)}  ${change.padEnd(22)}${sparkText(m.series).padEnd(14)}${m.detail}`,
    );
  }
  return lines.join("\n");
}

function fingerprint(): string {
  return createHash("sha256").update(JSON.stringify(generateFakeRecords(DEFAULT_FAKE_OPTIONS))).digest("hex").slice(0, 16);
}

async function main() {
  const source = createFakeSource();
  const records = generateFakeRecords(DEFAULT_FAKE_OPTIONS);

  console.log("Owner dashboard demo");
  console.log(`Data source: ${source.name}, anchor ${DEFAULT_FAKE_OPTIONS.anchorWeek}, ${DEFAULT_FAKE_OPTIONS.weeks} weeks`);
  console.log(
    `Synthetic records: ${records.leads.length} leads, ${records.jobs.length} jobs, ` +
      `${records.changeOrders.length} change orders, ${records.reviewRequests.length} review requests`,
  );
  console.log("");

  console.log("== Latest week (default view) ==");
  const latest = await buildDashboard(source);
  console.log(render(latest));
  console.log("");

  const earlier = shiftWeek(latest.weekId, -8);
  console.log(`== Week picker: jump back 8 weeks to ${earlier} ==`);
  console.log(render(await buildDashboard(source, { week: earlier })));
  console.log("");

  console.log("== Week picker: a week with no data falls back ==");
  const missing = await buildDashboard(source, { week: "2031-W01" });
  console.log(`Requested 2031-W01, showing ${missing.weekId}. ${missing.notice}`);
  console.log("");

  console.log("== Determinism check ==");
  const a = fingerprint();
  const b = fingerprint();
  console.log(`Run 1 fingerprint: ${a}`);
  console.log(`Run 2 fingerprint: ${b}`);
  console.log(a === b ? "Identical: the fake data source is deterministic." : "MISMATCH: data is not deterministic.");
  if (a !== b) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
