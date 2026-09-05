// Placeholder shown while a chart's Recharts bundle loads.
//
// It fills the height its caller already reserves, so the swap is invisible to
// layout: the wrapper keeps the fixed-height box and only its contents change,
// which is what keeps CLS at zero. Decorative — the figure's caption carries
// the reading for screen readers and is server-rendered either way.
export function ChartSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-secondary/50 motion-safe:animate-pulse h-full w-full rounded-xl"
    />
  );
}
