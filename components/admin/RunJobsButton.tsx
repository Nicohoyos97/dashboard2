'use client';

import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { runJobsNow } from '@/lib/documents/jobs';

import { secondaryButton } from './ui';

// Rendered only outside production (the page checks NODE_ENV).
export function RunJobsButton() {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await runJobsNow();
            setNotice(res.ok ? t('runJobsDone', { count: res.value.processed }) : res.error);
            router.refresh();
          })
        }
        className={secondaryButton}
      >
        <Play className="size-4" aria-hidden="true" />
        {isPending ? t('runJobsRunning') : t('runJobs')}
      </button>
      {notice && <span className="text-muted-foreground text-[13px]">{notice}</span>}
    </span>
  );
}
