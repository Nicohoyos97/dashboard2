'use client';

import { ArrowUp, SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { NICK_LIMITS } from '@/lib/ai/nick/config';
import { cn } from '@/lib/utils/cn';

// Message input: Enter sends, Shift+Enter adds a line; disabled while Nick is
// answering so a turn can never overlap another on the same session. The
// `hero` size is the large centred box of an empty conversation.
export function Composer({
  onSend,
  disabled,
  autoFocus = false,
  size = 'default',
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
  size?: 'default' | 'hero';
}) {
  const t = useTranslations('Nick');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const hero = size === 'hero';

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    ref.current?.focus();
  }

  const textarea = (
    <textarea
      id="nick-composer"
      ref={ref}
      value={value}
      rows={hero ? 3 : 1}
      maxLength={NICK_LIMITS.maxMessageChars}
      autoFocus={autoFocus}
      placeholder={t('placeholder')}
      disabled={disabled}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          submit();
        }
      }}
      className={cn(
        // The placeholder is hidden on a phone rather than shortened: at 16px
        // (the size iOS demands of a field it focuses) "Ask Nick about your
        // finances…" runs to within 9px of the box edge at 390px and is cut on
        // anything narrower, and a hint that reads as a truncated sentence is
        // worse than no hint. The <label> below carries the same words for
        // screen readers, so nothing is lost with it gone.
        'text-ink sm:placeholder:text-muted-foreground w-full resize-none bg-transparent leading-[1.5] outline-none placeholder:text-transparent disabled:opacity-60',
        hero
          ? 'max-h-60 min-h-[88px] px-2 py-1.5 text-[15.5px]'
          : 'max-h-40 min-h-[40px] flex-1 px-2 py-2 text-[14.5px]',
      )}
    />
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        'border-line bg-card focus-within:border-blue/60 focus-within:ring-blue/20 rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:ring-3',
        hero ? 'flex flex-col gap-2 p-3 sm:p-4' : 'flex items-end gap-2 p-2',
      )}
    >
      <label htmlFor="nick-composer" className="sr-only">
        {t('placeholder')}
      </label>
      {textarea}
      {hero ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[12px]">{t('composerHint')}</span>
          <button
            type="submit"
            aria-label={t('send')}
            disabled={disabled || value.trim() === ''}
            className="bg-blue hover:bg-blue-soft focus-visible:ring-blue/40 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-white transition outline-none focus-visible:ring-3 disabled:opacity-40"
          >
            <ArrowUp className="size-[18px]" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="submit"
          aria-label={t('send')}
          disabled={disabled || value.trim() === ''}
          className="bg-blue hover:bg-blue-soft focus-visible:ring-blue/40 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition outline-none focus-visible:ring-3 disabled:opacity-40"
        >
          <SendHorizontal className="size-[18px]" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
