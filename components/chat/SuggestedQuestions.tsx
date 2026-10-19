'use client';

import { useTranslations } from 'next-intl';

export function SuggestedQuestions({
  keys,
  onPick,
  disabled,
}: {
  keys: readonly string[];
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations('Nick');
  if (keys.length === 0) return null;
  return (
    <div>
      <p className="text-muted-foreground text-caption font-semibold tracking-[0.1em] uppercase">
        {t('suggestionsTitle')}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {keys.map((key) => {
          const text = t(key);
          return (
            <li key={key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(text)}
                className="border-line bg-card text-ink hover:border-brand/50 hover:bg-blue-pale hover:text-link focus-visible:ring-brand/40 rounded-full border px-3 py-1.5 text-small font-medium transition outline-none focus-visible:ring-3 disabled:opacity-50"
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
