'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { primaryButton, secondaryButton, textareaClass } from '@/components/admin/ui';
import { cancelAccountRequest, requestAccountAction } from '@/lib/settings/preferences';
import type { AccountRequestKind } from '@/lib/settings/types';

export type AccountRequestRow = {
  id: string;
  kind: AccountRequestKind;
  status: string;
  message: string | null;
  firmNote: string | null;
  requestedAt: string;
};

const OPEN = new Set(['pending', 'in_progress']);

/**
 * Data export and account deletion (§7). Both are *requests* the firm acts on —
 * nothing here deletes data, and the copy says so, because a client cannot be
 * allowed to remove records the firm is required to keep.
 */
export function AccountRequests({
  kind,
  canRequest,
  requests,
  formatDate,
}: {
  kind: AccountRequestKind;
  canRequest: boolean;
  requests: AccountRequestRow[];
  formatDate: (iso: string) => string;
}) {
  const t = useTranslations('Settings');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const mine = requests.filter((request) => request.kind === kind);
  const open = mine.find((request) => OPEN.has(request.status));

  return (
    <section className="border-line bg-card mt-6 rounded-2xl border p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h2 className="text-ink text-[16px] font-semibold">{t(`request_${kind}_title`)}</h2>
      <p className="text-muted-foreground mt-1.5 max-w-[560px] text-[13.5px] leading-[1.5]">{t(`request_${kind}_body`)}</p>

      {open ? (
        <div className="border-line bg-secondary/50 mt-4 rounded-xl border p-4">
          <p className="text-ink text-[13.5px] font-semibold">{t(`requestStatus_${open.status}`)}</p>
          <p className="text-muted-foreground mt-1 text-[12.5px]">{t('requestedOn', { date: formatDate(open.requestedAt) })}</p>
          {open.message && <p className="text-muted-foreground mt-2 text-[13px] leading-[1.5]">{open.message}</p>}
          {open.firmNote && (
            <p className="text-ink mt-2 text-[13px] leading-[1.5]">
              <span className="text-muted-foreground font-semibold">{t('firmReply')}: </span>
              {open.firmNote}
            </p>
          )}
          {open.status === 'pending' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await cancelAccountRequest({ id: open.id });
                  if (!result.ok) setError(result.error);
                });
              }}
              className={`${secondaryButton} mt-3 h-9`}
            >
              {t('requestWithdraw')}
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canRequest) return;
            setError(null);
            setSent(false);
            startTransition(async () => {
              const result = await requestAccountAction({ kind, message });
              if (!result.ok) return setError(result.error);
              setMessage('');
              setSent(true);
            });
          }}
          className="mt-4"
        >
          <label className="block">
            <span className="text-ink mb-1.5 block text-[14px] font-semibold">{t('requestMessageLabel')}</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t(`request_${kind}_placeholder`)}
              disabled={!canRequest || isPending}
              className={textareaClass}
            />
          </label>
          <button type="submit" disabled={!canRequest || isPending} className={`${primaryButton} mt-4`}>
            {isPending ? t('saving') : t(`request_${kind}_cta`)}
          </button>
        </form>
      )}

      {error && <p className="text-danger mt-3 text-[13.5px]">{error}</p>}
      {sent && !open && <p className="text-success mt-3 text-[13.5px]">{t('requestSent')}</p>}

      {mine.filter((request) => !OPEN.has(request.status)).length > 0 && (
        <div className="border-line-soft mt-5 border-t pt-4">
          <p className="text-muted-foreground text-[12px] font-semibold">{t('requestHistory')}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {mine
              .filter((request) => !OPEN.has(request.status))
              .map((request) => (
                <li key={request.id} className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-[13px]">
                  <span className="text-ink font-medium">{t(`requestStatus_${request.status}`)}</span>
                  <span>· {formatDate(request.requestedAt)}</span>
                  {request.firmNote && <span>· {request.firmNote}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
