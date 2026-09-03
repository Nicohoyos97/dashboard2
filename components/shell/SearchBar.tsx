'use client';

// Top-bar search (INITIAL_PROMPT.md §6 "search input with a ⌘K hint"). It
// does two real things: jumps to a page whose name matches, and, on the
// client portal, sends anything else to Nick as a question. ⌘K / Ctrl+K
// focuses it from anywhere.
import { Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useRouter } from '@/i18n/navigation';

export type SearchTarget = { href: string; label: string };

export function SearchBar({ targets, askNick }: { targets: SearchTarget[]; askNick: boolean }) {
  const t = useTranslations('Shell');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [isOpen, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trimmed = query.trim();
  const options = useMemo(() => {
    const needle = trimmed.toLowerCase();
    const matches = needle
      ? targets.filter((target) => target.label.toLowerCase().includes(needle))
      : [];
    const items: { kind: 'page' | 'nick'; href: string; label: string }[] = matches.map((m) => ({
      kind: 'page',
      href: m.href,
      label: m.label,
    }));
    if (askNick && trimmed)
      items.push({
        kind: 'nick',
        href: `/chat?q=${encodeURIComponent(trimmed)}`,
        label: t('searchAskNick', { query: trimmed }),
      });
    return items;
  }, [targets, trimmed, askNick, t]);

  const go = (index: number) => {
    const option = options[index];
    if (!option) return;
    setOpen(false);
    setQuery('');
    router.push(option.href);
  };

  return (
    <form
      role="search"
      className="relative w-full max-w-[340px]"
      onSubmit={(event) => {
        event.preventDefault();
        go(activeIndex);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        {t('search')}
      </label>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <input
        id={`${listId}-input`}
        ref={inputRef}
        type="search"
        value={query}
        placeholder={t('search')}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen && options.length > 0}
        aria-controls={`${listId}-list`}
        aria-activedescendant={
          isOpen && options[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined
        }
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (event.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="border-line bg-paper text-ink placeholder:text-muted-foreground/70 focus:border-blue focus:bg-card h-10 w-full rounded-xl border pr-14 pl-9 text-[14px] transition outline-none focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
      />
      <kbd
        className="border-line bg-card text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md border px-1.5 py-0.5 font-sans text-[11px] font-medium"
        aria-hidden="true"
      >
        {t('searchHint')}
      </kbd>

      {isOpen && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="border-line bg-card absolute top-[calc(100%+6px)] left-0 z-40 w-full rounded-xl border p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          {options.length === 0 ? (
            <li className="text-muted-foreground px-2.5 py-2 text-[13px]">{t('searchEmpty')}</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.href}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(index);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] ${index === activeIndex ? 'bg-blue-pale text-blue' : 'text-ink'}`}
              >
                {option.kind === 'nick' ? (
                  <Sparkles className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <span className="text-muted-foreground text-[11.5px] font-medium uppercase">
                    {t('searchGoTo')}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </form>
  );
}
