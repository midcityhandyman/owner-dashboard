import { sparkGeometry } from "../lib/sparkline";

interface SparklineProps {
  values: (number | null)[];
  label: string;
  width?: number;
  height?: number;
}

/** Small inline SVG trend line. Server rendered, no client JavaScript. */
export function Sparkline({ values, label, width = 160, height = 40 }: SparklineProps) {
  const { path, last } = sparkGeometry(values, width, height, 4);
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {path ? <path d={path} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {last ? <circle cx={last.x} cy={last.y} r={3} /> : null}
    </svg>
  );
}
