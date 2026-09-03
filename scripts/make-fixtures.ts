// Generates the deterministic fixture documents used by tests/unit/ingestion:
// drawn-text PDFs, a CSV export, and the exact extraction results a correct
// model would return for each (tests/fixtures/expected/*.json — also used as
// the mocked Messages API responses). Runs under plain Node, so it cannot use
// the "@/" alias and carries its own tiny cents helpers.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

const OUT = 'tests/fixtures';
const FIXED_DATE = new Date('2026-07-01T00:00:00Z');
const ENTITY = 'Harbor Coffee Roasters LLC';
const FIRM = 'Hoyos Baker CPAs';
const [PAGE_W, PAGE_H, MARGIN, LINE_H, SIZE] = [612, 792, 54, 15, 10];

const cents = (s: string): number => {
  const negative = s.startsWith('-');
  const [whole = '0', fraction = ''] = s.replace('-', '').split('.');
  return (negative ? -1 : 1) * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
};
const dec = (c: number): string =>
  `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
const printed = (c: number): string => {
  const text = `${Math.floor(Math.abs(c) / 100).toLocaleString('en-US')}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
  return c < 0 ? `(${text})` : text;
};
const us = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

// ── Statement trees: leaves carry amounts, sections get a "Total …" line ─────
type Node = { name: string; current?: number; prior?: number; children?: Node[]; total?: boolean };
type Line = Record<string, unknown> & { page: number };

const leaf = (name: string, current: string, prior?: string): Node =>
  prior === undefined ? { name, current: cents(current) } : { name, current: cents(current), prior: cents(prior) };
// Sums leaves only: a section's own "Total …" child is skipped so nested sections are not double-counted.
const sum = (nodes: Node[], key: 'current' | 'prior'): number =>
  nodes.reduce((acc, n) => (n.total ? acc : acc + (n.children ? sum(n.children, key) : (n[key] ?? 0))), 0);
const section = (name: string, children: Node[], comparative = true): Node => {
  const total: Node = { name: `Total ${name}`, current: sum(children, 'current'), total: true };
  if (comparative) total.prior = sum(children, 'prior');
  return { name, children: [...children, total] };
};

function pnlTree(): Node[] {
  const income = section('Income', [leaf('Sales', '185400.00', '162300.00'), leaf('Service Revenue', '42150.50', '38900.00')]);
  const cogs = section('Cost of Goods Sold', [leaf('Materials', '61200.00', '55750.00'), leaf('Subcontractors', '18400.25', '15100.00')]);
  const expenses = section('Expenses', [
    leaf('Rent', '24000.00', '22800.00'), leaf('Payroll', '58320.00', '51600.00'), leaf('Insurance', '6150.00', '5900.00'),
    leaf('Utilities', '3480.75', '3210.40'), leaf('Advertising', '4725.00', '6100.00'), leaf('Office Supplies', '1289.60', '1455.20'),
    leaf('Software', '2940.00', '2640.00'), leaf('Professional Fees', '5500.00', '4800.00'), leaf('Depreciation', '3200.00', '3200.00'),
  ]);
  const gp = { current: sum([income], 'current') - sum([cogs], 'current'), prior: sum([income], 'prior') - sum([cogs], 'prior') };
  const ex = { current: sum([expenses], 'current'), prior: sum([expenses], 'prior') };
  return [
    income, cogs, { name: 'Gross Profit', ...gp, total: true }, expenses,
    { name: 'Net Income', current: gp.current - ex.current, prior: gp.prior - ex.prior, total: true },
  ];
}

function balanceSheetTree(checking: string): Node[] {
  const current = section('Current Assets', [leaf('Checking', checking), leaf('Savings', '25000.00'), leaf('Accounts Receivable', '31540.00')], false);
  const fixed = section('Fixed Assets', [leaf('Equipment', '42000.00'), leaf('Accumulated Depreciation', '-9600.00')], false);
  const assets = section('Assets', [current, fixed], false);
  const currentLiabilities = section('Current Liabilities', [leaf('Accounts Payable', '12430.20'), leaf('Credit Card', '4215.15'), leaf('Sales Tax Payable', '2860.00')], false);
  const longTerm = section('Long-Term Liabilities', [leaf('Equipment Loan', '28000.00')], false);
  const liabilities = section('Liabilities', [currentLiabilities, longTerm], false);
  const equity = section('Equity', [leaf("Owner's Equity", '51300.10'), leaf('Net Income', '38344.90')], false);
  return [assets, section('Liabilities and Equity', [liabilities, equity], false)];
}

/** Flattens a tree into extraction lines (refs, parents, depth, page from a fixed lines-per-page split). */
function flatten(tree: Node[], comparative: boolean, firstPage: number, perPage: number): Line[] {
  const lines: Line[] = [];
  const visit = (node: Node, parentRef: string | null, depth: number, top: string | null): void => {
    const ref = `L${lines.length + 1}`;
    const isSection = Boolean(node.children);
    const amount = (key: 'current' | 'prior') => (node[key] === undefined ? null : dec(node[key] ?? 0));
    const parts = [node.name, ...(isSection ? [] : [printed(node.current ?? 0), ...(comparative ? [printed(node.prior ?? 0)] : [])])];
    const line: Line = {
      ref, parent_ref: parentRef, depth, section: top ?? node.name, account_name: node.name, current: amount('current'),
      ...(comparative ? { prior: amount('prior') } : {}), is_section: isSection, is_total: Boolean(node.total),
      page: firstPage + Math.floor(lines.length / perPage), source_text: parts.join('  '), confidence: 1,
    };
    lines.push(line);
    node.children?.forEach((child) => visit(child, ref, depth + 1, top ?? node.name));
  };
  tree.forEach((node) => visit(node, null, 0, null));
  return lines;
}

// ── Bank statement / CSV data ────────────────────────────────────────────────
const BANK = { institution: 'First Harbor Bank', masked_account: '****4821', period_start: '2026-06-01', period_end: '2026-06-30', beginning: cents('41375.90') };
const MOVES: [string, string, string][] = [
  ['2026-06-02', 'Deposit - Client payment INV-1042', '8450.00'], ['2026-06-03', 'ACH - Harbor Property Mgmt rent', '-4000.00'],
  ['2026-06-05', 'Card - Office Depot', '-214.60'], ['2026-06-08', 'Deposit - Square settlement', '3120.45'],
  ['2026-06-10', 'Payroll - Gusto', '-9720.00'], ['2026-06-12', 'ACH - Blue Shield insurance', '-1025.00'],
  ['2026-06-15', 'Deposit - Client payment INV-1047', '12300.00'], ['2026-06-18', 'Card - Amazon supplies', '-389.99'],
  ['2026-06-20', 'Wire - Subcontractor Lopez', '-6200.00'], ['2026-06-24', 'Payroll - Gusto', '-9720.00'],
  ['2026-06-26', 'Deposit - Square settlement', '2875.10'], ['2026-06-30', 'Fee - Monthly service fee', '-15.00'],
];
const TX_PER_PAGE = 6;
function bankTransactions() {
  let balance = BANK.beginning;
  return MOVES.map(([date, description, amount], i) => {
    const c = cents(amount);
    balance += c;
    return { date, description, debit: c < 0 ? dec(-c) : null, credit: c > 0 ? dec(c) : null, running_balance: dec(balance), page: 1 + Math.floor(i / TX_PER_PAGE), confidence: 1 };
  });
}
const TAX = {
  tax_type: 'sales', jurisdiction: 'Colorado Department of Revenue', filing_period_start: '2026-04-01', filing_period_end: '2026-06-30',
  due_date: '2026-07-20', amount_paid: '2860.00', amount_payable: '0.00', taxable_sales: '98400.00', non_taxable_sales: '12250.00',
  tax_collected: '2860.00', payment_date: '2026-07-15', status: 'paid', confirmation_number: 'CO-2026-778812', page: 1, confidence: 1,
};

// ── Drawing ──────────────────────────────────────────────────────────────────
// Plain fields, not parameter properties: Node's type stripping rejects the latter.
class Doc {
  private readonly doc: PDFDocument;
  private readonly font: PDFFont;
  private readonly bold: PDFFont;
  private constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) { this.doc = doc; this.font = font; this.bold = bold; }
  static async create(): Promise<Doc> {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.setCreationDate(FIXED_DATE); doc.setModificationDate(FIXED_DATE); doc.setProducer('scripts/make-fixtures.ts'); doc.setCreator(FIRM);
    return new Doc(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  }
  page(header: string[]): { page: PDFPage; y: number } {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    header.forEach((text, i) => { page.drawText(text, { x: MARGIN, y, size: i === 0 ? 14 : SIZE, font: this.bold }); y -= LINE_H + (i === 0 ? 6 : 0); });
    return { page, y: y - LINE_H };
  }
  text(page: PDFPage, x: number, y: number, text: string, bold = false): void { page.drawText(text, { x, y, size: SIZE, font: bold ? this.bold : this.font }); }
  right(page: PDFPage, edge: number, y: number, text: string, bold = false): void { this.text(page, edge - (bold ? this.bold : this.font).widthOfTextAtSize(text, SIZE), y, text, bold); }
  async save(name: string): Promise<void> { writeFileSync(join(OUT, name), await this.doc.save({ useObjectStreams: false })); }
}

function drawStatement(d: Doc, lines: Line[], header: string[], columns: string[]): void {
  let slot: { page: PDFPage; y: number } | null = null;
  let pageNo = 0;
  for (const line of lines) {
    if (slot === null || line.page !== pageNo) {
      pageNo = line.page;
      const fresh = d.page(header);
      columns.forEach((c, i) => d.right(fresh.page, 440 + i * 110, fresh.y, c, true));
      fresh.y -= LINE_H;
      slot = fresh;
    }
    const { page, y } = slot;
    const bold = Boolean(line.is_section) || Boolean(line.is_total);
    d.text(page, MARGIN + Number(line.depth) * 14, y, String(line.account_name), bold);
    [line.current, line.prior].forEach((v, i) => { if (typeof v === 'string') d.right(page, 440 + i * 110, y, printed(cents(v)), bold); });
    slot.y -= LINE_H;
  }
}

async function letterAndPnl(): Promise<void> {
  const d = await Doc.create();
  const { page, y } = d.page([FIRM, '1200 Larimer Street, Suite 400, Denver, CO 80202']);
  ['July 1, 2026', '', `${ENTITY}`, 'Attn: Maria Alvarez', '', 'Dear Maria,', '',
    'Please find enclosed the Profit & Loss statement for the six months ended June 30, 2026,', 'with comparative figures for the same period of 2025.',
    'Gross margin held steady while advertising spend came down; we will walk through the', 'details at our quarterly review.', '', 'Kind regards,', 'Nicolas Hoyos, CPA',
  ].forEach((t, i) => d.text(page, MARGIN, y - i * LINE_H, t));
  const lines = flatten(pnlTree(), true, 2, 16);
  drawStatement(d, lines, [ENTITY, 'Profit & Loss', 'January 1 - June 30, 2026 (comparative: January 1 - June 30, 2025) · Accrual basis · USD'], ['Jan-Jun 2026', 'Jan-Jun 2025']);
  await d.save('letter-and-pnl.pdf');
  write('letter-and-pnl.classification.json', { pages: [{ page: 1, kind: 'firm_letter', confidence: 0.98 }, ...[2, 3].map((page) => ({ page, kind: 'financial_statement', report_type: 'profit_and_loss', period_start: '2026-01-01', period_end: '2026-06-30', confidence: 0.97 }))] });
  write('letter-and-pnl.json', { report_type: 'profit_and_loss', entity_name: ENTITY, basis: 'accrual', period_start: '2026-01-01', period_end: '2026-06-30', comparative_start: '2025-01-01', comparative_end: '2025-06-30', currency: 'USD', lines, warnings: [] });
}

async function balanceSheet(name: string, checking: string): Promise<void> {
  const d = await Doc.create();
  const lines = flatten(balanceSheetTree(checking), false, 1, 40);
  drawStatement(d, lines, [ENTITY, 'Balance Sheet', 'As of June 30, 2026 · Accrual basis · USD'], ['Jun 30, 2026']);
  await d.save(`${name}.pdf`);
  write(`${name}.classification.json`, { pages: [{ page: 1, kind: 'financial_statement', report_type: 'balance_sheet', period_start: '2026-06-30', period_end: '2026-06-30', confidence: 0.97 }] });
  write(`${name}.json`, { report_type: 'balance_sheet', entity_name: ENTITY, basis: 'accrual', statement_date: '2026-06-30', period_start: '2026-06-30', period_end: '2026-06-30', currency: 'USD', lines, warnings: [] });
}

async function bankStatement(): Promise<void> {
  const d = await Doc.create();
  const transactions = bankTransactions();
  const ending = transactions.at(-1)?.running_balance ?? '0.00';
  const header = [BANK.institution, `${ENTITY} · Business Checking ${BANK.masked_account}`, `Statement period ${us(BANK.period_start)} - ${us(BANK.period_end)}`];
  for (const pageNo of [1, 2]) {
    const { page, y } = d.page(header);
    let row = y;
    if (pageNo === 1) { d.text(page, MARGIN, row, `Beginning balance ${printed(BANK.beginning)}`, true); row -= LINE_H; }
    ['Date', 'Description'].forEach((c, i) => d.text(page, MARGIN + i * 80, row, c, true));
    ['Debits', 'Credits', 'Balance'].forEach((c, i) => d.right(page, 400 + i * 75, row, c, true));
    row -= LINE_H;
    for (const t of transactions.filter((x) => x.page === pageNo)) {
      d.text(page, MARGIN, row, us(t.date)); d.text(page, MARGIN + 80, row, t.description);
      [t.debit, t.credit, t.running_balance].forEach((v, i) => { if (v) d.right(page, 400 + i * 75, row, printed(cents(v))); });
      row -= LINE_H;
    }
    if (pageNo === 2) d.text(page, MARGIN, row - LINE_H, `Ending balance ${printed(cents(ending))}`, true);
  }
  await d.save('bank-statement.pdf');
  write('bank-statement.classification.json', { pages: [1, 2].map((page) => ({ page, kind: 'financial_statement', report_type: 'bank_statement', period_start: BANK.period_start, period_end: BANK.period_end, confidence: 0.96 })) });
  write('bank-statement.json', { institution: BANK.institution, masked_account: BANK.masked_account, period_start: BANK.period_start, period_end: BANK.period_end, beginning_balance: dec(BANK.beginning), ending_balance: ending, transactions });
  const csv = ['Date,Description,Amount,Balance', ...MOVES.map(([date, desc, amount], i) => `${us(date)},"${desc}",${amount},${transactions[i]?.running_balance ?? ''}`)].join('\n');
  writeFileSync(join(OUT, 'transactions.csv'), `${csv}\n`);
  write('transactions.mapping.json', { columns: { date: 'Date', description: 'Description', debit: null, credit: null, amount: 'Amount', balance: 'Balance' }, date_format: 'MM/DD/YYYY', sign_convention: 'signed_amount' });
}

async function salesTax(): Promise<void> {
  const d = await Doc.create();
  const { page, y } = d.page([TAX.jurisdiction, 'Sales Tax Return - Filing Confirmation', `Taxpayer: ${ENTITY}`]);
  const rows: [string, string][] = [
    ['Filing period', `${us(TAX.filing_period_start)} - ${us(TAX.filing_period_end)}`], ['Due date', us(TAX.due_date)],
    ['Taxable sales', printed(cents(TAX.taxable_sales))], ['Non-taxable sales', printed(cents(TAX.non_taxable_sales))],
    ['Tax collected', printed(cents(TAX.tax_collected))], ['Amount paid', printed(cents(TAX.amount_paid))],
    ['Balance due', printed(cents(TAX.amount_payable))], ['Payment date', us(TAX.payment_date)],
    ['Confirmation number', TAX.confirmation_number], ['Status', 'PAID'],
  ];
  rows.forEach(([label, value], i) => { d.text(page, MARGIN, y - i * LINE_H, label, true); d.text(page, MARGIN + 160, y - i * LINE_H, value); });
  await d.save('sales-tax-confirmation.pdf');
  write('sales-tax-confirmation.classification.json', { pages: [{ page: 1, kind: 'financial_statement', report_type: 'sales_tax', period_start: TAX.filing_period_start, period_end: TAX.filing_period_end, confidence: 0.95 }] });
  write('sales-tax-confirmation.json', TAX);
}

function write(name: string, data: unknown): void {
  writeFileSync(join(OUT, 'expected', name), `${JSON.stringify(data, null, 2)}\n`);
}

async function main(): Promise<void> {
  mkdirSync(join(OUT, 'expected'), { recursive: true });
  await letterAndPnl();
  await balanceSheet('balance-sheet', '48210.35');
  await balanceSheet('balance-sheet-unbalanced', '48460.35');
  await bankStatement();
  await salesTax();
  console.log(`Fixtures written to ${OUT}/`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
