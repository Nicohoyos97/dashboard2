// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { reportHtml } from '@/lib/reports/report-html';
import { buildReportInput } from '@/lib/reports/report-input';
import { buildTree } from '@/lib/reports/tree';

import {
  amend,
  balanceReport,
  balanceRows,
  line,
  pnlRows,
  report,
  resetPositions,
  withoutPrior,
} from './fixtures';

const TODAY = '2026-09-04';
const ASSETS = {
  logo: 'data:image/png;base64,LOGO',
  signature: 'data:image/png;base64,SIGN',
  fontLatin: 'data:font/woff2;base64,FONT',
  fontLatinExt: 'data:font/woff2;base64,FONTX',
};

const build = (
  rows = pnlRows(),
  r = report(),
  extra: Partial<Parameters<typeof buildReportInput>[0]> = {},
) =>
  buildReportInput({
    report: r,
    roots: buildTree(rows),
    entityName: 'Sabor a Cafe Steak House Inc.',
    locale: 'en',
    expenses: [],
    today: TODAY,
    ...extra,
  });

const html = (...args: Parameters<typeof build>) =>
  reportHtml({ ...build(...args), assets: ASSETS });

describe('report input (KILL-PDF cover + bands)', () => {
  it('bands the key subtotal and the closing figure by line id, not by text', () => {
    const input = build();
    // L8 Gross Profit, L15 Net Income in the P&L fixture.
    expect(input.bands).toEqual({ highlight: 'L8', final: 'L15' });
  });

  it('fills the four KPI cards and marks a loss as negative', () => {
    const loss = amend(pnlRows(), 'L15', { currentCents: -1_054_231 });
    const input = build(loss);
    expect(input.cover.kpis.map((k) => k.label)).toEqual([
      'Total Income',
      'Gross Profit',
      'Total Expenses',
      'Net Income',
    ]);
    const net = input.cover.kpis[3];
    expect(net?.value).toBe('$(10,542.31)');
    expect(net?.negative).toBe(true);
    expect(net?.highlight).toBe(true);
  });

  it('shows a dash rather than inventing a total the statement does not print', () => {
    const input = build(amend(pnlRows(), 'L8', { currentCents: null }));
    expect(input.cover.kpis[1]?.value).toBe('—');
  });

  it('adds the comparative column only when the statement prints one', () => {
    expect(build().columns).toHaveLength(2);
    expect(
      build(pnlRows(), report({ comparativeStart: null, comparativeEnd: null })).columns,
    ).toHaveLength(1);
  });

  it('reads a balance sheet as a snapshot, with its own bands and cards', () => {
    const input = build(balanceRows(), balanceReport());
    expect(input.title).toBe('Balance Sheet');
    // One date, not a range: period start equals period end.
    expect(input.periodLabel).toBe('June 30, 2026');
    expect(input.bands).toEqual({ highlight: 'B9', final: 'B22' });
    expect(input.cover.kpis.map((k) => k.label)).toEqual([
      'Total Assets',
      'Total Liabilities',
      'Total Equity',
      'Working Capital',
    ]);
  });

  it('derives the analysis from printed totals and drops what is missing', () => {
    const withExpenses = build(pnlRows(), report(), {
      expenses: [
        { label: 'Payroll Expenses', cents: 16_008_800 },
        { label: 'Entertainment', cents: 5_421_900 },
        { label: 'Rent', cents: 200_000 },
      ],
    });
    const [income, expenses, result] = withExpenses.cover.analysis;
    expect(income).toContain('total income of $15,000.00');
    expect(income).toContain('gross profit of $11,000.00');
    expect(income).toContain('(73.3% margin)');
    // Only the two largest expense leaves, in the locale's list style.
    expect(expenses).toContain('Payroll Expenses ($160,088.00) and Entertainment ($54,219.00)');
    expect(expenses).not.toContain('Rent');
    expect(result).toBe('The period closed with a net income of $4,000.00.');

    const noTotals = build(withoutPrior(amend(pnlRows(), 'L15', { currentCents: null })));
    expect(noTotals.cover.analysis.some((s) => s.includes('net income'))).toBe(false);
  });

  it('says net loss when the closing figure is negative', () => {
    const input = build(amend(pnlRows(), 'L15', { currentCents: -1_054_231 }));
    expect(input.cover.analysis.at(-1)).toBe('The period closed with a net loss of $(10,542.31).');
  });

  it('dates the letter on the day the business is having, not UTC', () => {
    expect(build().cover.dateLabel).toBe('September 4, 2026');
    expect(build(pnlRows(), report(), { today: '2026-01-01' }).cover.dateLabel).toBe(
      'January 1, 2026',
    );
  });

  it('translates the document without translating the published line names', () => {
    const input = build(pnlRows(), report(), { locale: 'es' });
    expect(input.title).toBe('Estado de Resultados');
    expect(input.cover.kpis[0]?.label).toBe('Ingresos Totales');
    expect(input.cover.analysis[0]).toContain('La empresa registró ingresos totales');
  });
});

describe('report HTML', () => {
  it('escapes an account name that came from an uploaded document', () => {
    resetPositions();
    const rows = [line('X1', '<img src=x onerror=alert(1)> & "co"', { current: 100 })];
    const out = html(rows);
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;co&quot;');
  });

  it('classes sections, totals and the two bands from KILL-PDF', () => {
    const out = html();
    expect(out).toContain('<tr class="section">');
    expect(out).toContain('<tr class="total">');
    expect(out).toContain('<tr class="band">');
    expect(out).toContain('<tr class="final">');
  });

  it('zebra-stripes detail rows and restarts the stripe at each section', () => {
    const out = html();
    const detail = [
      ...out.matchAll(/<tr class="detail([^"]*)"><td class="account"[^>]*>([^<]+)/g),
    ].map((m) => ({ zebra: (m[1] ?? '').includes('zebra'), name: m[2] }));
    expect(detail.slice(0, 3)).toEqual([
      { zebra: true, name: 'Sales' },
      { zebra: false, name: 'Services' },
      { zebra: true, name: 'Materials' },
    ]);
  });

  it('renders one amount column when there is no comparative, two when there is', () => {
    const one = html(pnlRows(), report({ comparativeStart: null, comparativeEnd: null }));
    expect((one.match(/<th class="amount">/g) ?? []).length).toBe(1);
    expect(html()).toContain('TOTAL (USD)');
    expect((html().match(/<th class="amount">/g) ?? []).length).toBe(2);
  });

  it('carries the letterhead, the signature and the derived analysis', () => {
    const out = html();
    expect(out).toContain(ASSETS.logo);
    expect(out).toContain(ASSETS.signature);
    expect(out).toContain('Nicolas Hoyos Restrepo');
    expect(out).toContain('Account Specialist · Hoyos Baker');
    expect(out).toContain('RE: Profit and Loss —');
  });
});
