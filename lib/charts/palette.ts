// Chart colors (INITIAL_PROMPT.md §6 tokens + dataviz method). Every
// categorical set below passed the dataviz validator (lightness band, chroma,
// CVD separation ≥ 8, normal-vision floor ≥ 15, contrast) on the light surface.
// Status colors (positive / warning / critical) are reserved for status and
// are never used as series colors; series hues are assigned in fixed order.
export const SERIES = {
  // Income vs Expense: teal against amber. Green stays reserved for positive
  // *status* and is never a series colour, and two hues separate better than
  // two shades of one under colour-vision deficiency.
  income: 'var(--chart-teal)',
  expense: 'var(--chart-amber)',
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

/**
 * The outstanding-liability line on the tax chart: a third hue from the
 * categorical set, kept away from the status colours, which are reserved for
 * status. It lives here rather than beside the chart so the chart's legend can
 * name the colour without importing the Recharts module that draws it — a value
 * import across that boundary would pull the whole library back into the page.
 */
export const LIABILITY = CATEGORICAL[3];
