'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import { createEntity, updateEntityConfig } from '@/lib/firm/entities';

import { BusinessFields } from './BusinessFields';
import { businessIncomplete, EMPTY_BUSINESS, type EntityFormValues } from './business-form';
import { primaryButton, secondaryButton } from './ui';

export type { EntityFormValues };

// Create / edit a business and its firm-controlled configuration (§5 columns).
// A client's *first* business is created with the client itself in
// ClientDialog; this is for the second one, and for editing either.
export function EntityDialog({
  mode,
  clientId,
  entityId,
  initial,
}: {
  mode: 'create' | 'edit';
  clientId?: string;
  entityId?: string;
  initial?: EntityFormValues;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EntityFormValues>(initial ?? EMPTY_BUSINESS);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createEntity({ clientId, ...values });
        if (!res.ok) return setError(res.error);
        setOpen(false);
        router.push(`/admin/entities/${res.value.id}`);
        return;
      }
      const res = await updateEntityConfig({ id: entityId, ...values });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={mode === 'create' ? primaryButton : secondaryButton}>
          {mode === 'create' && <Plus className="size-4" aria-hidden="true" />}
          {mode === 'create' ? t('newBusiness') : t('editBusiness')}
        </button>
      </DialogTrigger>
      {/* `sm:` deliberately — see ClientDialog. */}
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('newBusiness') : t('editBusiness')}</DialogTitle>
          <DialogDescription>{t('configTitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <BusinessFields values={values} onChange={setValues} onError={setError} />

          {error && (
            <p role="alert" className="text-danger text-[13.5px]">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isPending || businessIncomplete(values)}
              className={primaryButton}
            >
              {isPending
                ? mode === 'create'
                  ? t('creating')
                  : t('saving')
                : mode === 'create'
                  ? t('create')
                  : t('save')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
