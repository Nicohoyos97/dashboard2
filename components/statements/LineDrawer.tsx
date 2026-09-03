'use client';

import { Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';

import { useNickSelection } from '@/components/chat/NickContext';

import type { StatementMeta, StatementNode } from './StatementTable';

// Side drawer for a statement line (§7): explanation, current vs prior,
// where it sits in the hierarchy and the source page of the published PDF.
export function LineDrawer({
  selected,
  parent,
  meta,
  onClose,
}: {
  selected: StatementNode | null;
  parent: StatementNode | null;
  meta: StatementMeta;
  onClose: () => void;
}) {
  const t = useTranslations('Statements');
  const tNick = useTranslations('Nick');
  const locale = useLocale();
  const nick = useNickSelection();
  const money = (cents: number | null) =>
    cents === null
      ? '—'
      : new Intl.NumberFormat(locale, { style: 'currency', currency: meta.currency }).format(
          cents / 100,
        );
  const node = selected;

  return (
    <Dialog.Root
      open={node !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40" />
        <Dialog.Content className="bg-card data-[state=open]:animate-in data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[92vw] flex-col overflow-y-auto p-6 shadow-xl outline-none">
          {node && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                    {node.section ?? ''}
                  </p>
                  <Dialog.Title className="text-ink mt-1 text-[20px] leading-tight font-bold">
                    {node.accountName}
                  </Dialog.Title>
                  {node.accountNumber && (
                    <p className="text-muted-foreground text-[12.5px]">{node.accountNumber}</p>
                  )}
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label={t('close')}
                    className="text-muted-foreground hover:bg-secondary hover:text-ink inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-paper rounded-xl p-4">
                  <dt className="text-muted-foreground text-[12px] font-medium">
                    {t('colCurrent')}
                  </dt>
                  <dd className="text-ink mt-1 text-[20px] font-bold tabular-nums">
                    {money(node.currentCents)}
                  </dd>
                </div>
                <div className="bg-paper rounded-xl p-4">
                  <dt className="text-muted-foreground text-[12px] font-medium">{t('colPrior')}</dt>
                  <dd className="text-ink mt-1 text-[20px] font-bold tabular-nums">
                    {meta.hasPrior ? money(node.priorCents) : '—'}
                  </dd>
                </div>
              </dl>
              {meta.hasPrior ? (
                node.deltaCents !== null && (
                  <p className="text-muted-foreground mt-3 text-[13.5px]">
                    {t('colChange')}:{' '}
                    <span className="text-ink font-semibold tabular-nums">
                      {node.deltaCents > 0 ? '+' : ''}
                      {money(node.deltaCents)}
                    </span>
                    {node.deltaPct !== null && (
                      <span className="ml-2 tabular-nums">
                        ({node.deltaPct > 0 ? '+' : ''}
                        {node.deltaPct.toFixed(1)}%)
                      </span>
                    )}
                  </p>
                )
              ) : (
                <p className="text-muted-foreground mt-3 text-[13.5px]">{t('drawerNoPrior')}</p>
              )}

              <Dialog.Description asChild>
                <div className="mt-6 text-[13.5px]">
                  <h3 className="text-ink font-semibold">{t('drawerExplain')}</h3>
                  <p className="text-muted-foreground mt-1 leading-[1.5]">
                    {node.isTotal
                      ? t('explainTotal')
                      : node.isSection
                        ? t('explainSection')
                        : t('explainLine')}
                  </p>
                  {parent && (
                    <p className="text-muted-foreground mt-3">
                      {t('drawerParent')}{' '}
                      <span className="text-ink font-medium">{parent.accountName}</span>
                    </p>
                  )}
                </div>
              </Dialog.Description>

              <div className="border-line mt-6 border-t pt-4 text-[13px]">
                <p className="text-muted-foreground">
                  {t('drawerSource')}:{' '}
                  <span className="text-ink font-medium">
                    {meta.source === 'firm_entry' ? t('sourceEntry') : t('sourceDocument')}
                  </span>
                </p>
                {node.pageNumber && (
                  <p className="text-muted-foreground mt-1">
                    {t('drawerPage', { page: node.pageNumber })}
                  </p>
                )}
                {meta.versionId && (
                  <a
                    href={`/api/documents/${meta.versionId}/download`}
                    className="text-blue mt-2 inline-block font-semibold hover:underline"
                  >
                    {t('downloadPdf')}
                  </a>
                )}
              </div>

              {nick && (
                <button
                  type="button"
                  onClick={() => {
                    nick.open({ id: node.id, name: node.accountName });
                    onClose();
                  }}
                  className="bg-blue-pale text-blue hover:bg-blue focus-visible:ring-blue/40 mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition outline-none hover:text-white focus-visible:ring-3"
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                  {tNick('askAboutLine')}
                </button>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
