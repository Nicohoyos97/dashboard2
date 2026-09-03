'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { setFirmClientStatus } from '@/lib/firm/clients';
import { setEntityStatus } from '@/lib/firm/entities';

import { secondaryButton } from './ui';

// Archive / restore a client or a business. Nothing is ever deleted.
export function StatusButton({
  kind,
  id,
  status,
}: {
  kind: 'client' | 'entity';
  id: string;
  status: 'active' | 'archived';
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next = status === 'active' ? 'archived' : 'active';

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res =
            kind === 'client'
              ? await setFirmClientStatus({ id, status: next })
              : await setEntityStatus({ id, status: next });
          if (res.ok) router.refresh();
        })
      }
      className={secondaryButton}
    >
      {status === 'active' ? t('archive') : t('restore')}
    </button>
  );
}
