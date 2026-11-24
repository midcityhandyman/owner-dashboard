import { MetricCard } from "../components/MetricCard";
import { WeekPicker } from "../components/WeekPicker";
import { buildDashboard } from "../lib/dashboard";
import { getDataSource } from "../lib/data";
import { weekLabel } from "../lib/weeks";

// The page depends on the query string and on the data source, so it is
// rendered per request instead of at build time.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ week?: string | string[] }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const week = typeof params.week === "string" ? params.week : undefined;
  const view = await buildDashboard(getDataSource(), { week });
  const options = [...view.availableWeeks].reverse().map((id) => ({ id, label: `${id}  (${weekLabel(id)})` }));
  const first = view.trendWeeks[0];

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Owner dashboard</p>
          <h1>Week of {view.weekLabel}</h1>
        </div>
        <WeekPicker current={view.weekId} previous={view.previousWeek} next={view.nextWeek} options={options} />
      </header>

      {view.notice ? (
        <p className="notice" role="status">
          {view.notice}
        </p>
      ) : null}

      <section className="grid" aria-label="Weekly metrics">
        {view.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <footer className="footer">
        <span>
          Change is against the previous week. Sparklines cover {view.trendWeeks.length} weeks, {first} to {view.weekId}.
        </span>
        <span>Data source: {view.source}</span>
      </footer>
    </main>
  );
}
