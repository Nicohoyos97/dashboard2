'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';

import { useTheme } from './ThemeProvider';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Theme');
  const { theme, setTheme } = useTheme();

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
        'focus-visible:ring-blue/40 inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold outline-none transition focus-visible:ring-3',
        active
          ? 'bg-card text-ink shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  );
}
