'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { THEME_EVENT, THEME_STORAGE_KEY, type Theme } from '@/lib/theme/constants';

type ThemeContextValue = { theme: Theme | null; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    const rootTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setThemeState(rootTheme);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      const next = event.matches ? 'dark' : 'light';
      applyTheme(next);
      setThemeState(next);
    };
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme(next) {
        localStorage.setItem(THEME_STORAGE_KEY, next);
        applyTheme(next);
        setThemeState(next);
        window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('theme_provider_missing');
  return value;
}
