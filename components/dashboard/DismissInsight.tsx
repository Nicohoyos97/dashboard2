'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { dismissInsight } from '@/lib/insights/dismiss';

/**
 * The circle that checks an insight off (§7). It hides the row optimistically
 * so the tick feels immediate, and puts it back if the write fails — a line
 * that silently vanished without being recorded would come back on the next
 * load with no explanation.
 */
export function DismissInsight({
  ruleKey,
  periodStart,
  periodEnd,
  children,
}: {
  ruleKey: string;
  periodStart: string;
  periodEnd: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('Overview');
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <li className="group flex items-start gap-3">
      {/* The circle is 20 px to sit beside a line of text; its hit area is 44. */}
      <button
        type="button"
        aria-label={t('insightDismiss')}
        title={t('insightDismiss')}
        onClick={() => {
          setFailed(false);
          setHidden(true);
          startTransition(async () => {
            const result = await dismissInsight({ ruleKey, periodStart, periodEnd });
            if (!result.ok) {
              setHidden(false);
              setFailed(true);
            }
          });
        }}
        className="border-line text-muted-foreground hover:border-success hover:text-success focus-visible:ring-brand/40 relative mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border transition outline-none after:absolute after:-inset-3 after:content-[''] focus-visible:ring-3"
      >
        <Check className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1">
        {children}
        {failed && <span className="text-danger mt-1 block text-caption">{t('insightDismissFailed')}</span>}
      </span>
    </li>
  );
}
