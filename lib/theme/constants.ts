export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'hb-theme';
export const THEME_EVENT = 'hb-theme-change';

// Runs before React hydrates so persisted/system dark mode never flashes light.
// The string is static application code; no user-controlled value is interpolated.
export const THEME_INIT_SCRIPT = `
try {
  var saved = localStorage.getItem('${THEME_STORAGE_KEY}');
  var theme = saved === 'light' || saved === 'dark'
    ? saved
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
} catch (_) {}
`;
