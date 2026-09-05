'use client';

import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
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
import { type ClientInput, updateFirmClient } from '@/lib/firm/clients';
import { createClientWithBusiness } from '@/lib/firm/onboarding';

import { EMPTY_BUSINESS, type EntityFormValues } from './business-form';
import { ClientFields, type InviteValues } from './ClientFields';
import { card, primaryButton, secondaryButton } from './ui';

// The business + invitation half of the form, loaded only once the dialog is
// open — see ClientOnboardingFields for why. The skeleton holds the dialog's
// height so opening it does not jump.
const ClientOnboardingFields = dynamic(
  () => import('./ClientOnboardingFields').then((m) => m.ClientOnboardingFields),
  { ssr: false, loading: () => <div className="bg-secondary/60 h-64 animate-pulse rounded-xl" /> },
);

const EMPTY_CLIENT: ClientInput = { name: '', contactName: '', contactEmail: '', notes: '' };

// Create a client, or edit one.
//
// Creating is the whole setup in one submit (§8): the client, its first
// business with its logo, industry and modules, and the invitation that lets
// the owner in. Splitting these across three screens meant a client could sit
// half-provisioned — a record with no business, or a business nobody could
// open. Editing stays what it was: the client's own fields, nothing else.
export function ClientDialog({
  mode,
  clientId,
  initial,
}: {
  mode: 'create' | 'edit';
  clientId?: string;
  initial?: ClientInput;
}) {
  const t = useTranslations('Admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<ClientInput>(initial ?? EMPTY_CLIENT);
  const [business, setBusiness] = useState<EntityFormValues>(EMPTY_BUSINESS);
  // The firm's own language is the better guess for the client they are
  // setting up than a fixed default; it stays a choice either way.
  const [invite, setInvite] = useState<InviteValues>({
    email: '',
    fullName: '',
    role: 'client_owner',
    locale: useLocale() as InviteValues['locale'],
  });
  const [error, setError] = useState<string | null>(null);
  // A created client whose invitation did not go out: the records exist, so
  // the dialog reports it instead of failing, and the firm continues.
  const [warning, setWarning] = useState<{ text: string; entityId: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // The business is usually named after the client and the contact is usually
  // the person invited, so those fields follow along until they are edited on
  // their own. Never overwrites something already typed.
  function editClient(next: ClientInput) {
    setBusiness((b) => (b.name === client.name ? { ...b, name: next.name } : b));
    setInvite((i) => ({
      ...i,
      email: i.email === client.contactEmail ? next.contactEmail : i.email,
      fullName: i.fullName === client.contactName ? next.contactName : i.fullName,
    }));
    setClient(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    startTransition(async () => {
      if (mode === 'edit') {
        const res = await updateFirmClient({ id: clientId, ...client });
        if (!res.ok) return setError(res.error);
        setOpen(false);
        router.refresh();
        return;
      }
      const res = await createClientWithBusiness({ client, business, invite });
      if (!res.ok) return setError(res.error);
      if (res.value.inviteWarning) {
        return setWarning({ text: res.value.inviteWarning, entityId: res.value.entityId });
      }
      setOpen(false);
      router.push(`/admin/entities/${res.value.entityId}`);
    });
  }

  const creating = mode === 'create';
  // A DBA answered "yes" needs its name before this can be submitted; the
  // Server Action and the database refuse it too, this only saves the trip.
  const incomplete =
    client.name.trim().length === 0 ||
    (creating &&
      (business.name.trim().length === 0 ||
        (business.hasDba && business.dbaName.trim().length === 0)));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from the form again — the outcome of the last
        // submit is not a state the dialog should come back to.
        if (next) setWarning(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className={creating ? primaryButton : secondaryButton}>
          {creating && <Plus className="size-4" aria-hidden="true" />}
          {creating ? t('newClient') : t('editClient')}
        </button>
      </DialogTrigger>
      {/* `sm:` deliberately: DialogContent's own `sm:max-w-sm` outranks an
          unprefixed max-width, so a plain `max-w-[600px]` renders at 384px. */}
      <DialogContent className={creating ? 'sm:max-w-[600px]' : 'sm:max-w-[520px]'}>
        <DialogHeader>
          <DialogTitle>{creating ? t('newClient') : t('editClient')}</DialogTitle>
          <DialogDescription>
            {creating ? t('onboardingLede') : t('clientsLede')}
          </DialogDescription>
        </DialogHeader>

        {warning ? (
          <div className="flex flex-col gap-4">
            <p role="alert" className={`${card} text-ink text-[14px]`}>
              {t('onboardingCreatedButNotInvited')} {warning.text}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  setOpen(false);
                  router.push(`/admin/entities/${warning.entityId}`);
                }}
              >
                {t('onboardingGoToBusiness')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <ClientFields values={client} onChange={editClient} />

            {creating && (
              <ClientOnboardingFields
                business={business}
                invite={invite}
                onBusinessChange={setBusiness}
                onInviteChange={setInvite}
                onError={setError}
              />
            )}

            {error && (
              <p role="alert" className="text-danger text-[13.5px]">
                {error}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
                {t('cancel')}
              </button>
              <button type="submit" disabled={isPending || incomplete} className={primaryButton}>
                {isPending ? (creating ? t('creating') : t('saving')) : creating ? t('create') : t('save')}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
