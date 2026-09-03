// Chart colors (INITIAL_PROMPT.md §6 tokens + dataviz method). Every
// categorical set below passed the dataviz validator (lightness band, chroma,
// CVD separation ≥ 8, normal-vision floor ≥ 15, contrast) on the light surface.
// Status colors (positive / warning / critical) are reserved for status and
// are never used as series colors; series hues are assigned in fixed order.
export const SERIES = {
  cashIn: '#2563eb', // blue — money in
  cashOut: '#d97706', // amber — money out
  net: '#0d9488', // teal — net / balance line
  primary: '#2563eb',
  secondary: '#0d9488',
} as const;

// Fixed-order categorical hues for compositions (≤ 5 classes; the rest fold
// into "Other").
export const CATEGORICAL = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#db2777'] as const;

export const CHART_CHROME = {
  grid: '#e6ecf4',
  axis: '#64748b',
  surface: '#ffffff',
} as const;

export const MAX_CATEGORIES = CATEGORICAL.length;
