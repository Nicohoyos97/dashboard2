'use client';

import { ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { inputClass } from '@/components/admin/ui';
import { useNickSelection } from '@/components/chat/NickContext';
import { Link, useRouter } from '@/i18n/navigation';

import { CompareSelector, type CompareProps } from './CompareSelector';
import { LineDrawer } from './LineDrawer';
import { formatCents } from '@/lib/money';

export type StatementNode = {
  id: string;
  depth: number;
  section: string | null;
  accountName: string;
  accountNumber: string | null;
  currentCents: number | null;
  priorCents: number | null;
  deltaCents: number | null;
  deltaPct: number | null;
  isSection: boolean;
  isTotal: boolean;
  pageNumber: number | null;
  children: StatementNode[];
};

export type StatementMeta = {
  reportType: 'profit_and_loss' | 'balance_sheet';
  currency: string;
  hasPrior: boolean;
  source: 'firm_document' | 'firm_entry';
  versionId: string | null;
};

type Flat = { node: StatementNode; parent: StatementNode | null; visible: boolean };

/** Where a line's transactions live, when the month's General Ledger carries them. Keyed by line id. */
export type LineDetails = Record<string, { href: string; count: number }>;

function flatten(
  nodes: StatementNode[],
  parent: StatementNode | null,
  collapsed: Set<string>,
  query: string,
  hideZero: boolean,
  out: Flat[],
): boolean {
  let any = false;
  for (const node of nodes) {
    const isZero =
      (node.currentCents ?? 0) === 0 && (node.priorCents ?? 0) === 0 && !node.isSection;
    const matches = query === '' || node.accountName.toLowerCase().includes(query);
    const index = out.length;
    out.push({ node, parent, visible: false });
    const childVisible =
      collapsed.has(node.id) && query === ''
        ? false
        : flatten(node.children, node, collapsed, query, hideZero, out);
    const visible = (matches && !(hideZero && isZero)) || childVisible;
    const row = out[index];
    if (row) row.visible = visible;
    if (visible) any = true;
  }
  return any;
}

// Interactive statement (INITIAL_PROMPT.md §7): preserved hierarchy with
// expand/collapse, hover highlight, click → side drawer, current / prior /
// $ variance / % variance, hide-zero, account search. Money is formatted with
// Intl; variance color is contextual and never the only signal (sign shown).
export function StatementTable({
  roots,
  meta,
  compare,
  details = {},
}: {
  roots: StatementNode[];
  meta: StatementMeta;
  /** Absent when the statement has nothing comparable to offer. */
  compare?: CompareProps;
  /** Lines whose transactions can be opened: a click goes there instead of the drawer. */
  details?: LineDetails;
}) {
  const t = useTranslations('Statements');
  const tLedger = useTranslations('Ledger');
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const [selected, setSelected] = useState<Flat | null>(null);
  const nick = useNickSelection();
  const select = (node: StatementNode, parent: StatementNode | null) => {
    const detail = details[node.id];
    if (detail) {
      router.push(detail.href);
      return;
    }
    setSelected({ node, parent, visible: true });
    nick?.setLine({ id: node.id, name: node.accountName });
  };
  const hasDetails = Object.keys(details).length > 0;

  const rows = useMemo(() => {
    const out: Flat[] = [];
    flatten(roots, null, collapsed, query.trim().toLowerCase(), hideZero, out);
    return out.filter((r) => r.visible);
  }, [roots, collapsed, query, hideZero]);

  const money = (cents: number | null) =>
    cents === null
      ? ''
      : formatCents(cents, meta.currency);
  const expenseLike = (node: StatementNode) =>
    /expense|cost|liabilit/i.test(node.section ?? '') || /expense|cost/i.test(node.accountName);
  const deltaTone = (node: StatementNode) => {
    if (node.deltaCents === null || node.deltaCents === 0) return 'text-muted-foreground';
    const goodWhenUp = !expenseLike(node);
    return node.deltaCents > 0 === goodWhenUp ? 'text-success' : 'text-danger';
  };

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: StatementNode[]) =>
      nodes.forEach((n) => {
        if (n.children.length) ids.push(n.id);
        walk(n.children);
      });
    walk(roots);
    return ids;
  }, [roots]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative w-full min-w-[220px] flex-1 sm:w-auto">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} h-10 pl-9`}
          />
        </label>
        {compare && <CompareSelector {...compare} />}
        <label className="text-muted-foreground flex items-center gap-2 text-ui">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="accent-brand size-4"
          />
          {t('hideZero')}
        </label>
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          className="text-link text-small font-semibold hover:underline"
        >
          {t('expandAll')}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(new Set(allIds))}
          className="text-link text-small font-semibold hover:underline"
        >
          {t('collapseAll')}
        </button>
      </div>

      {hasDetails && <p className="text-muted-foreground -mt-1 mb-3 text-small">{tLedger('clickHint')}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-ui">
          <thead className="text-muted-foreground border-line border-b text-caption font-semibold tracking-[0.06em] whitespace-nowrap uppercase">
            <tr>
              <th className="px-2 py-2 sm:px-3">{t('colAccount')}</th>
              <th className="px-2 py-2 text-right sm:px-3">{t('colCurrent')}</th>
              {/* On a phone the statement keeps the account, the figure and the
                  change in percent; the prior figure and the change in dollars
                  are one tap away in the line's drawer. */}
              {meta.hasPrior && <th className="hidden px-3 py-2 text-right sm:table-cell">{t('colPrior')}</th>}
              {meta.hasPrior && <th className="hidden px-3 py-2 text-right sm:table-cell">{t('colChange')}</th>}
              {meta.hasPrior && <th className="px-2 py-2 text-right sm:px-3">{t('colChangePct')}</th>}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {rows.map(({ node, parent }) => {
              const hasChildren = node.children.length > 0;
              const strong = node.isSection || node.isTotal;
              return (
                <tr
                  key={node.id}
                  tabIndex={0}
                  onClick={() => select(node, parent)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select(node, parent);
                    }
                  }}
                  className={`hover:bg-blue-pale/60 focus-visible:bg-blue-pale/60 cursor-pointer transition outline-none ${node.isTotal ? 'bg-paper' : ''}`}
                >
                  <td
                    className="py-2.5 pr-3 pl-[calc(0.5rem+var(--depth)*0.75rem)] sm:pl-[calc(0.75rem+var(--depth)*1.125rem)]"
                    style={{ '--depth': node.depth } as React.CSSProperties}
                  >
                    <span className="flex items-center gap-1.5">
                      {hasChildren ? (
                        <button
                          type="button"
                          aria-label={collapsed.has(node.id) ? t('expandAll') : t('collapseAll')}
                          aria-expanded={!collapsed.has(node.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(node.id);
                          }}
                          className="text-muted-foreground hover:text-ink -ml-1 inline-flex size-5 items-center justify-center rounded"
                        >
                          <ChevronRight
                            className={`size-4 transition ${collapsed.has(node.id) ? '' : 'rotate-90'}`}
                            aria-hidden="true"
                          />
                        </button>
                      ) : (
                        <span className="inline-block size-5" aria-hidden="true" />
                      )}
                      {details[node.id] ? (
                        <span className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2.5">
                          <Link
                            href={details[node.id]?.href ?? ''}
                            onClick={(e) => e.stopPropagation()}
                            className="text-ink hover:text-link"
                          >
                            {node.accountName}
                          </Link>
                          <span className="text-muted-foreground inline-flex items-center gap-0.5 text-caption whitespace-nowrap sm:text-small">
                            {tLedger('transactions', { count: details[node.id]?.count ?? 0 })}
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                          </span>
                        </span>
                      ) : (
                        <span className={strong ? 'text-ink font-semibold' : 'text-ink'}>
                          {node.accountName}
                        </span>
                      )}
                    </span>
                  </td>
                  <td
                    className={`px-2 py-2.5 text-right whitespace-nowrap tabular-nums sm:px-3 ${strong ? 'font-semibold' : ''}`}
                  >
                    {money(node.currentCents)}
                  </td>
                  {meta.hasPrior && (
                    <td className="text-muted-foreground hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">
                      {money(node.priorCents)}
                    </td>
                  )}
                  {meta.hasPrior && (
                    <td className={`hidden px-3 py-2.5 text-right tabular-nums sm:table-cell ${deltaTone(node)}`}>
                      {node.deltaCents === null
                        ? ''
                        : `${node.deltaCents > 0 ? '+' : ''}${money(node.deltaCents)}`}
                    </td>
                  )}
                  {meta.hasPrior && (
                    <td className={`px-2 py-2.5 text-right tabular-nums sm:px-3 ${deltaTone(node)}`}>
                      {node.deltaPct === null
                        ? ''
                        : `${node.deltaPct > 0 ? '+' : ''}${node.deltaPct.toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LineDrawer
        selected={selected?.node ?? null}
        parent={selected?.parent ?? null}
        meta={meta}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
