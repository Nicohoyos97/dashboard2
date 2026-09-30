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

/**
 * The trend inside a KPI card, drawn the way the hoyosbaker-voice cards draw
 * it: the metric's own published periods as a line over a flat 16% fill,
 * sized to bleed into the card's bottom-right corner (the card clips it).
 *
 * With fewer than two periods, or a series that never moves, there is no
 * shape to draw, and the card gets a dashed rule instead of a hole: a row of
 * cards where some have a line and some a gap reads as broken. Dashed, because
 * a solid rule across the foot of a card reads as a stray border. It never
 * implies movement, which is why it is dead straight.
 */
export function Sparkline({
  values,
  tone,
  width = 96,
  height = 34,
}: {
  values: readonly number[];
  tone: SparklineTone;
  width?: number;
  height?: number;
}) {
  const flat = values.length < 2 || Math.min(...values) === Math.max(...values);
  if (flat) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="text-muted-foreground shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <line
          x1={10}
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="3 4"
          opacity="0.55"
        />
      </svg>
    );
  }

  const inset = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const stepX = (width - inset * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: inset + index * stepX,
    y: inset + (1 - (value - min) / (max - min)) * (height - inset * 2),
  }));
  const line = trendPath(points);
  const last = points[points.length - 1] ?? { x: width - inset };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={`${TONE_CLASS[tone]} shrink-0`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={`${line} L ${last.x} ${height} L ${inset} ${height} Z`} fill="currentColor" fillOpacity="0.16" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
