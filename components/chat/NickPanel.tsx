'use client';

import { Maximize2, Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { useMemo, useState } from 'react';

import { Link } from '@/i18n/navigation';
import type { NickPage, PageContext } from '@/lib/ai/nick/types';

import { useNickSelection } from './NickContext';
import { NickThread } from './NickThread';
import { LINE_SUGGESTIONS, SUGGESTIONS } from './suggestions';
import { useNickChat } from './useNickChat';

// The contextual Nick panel (spec §7): a floating "Ask Nick" button and a
// side panel — full-screen on mobile — that carries the page, the selected
// period and the selected statement line as a pointer for the server.
export function NickPanel({ page, period, businessName }: { page: NickPage; period?: string | undefined; businessName: string }) {
  const t = useTranslations('Nick');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const selection = useNickSelection();
  const chat = useNickChat({ sessionId: null, initialMessages: [], locale });
  const line = selection?.line ?? null;
  const lineId = line?.id ?? null;
  const context = useMemo<PageContext>(() => ({ page, ...(period ? { period } : {}), ...(lineId ? { lineId } : {}) }), [page, period, lineId]);
  const suggestionKeys = lineId ? [...LINE_SUGGESTIONS, ...SUGGESTIONS[page].slice(0, 2)] : SUGGESTIONS[page];
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = selection ? selection.isOpen : localOpen;
  const onOpenChange = (open: boolean) => {
    if (!selection) setLocalOpen(open);
    else if (open) selection.open();
    else selection.close();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="bg-blue hover:bg-blue-soft focus-visible:ring-blue/40 fixed right-5 bottom-5 z-30 inline-flex h-12 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white shadow-lg transition outline-none focus-visible:ring-3 print:hidden"
        >
          <Sparkles className="size-[18px]" aria-hidden="true" />
          {t('openPanel')}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/30 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-40" />
        <Dialog.Content className="bg-paper data-[state=open]:animate-in data-[state=open]:slide-in-from-right fixed inset-0 z-50 flex flex-col p-4 outline-none sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[480px] sm:max-w-[94vw] sm:border-l sm:border-line sm:p-5 sm:shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="bg-blue-pale text-blue flex size-9 shrink-0 items-center justify-center rounded-xl">
                <Sparkles className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <Dialog.Title className="text-ink text-[16px] font-bold">{t('panelTitle')}</Dialog.Title>
                <Dialog.Description className="text-muted-foreground truncate text-[12.5px]">
                  {line ? t('lineContext', { account: line.name }) : businessName}
                </Dialog.Description>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {line && (
                <button type="button" onClick={() => selection?.setLine(null)} className="text-muted-foreground hover:text-ink rounded-lg px-2 py-1 text-[12.5px] font-semibold">
                  {t('clearLine')}
                </button>
              )}
              <Link href="/chat" aria-label={t('fullPage')} title={t('fullPage')} className="text-muted-foreground hover:bg-secondary hover:text-ink inline-flex size-9 items-center justify-center rounded-xl">
                <Maximize2 className="size-[18px]" aria-hidden="true" />
              </Link>
              <Dialog.Close asChild>
                <button type="button" aria-label={t('closePanel')} className="text-muted-foreground hover:bg-secondary hover:text-ink inline-flex size-9 items-center justify-center rounded-xl">
                  <X className="size-5" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
          </div>
          <div className="mt-2 min-h-0 flex-1">
            <NickThread chat={chat} context={context} suggestionKeys={suggestionKeys} businessName={businessName} autoFocus />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
