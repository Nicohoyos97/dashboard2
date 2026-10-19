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

  it('fills the cover letter template from the period, basis and date of the statement', () => {
    const cover = build(pnlRows(), report({ basis: 'cash' })).cover;
    expect(cover.heading).toBe(
      'Profit & Loss Statement · January 1, 2026 – June 30, 2026 · Cash Basis',
    );
    expect(cover.intro).toBe(
      'Please find enclosed the Profit & Loss Statement for Sabor a Cafe Steak House Inc. for the period January 1, 2026 – June 30, 2026, prepared on a cash basis. The statement summarizes the income received and expenses paid during the period, based on the bank records, receipts and information provided by your business.',
    );
    expect(cover.enclosure).toBe('Enclosure: Profit & Loss Statement');
  });

  it('describes an accrual statement in accrual terms, article included', () => {
    const { intro, heading } = build().cover;
    expect(heading).toContain('· Accrual Basis');
    expect(intro).toContain('prepared on an accrual basis.');
    expect(intro).toContain('the income earned and expenses incurred during the period');
  });

  it('dates a balance sheet as of the day it closes', () => {
    const cover = build(balanceRows(), balanceReport()).cover;
    expect(cover.heading).toBe('Balance Sheet · As of June 30, 2026 · Accrual Basis');
    expect(cover.intro).toContain('the Balance Sheet for Sabor a Cafe Steak House Inc. as of June 30, 2026');
    expect(cover.intro).toContain('what the business owns, what it owes and the owner’s equity');
    expect(cover.enclosure).toBe('Enclosure: Balance Sheet');
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
    expect(input.cover.heading).toBe(
      'Estado de Resultados · 1 de enero de 2026 – 30 de junio de 2026 · Base Devengada',
    );
    expect(input.cover.intro).toContain('Adjunto encontrarás el Estado de Resultados');
    expect(input.cover.enclosure).toBe('Adjunto: Estado de Resultados');
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

  it('carries the letterhead, the letter, the signature and the enclosure', () => {
    const out = html();
    expect(out).toContain(ASSETS.logo);
    expect(out).toContain(ASSETS.signature);
    expect(out).toContain('To Whom It May Concern:');
    expect(out).toContain('has not been audited or reviewed');
    expect(out).toContain('Nicolas Hoyos Restrepo');
    expect(out).toContain('Account Specialist · Hoyos Baker');
    expect(out).toContain('Prepared by Hoyos Baker · Nicolas Hoyos Restrepo, Account Specialist');
    expect(out).toContain('Enclosure: Profit &amp; Loss Statement');
  });

  it('escapes a client-set business name on the cover', () => {
    const out = html(pnlRows(), report(), { entityName: '<b>Co</b> & Sons' });
    expect(out).not.toContain('<b>Co</b>');
    expect(out).toContain('&lt;b&gt;Co&lt;/b&gt; &amp; Sons');
  });
});
