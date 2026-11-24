// Sparkline geometry, kept free of React so it can be unit tested and reused
// by the terminal demo.

export interface SparkPoint {
  x: number;
  y: number;
}

export interface SparkGeometry {
  /** One entry per input value. Null where the input was null. */
  points: (SparkPoint | null)[];
  /** SVG path data. Null values break the line into separate segments. */
  path: string;
  /** The last non null point, used for the end marker. */
  last: SparkPoint | null;
}

function bounds(values: (number | null)[]): { min: number; max: number } | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  return { min: Math.min(...present), max: Math.max(...present) };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function sparkGeometry(values: (number | null)[], width: number, height: number, pad = 2): SparkGeometry {
  const range = bounds(values);
  if (!range) return { points: values.map(() => null), path: "", last: null };
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const span = range.max - range.min;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    // A flat series is drawn through the vertical middle.
    const level = span === 0 ? 0.5 : (value - range.min) / span;
    return { x: round(pad + index * step), y: round(pad + innerH - level * innerH) };
  });

  let path = "";
  let penDown = false;
  let last: SparkPoint | null = null;
  for (const point of points) {
    if (!point) {
      penDown = false;
      continue;
    }
    path += `${penDown ? " L" : path ? " M" : "M"}${point.x} ${point.y}`;
    penDown = true;
    last = point;
  }
  return { points, path, last };
}

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Text sparkline for terminals. Null values render as a space. */
export function sparkText(values: (number | null)[]): string {
  const range = bounds(values);
  if (!range) return " ".repeat(values.length);
  const span = range.max - range.min;
  return values
    .map((value) => {
      if (value === null || !Number.isFinite(value)) return " ";
      const level = span === 0 ? 0.5 : (value - range.min) / span;
      return BLOCKS[Math.min(BLOCKS.length - 1, Math.floor(level * BLOCKS.length))];
    })
    .join("");
}
