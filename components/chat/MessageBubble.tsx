'use client';

import { useTranslations } from 'next-intl';

import type { CitationRecord } from '@/lib/ai/nick/types';

import { CitationChip } from './CitationChip';

// Renders Nick's plain-prose answers: paragraphs, "- " bullets, **bold**, and
// [cN] markers turned into source chips. No markdown library — the prompt
// forbids headings, tables and code, so this small renderer is the contract.
const INLINE = /(\*\*[^*]+\*\*|\[c\d+\]|\/api\/(?:documents|exports)\/[0-9a-f-]{36}\/download)/g;
const DOWNLOAD = /^\/api\/(?:documents|exports)\/[0-9a-f-]{36}\/download$/;

function inline(
  text: string,
  citations: ReadonlyMap<string, CitationRecord>,
  keyPrefix: string,
  downloadLabel: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  text.split(INLINE).forEach((part, index) => {
    if (part === '') return;
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(
        <strong key={key} className="text-ink font-semibold">
          {part.slice(2, -2)}
        </strong>,
      );
      return;
    }
    const marker = /^\[(c\d+)\]$/.exec(part);
    if (marker?.[1]) {
      const citation = citations.get(marker[1]);
      if (citation) nodes.push(<CitationChip key={key} citation={citation} compact />);
      return;
    }
    if (DOWNLOAD.test(part)) {
      nodes.push(
        <a key={key} href={part} className="text-blue font-semibold underline underline-offset-4">
          {downloadLabel}
        </a>,
      );
      return;
    }
    nodes.push(part);
  });
  return nodes;
}

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      flush();
      const last = blocks.at(-1);
      const item = line.slice(2).trim();
      if (last?.kind === 'ul') last.items.push(item);
      else blocks.push({ kind: 'ul', items: [item] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

export function AssistantText({
  text,
  citations,
}: {
  text: string;
  citations: readonly CitationRecord[];
}) {
  const t = useTranslations('Nick');
  const downloadLabel = t('downloadLink');
  const byKey = new Map(citations.map((c) => [c.key, c] as const));
  return (
    <div className="text-ink flex flex-col gap-2.5 text-[14.5px] leading-[1.6]">
      {blocksOf(text).map((block, index) =>
        block.kind === 'p' ? (
          <p key={index}>{inline(block.text, byKey, `p${index}`, downloadLabel)}</p>
        ) : (
          <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {inline(item, byKey, `l${index}-${itemIndex}`, downloadLabel)}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export function MessageBubble({
  role,
  children,
  failed = false,
}: {
  role: 'user' | 'assistant';
  children: React.ReactNode;
  failed?: boolean;
}) {
  const t = useTranslations('Nick');
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          isUser
            ? `max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14.5px] leading-[1.55] ${failed ? 'bg-danger/10 text-ink' : 'bg-blue text-white'}`
            : 'border-line bg-card max-w-[92%] rounded-2xl rounded-bl-md border px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
        }
      >
        <span className="sr-only">{isUser ? t('you') : t('nick')}: </span>
        {children}
      </div>
    </div>
  );
}

export function SourcesRow({ citations }: { citations: readonly CitationRecord[] }) {
  const t = useTranslations('Nick');
  if (citations.length === 0) return null;
  return (
    <div className="border-line mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
      <span className="text-muted-foreground mr-1 text-[11.5px] font-medium tracking-[0.08em] uppercase">
        {t('sources')}
      </span>
      {citations.map((c) => (
        <CitationChip key={c.key} citation={c} />
      ))}
    </div>
  );
}
