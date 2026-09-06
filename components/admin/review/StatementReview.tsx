'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/navigation';
import { correctLine } from '@/lib/documents/lines';
import { CONFIDENCE_THRESHOLD, type Reconciliation } from '@/lib/documents/reconciliation';
import { formatPeriod } from '@/lib/utils/dates';

import { inputClass } from '../ui';
import { formatAmount } from '@/lib/money';

export type LineRow = {
  id: string;
  depth: number;
  section: string | null;
  accountName: string;
  accountNumber: string | null;
  current: number | null;
  prior: number | null;
  isSection: boolean;
  isTotal: boolean;
  pageNumber: number | null;
  confidence: number | null;
  correctedAt: string | null;
};

export type ReportSummary = {
  id: string;
  reportType: string;
  basis: string | null;
  currency: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  reconciliation: Reconciliation | null;
};

function money(value: number | null, locale: string, currency: string): string {
  if (value === null) return '';
  return formatAmount(value, currency);
}

// The extracted statement with its hierarchy, low-confidence flags, inline
// corrections (firm admin, unpublished only) and the reconciliation checks.
export function StatementReview({
  report,
  lines,
  canEdit,
}: {
  report: ReportSummary;
  lines: LineRow[];
  canEdit: boolean;
}) {
  const t = useTranslations('Admin');
  const locale = useLocale();
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { current: string; prior: string }>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const editable = canEdit && report.status !== 'published';
  const rec = report.reconciliation;
  const lowCount = lines.filter((l) => (l.confidence ?? 1) < CONFIDENCE_THRESHOLD && !l.correctedAt).length;

  // Saving an edit, or confirming a low-confidence line as printed — both
  // stamp the row as corrected and recompute the reconciliation.
  function save(line: LineRow) {
    const edit = edits[line.id] ?? {
      current: line.current === null ? '' : line.current.toFixed(2),
      prior: line.prior === null ? '' : line.prior.toFixed(2),
    };
    setError(null);
    startTransition(async () => {
      const res = await correctLine({ lineId: line.id, current: edit.current, prior: edit.prior });
      if (!res.ok) return setError(res.error);
      setSaved(line.id);
      setEdits((e) => {
        const next = { ...e };
        delete next[line.id];
        return next;
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${rec?.passed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {rec?.passed ? t('reconciliationPassed') : t('reconciliationFailed')}
        </span>
        <span className={`rounded-full px-2.5 py-1 font-semibold ${lowCount === 0 ? 'bg-secondary text-muted-foreground' : 'bg-warning/10 text-warning'}`}>
          {t('lowConfidenceCount', { count: lowCount })}
        </span>
        <span className="text-muted-foreground">
          {t(`type_${report.reportType}`)} · {formatPeriod(report.periodStart, report.periodEnd, locale)}
          {report.basis ? ` · ${report.basis === 'accrual' ? t('basisAccrual') : t('basisCash')}` : ''}
        </span>
      </div>

      {rec && rec.checks.length > 0 && (
        <ul className="border-line divide-line divide-y rounded-xl border text-[13.5px]">
          {rec.checks.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className={`size-2.5 shrink-0 rounded-full ${c.ok ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
              <span className="text-ink min-w-0 flex-1 font-medium">{c.label}</span>
              <span className="text-muted-foreground">
                {c.ok ? 'OK' : `${t('expected')} ${money((c.expectedCents ?? 0) / 100, locale, report.currency)} · ${t('actual')} ${money((c.actualCents ?? 0) / 100, locale, report.currency)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-muted-foreground border-line border-b text-[12px] font-semibold tracking-[0.06em] uppercase">
            <tr>
              <th className="px-3 py-2">{t('colAccount')}</th>
              <th className="px-3 py-2 text-right">{t('colCurrent')}</th>
              <th className="px-3 py-2 text-right">{t('colPrior')}</th>
              <th className="px-3 py-2 text-right">{t('colPage')}</th>
              <th className="px-3 py-2 text-right">{t('colConf')}</th>
              {editable && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {lines.map((line) => {
              const low = (line.confidence ?? 1) < CONFIDENCE_THRESHOLD && !line.correctedAt;
              const edit = edits[line.id];
              return (
                <tr key={line.id} className={low ? 'bg-warning/5' : line.isTotal ? 'bg-paper' : ''}>
                  <td className="px-3 py-2" style={{ paddingLeft: `${12 + line.depth * 18}px` }}>
                    <span className={line.isSection || line.isTotal ? 'text-ink font-semibold' : 'text-ink'}>
                      {line.accountName}
                    </span>
                    {line.accountNumber && <span className="text-muted-foreground ml-2 text-[12px]">{line.accountNumber}</span>}
                    {line.correctedAt && <span className="text-blue ml-2 text-[11px] font-semibold uppercase">{t('corrected')}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editable && !line.isSection ? (
                      <input
                        aria-label={`${line.accountName} ${t('colCurrent')}`}
                        value={edit?.current ?? (line.current === null ? '' : line.current.toFixed(2))}
                        onChange={(e) => setEdits((all) => ({ ...all, [line.id]: { current: e.target.value, prior: all[line.id]?.prior ?? (line.prior === null ? '' : line.prior.toFixed(2)) } }))}
                        className={`${inputClass} h-8 w-32 text-right text-[13px]`}
                      />
                    ) : (
                      money(line.current, locale, report.currency)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {editable && !line.isSection ? (
                      <input
                        aria-label={`${line.accountName} ${t('colPrior')}`}
                        value={edit?.prior ?? (line.prior === null ? '' : line.prior.toFixed(2))}
                        onChange={(e) => setEdits((all) => ({ ...all, [line.id]: { prior: e.target.value, current: all[line.id]?.current ?? (line.current === null ? '' : line.current.toFixed(2)) } }))}
                        className={`${inputClass} h-8 w-32 text-right text-[13px]`}
                      />
                    ) : (
                      money(line.prior, locale, report.currency)
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right">{line.pageNumber ?? ''}</td>
                  <td className={`px-3 py-2 text-right ${low ? 'text-warning font-semibold' : 'text-muted-foreground'}`}>
                    {line.confidence === null ? '' : `${Math.round(line.confidence * 100)}%`}
                  </td>
                  {editable && (
                    <td className="px-3 py-2 text-right">
                      {edit ? (
                        <button type="button" disabled={isPending} onClick={() => save(line)} className="text-blue text-[13px] font-semibold hover:underline">
                          {t('saveLine')}
                        </button>
                      ) : low ? (
                        <button type="button" disabled={isPending} onClick={() => save(line)} className="text-warning text-[13px] font-semibold hover:underline">
                          {t('confirmLine')}
                        </button>
                      ) : saved === line.id ? (
                        <span className="text-success text-[12px]">{t('lineSaved')}</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="text-danger text-[13.5px]">
          {error}
        </p>
      )}
    </div>
  );
}
