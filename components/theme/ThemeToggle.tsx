'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';

import { useTheme } from './ThemeProvider';

export function ThemeToggle({
  compact = false,
  variant = 'group',
}: {
  compact?: boolean;
  variant?: 'group' | 'icon';
}) {
  const t = useTranslations('Theme');
  const { theme, setTheme } = useTheme();

  if (variant === 'icon') {
    const isDark = theme === 'dark';
    const label = isDark ? t('toLight') : t('toDark');
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className="text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:ring-blue/40 inline-flex size-10 items-center justify-center rounded-xl transition outline-none focus-visible:ring-3"
      >
        {isDark ? (
          <Sun className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Moon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('selector')}
      className="border-line bg-secondary/70 inline-flex h-10 items-center rounded-full border p-1 shadow-sm"
    >
      <ThemeOption
        label={t('light')}
        active={theme === 'light'}
        compact={compact}
        onClick={() => setTheme('light')}
      >
        <Sun className="size-4" aria-hidden="true" />
      </ThemeOption>
      <ThemeOption
        label={t('dark')}
        active={theme === 'dark'}
        compact={compact}
        onClick={() => setTheme('dark')}
      >
        <Moon className="size-4" aria-hidden="true" />
      </ThemeOption>
    </div>
  );
}

function ThemeOption({
  label,
  active,
  compact,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  compact: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-blue/40 inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition outline-none focus-visible:ring-3',
        active ? 'bg-card text-ink shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  );
}
