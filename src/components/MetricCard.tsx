import type { MetricView } from "../lib/dashboard";
import { Sparkline } from "./Sparkline";

const ARROWS = { up: "▲", down: "▼", flat: "■", none: "" } as const;

export function MetricCard({ metric }: { metric: MetricView }) {
  const tone = metric.good === null ? "neutral" : metric.good ? "good" : "bad";
  const hasDelta = metric.direction !== "none";
  return (
    <article className="card" title={metric.description}>
      <div className="card-top">
        <h2>{metric.label}</h2>
        {hasDelta ? (
          <span className={`delta delta-${tone}`}>
            <span aria-hidden="true">{ARROWS[metric.direction]}</span> {metric.deltaDisplay}
          </span>
        ) : (
          <span className="delta delta-neutral">no comparison</span>
        )}
      </div>
      <p className="value">{metric.display}</p>
      <p className="detail">{metric.detail}</p>
      <Sparkline values={metric.series} label={`${metric.label} trend over ${metric.series.length} weeks`} />
    </article>
  );
}
