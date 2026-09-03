// A KPI trend sketch: no axes, no ticks, no tooltip. The figure and the delta
// pill beside it already state the change in text, so the shape is decorative
// and hidden from assistive tech rather than duplicating that summary.
// Plain SVG so KPI cards stay server-rendered with no chart runtime.

export type SparklineTone = 'positive' | 'negative' | 'neutral';

const TONE_CLASS: Record<SparklineTone, string> = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: 'text-muted-foreground',
};

type Point = { x: number; y: number };

// Cubic segments whose control points share their endpoint's y: a smooth wave
// that can never overshoot above the highest or below the lowest real value.
// Two points are joined straight — a curve there would draw a shape the data
// does not have.
function trendPath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;
  let previous = first;
  for (const point of rest) {
    if (points.length === 2) {
      d += ` L ${point.x} ${point.y}`;
    } else {
      const midX = (previous.x + point.x) / 2;
      d += ` C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    }
    previous = point;
  }
  return d;
}

export function Sparkline({
  values,
  tone,
  width = 84,
  height = 36,
}: {
  values: readonly number[];
  tone: SparklineTone;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const inset = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - inset * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: inset + index * stepX,
    y: inset + (1 - (value - min) / span) * (height - inset * 2),
  }));
  const line = trendPath(points);
  // Identical per tone, so a duplicate id across cards resolves to an
  // identical gradient — the stops read `currentColor` from this <svg>.
  const gradientId = `sparkline-${tone}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={`${TONE_CLASS[tone]} shrink-0`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line} L ${width - inset} ${height} L ${inset} ${height} Z`}
        fill={`url(#${gradientId})`}
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
