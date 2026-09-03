// Chart colors (INITIAL_PROMPT.md §6 tokens + dataviz method). Every
// categorical set below passed the dataviz validator (lightness band, chroma,
// CVD separation ≥ 8, normal-vision floor ≥ 15, contrast) on the light surface.
// Status colors (positive / warning / critical) are reserved for status and
// are never used as series colors; series hues are assigned in fixed order.
export const SERIES = {
  cashIn: 'var(--chart-blue)', // blue — money in
  cashOut: 'var(--chart-amber)', // amber — money out
  net: 'var(--chart-teal)', // teal — net / balance line
  primary: 'var(--chart-blue)',
  secondary: 'var(--chart-teal)',
} as const;

// Fixed-order categorical hues for compositions (≤ 5 classes; the rest fold
// into "Other").
export const CATEGORICAL = [
  'var(--chart-blue)',
  'var(--chart-teal)',
  'var(--chart-purple)',
  'var(--chart-amber)',
  'var(--chart-pink)',
] as const;

export const CHART_CHROME = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  surface: 'var(--chart-surface)',
} as const;

export const MAX_CATEGORIES = CATEGORICAL.length;
