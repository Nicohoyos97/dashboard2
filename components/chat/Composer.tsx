'use client';

import { SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { NICK_LIMITS } from '@/lib/ai/nick/config';

// Message input: Enter sends, Shift+Enter adds a line; disabled while Nick is
// answering so a turn can never overlap another on the same session.
export function Composer({
  onSend,
  disabled,
  autoFocus = false,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations('Nick');
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    ref.current?.focus();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-line bg-card focus-within:border-blue/60 focus-within:ring-blue/20 flex items-end gap-2 rounded-2xl border p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:ring-3"
    >
      <label htmlFor="nick-composer" className="sr-only">
        {t('placeholder')}
      </label>
      <textarea
        id="nick-composer"
        ref={ref}
        value={value}
        rows={1}
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
        className="text-ink placeholder:text-muted-foreground max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] leading-[1.5] outline-none disabled:opacity-60"
      />
      <button
        type="submit"
        aria-label={t('send')}
        disabled={disabled || value.trim() === ''}
        className="bg-blue hover:bg-blue-soft focus-visible:ring-blue/40 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition outline-none focus-visible:ring-3 disabled:opacity-40"
      >
        <SendHorizontal className="size-[18px]" aria-hidden="true" />
      </button>
    </form>
  );
}
