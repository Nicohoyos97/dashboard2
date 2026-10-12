// Demo fixtures for local development (INITIAL_PROMPT.md §12 Phase 6, §3 rule
// 16: seed data is labeled "Demo"). Creates one firm client, one business, one
// client user, and six months of published statements, register reports, tax
// records, documents and reminders — enough for every page in the portal to show real
// shapes instead of empty states.
//
//   pnpm seed:demo                       # create or refresh the demo business
//   pnpm seed:demo -- --password <pw>    # set the demo client's password
//   pnpm seed:demo -- --remove           # delete the demo business and its user
//
// Runs with the service role from .env.local. Every figure below is invented:
// the business name carries "(Demo)" and the firm-facing client is
// "Demo Client", so a seeded row can never be mistaken for a real one.
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import type { Database } from '../lib/supabase/types';

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && match[1] && !process.env[match[1]]) process.env[match[1]] = match[2] ?? '';
    }
  } catch {
    // .env.local is optional when the variables come from the environment.
  }
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const arg = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const DEMO_EMAIL = 'demo.client@hoyosbaker.test';
const DEMO_BUSINESS = 'Sabor a Café (Demo)';
const DEMO_CLIENT = 'Demo Client';
const CURRENCY = 'USD';
/** The share of revenue rung up at the register; the rest is invoiced catering. */
const REGISTER_SHARE = 0.88;
/** Florida's 6% plus Miami-Dade's 1% surtax. */
const SALES_TAX_RATE = 0.07;

// Six whole months ending with the last complete month, so the period selector
// always has data no matter when the script runs.
function months(count: number): { start: string; end: string; key: string }[] {
  const now = new Date();
  const out: { start: string; end: string; key: string }[] = [];
  for (let back = count; back >= 1; back -= 1) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    out.push({ start: iso(first), end: iso(last), key: iso(first).slice(0, 7) });
  }
  return out;
}

// Deterministic pseudo-random so two runs produce the same numbers.
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const money = (value: number): number => Math.round(value * 100) / 100;

type Db = ReturnType<typeof createClient<Database>>;

const CATEGORIES = [
  { name: 'Rent', kind: 'occupancy' as const, is_fixed: true, vendor: 'Brickell Property LLC', monthly: 4200 },
  { name: 'Payroll', kind: 'payroll' as const, is_fixed: false, vendor: 'Gusto Payroll', monthly: 11800 },
  { name: 'Coffee & supplies', kind: 'cogs' as const, is_fixed: false, vendor: 'Cafe Import Co', monthly: 6400 },
  { name: 'Marketing', kind: 'marketing' as const, is_fixed: false, vendor: 'Meta Platforms', monthly: 900 },
  { name: 'Software', kind: 'operating' as const, is_fixed: true, vendor: 'Toast POS', monthly: 380 },
  { name: 'Professional services', kind: 'professional_services' as const, is_fixed: true, vendor: 'Hoyos Baker', monthly: 650 },
  { name: 'Utilities', kind: 'operating' as const, is_fixed: false, vendor: 'FPL', monthly: 720 },
];

async function removeDemo(admin: Db): Promise<void> {
  const { data: entity } = await admin.from('business_entities').select('id').eq('name', DEMO_BUSINESS).maybeSingle();
  if (entity) {
    // The rows cascade from the business; the files in the bucket do not.
    const { data: versions } = await admin.from('document_versions').select('storage_path').eq('business_entity_id', entity.id);
    const paths = (versions ?? []).map((v) => v.storage_path).filter((path): path is string => Boolean(path));
    if (paths.length > 0) await admin.storage.from('documents').remove(paths);
    // Everything tenant-scoped cascades from the business row.
    await admin.from('business_entities').delete().eq('id', entity.id);
    console.log(`Removed "${DEMO_BUSINESS}" and all of its data.`);
  }
  const { data: profile } = await admin.from('profiles').select('id').eq('email', DEMO_EMAIL).maybeSingle();
  if (profile) {
    await admin.auth.admin.deleteUser(profile.id);
    console.log(`Removed ${DEMO_EMAIL}.`);
  }
  const { data: client } = await admin.from('clients').select('id').eq('name', DEMO_CLIENT).maybeSingle();
  if (client) await admin.from('clients').delete().eq('id', client.id);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  const remote = !url.includes('localhost') && !url.includes('127.0.0.1');
  if (remote && !args.includes('--force-remote')) {
    throw new Error('Refusing to seed a non-local Supabase. Pass --force-remote if you really mean it.');
  }
  // The default password is printed in this file; it must never become a
  // confirmed account on a real project.
  if (remote && !arg('--password')) {
    throw new Error('--force-remote requires an explicit --password.');
  }

  const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

  if (args.includes('--remove')) {
    await removeDemo(admin);
    return;
  }

  // Re-running is idempotent: drop the previous demo business first so the
  // figures never accumulate.
  await removeDemo(admin);

  const password = arg('--password') ?? 'DemoClient!2026';
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
  });
  if (userError || !created.user) throw new Error(`createUser: ${userError?.message}`);
  const userId = created.user.id;
  await admin.from('profiles').update({ full_name: 'Demo Owner' }).eq('id', userId);

  const { data: firm } = await admin.from('firms').select('id').limit(1).maybeSingle();
  if (!firm) throw new Error('No firm yet. Run `pnpm firm:admin -- <email> --password <pw>` first.');

  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({ firm_id: firm.id, name: DEMO_CLIENT, contact_name: 'Demo Owner', contact_email: DEMO_EMAIL, notes: 'Seeded by pnpm seed:demo — not a real client.' })
    .select('id')
    .single();
  if (clientError || !client) throw new Error(`insert client: ${clientError?.message}`);

  const { data: entity, error: entityError } = await admin
    .from('business_entities')
    .insert({
      name: DEMO_BUSINESS,
      legal_name: 'Sabor a Cafe Demo LLC',
      client_id: client.id,
      currency: CURRENCY,
      // A real zone, not UTC: the demo should show due dates rolling over on the
      // business's own calendar (migration 0010).
      timezone: 'America/New_York',
      accounting_basis: 'accrual',
      sales_tax_enabled: true,
      // Everything the firm sells, both add-ons included: the demo is what a
      // prospect is shown, so no page may be missing from it.
      enabled_modules: { bookkeeping: true, balance_sheet: true, income_taxes: true },
      address: { line1: '1200 Brickell Ave', line2: 'Suite 400', city: 'Miami', state: 'FL', postal_code: '33131', country: 'US' },
    })
    .select('id')
    .single();
  if (entityError || !entity) throw new Error(`insert business: ${entityError?.message}`);
  const entityId = entity.id;

  await admin.from('entity_memberships').insert({ business_entity_id: entityId, user_id: userId, role: 'client_owner' });

  const period = months(6);
  const first = period[0];
  const last = period[period.length - 1];
  if (!first || !last) throw new Error('no periods');
  const publishedAt = new Date().toISOString();

  // ── six months of revenue and spend ────────────────────────────────────────
  // No bank activity is seeded: the firm publishes statements, not bank
  // statements (owner, 2026-10-07), and the demo shows what a client gets.
  const random = rng(20_260_903);
  const revenueByMonth = new Map<string, number>();
  // Per category, per month, so one category can move on its own and the
  // insight rules have something real to find.
  const spendByMonth = new Map<string, Map<string, number>>();

  for (const month of period) {
    // Four weeks of sales, growing gently across the period.
    const growth = 1 + period.indexOf(month) * 0.03;
    let revenue = 0;
    for (let week = 0; week < 4; week += 1) revenue += money((7_800 + random() * 2_400) * growth);
    revenueByMonth.set(month.key, money(revenue));

    const spend = new Map<string, number>();
    // One month carries a payroll bonus, so the demo has a category that
    // genuinely moved rather than a flat line the rules cannot see.
    const bonus = period.indexOf(month) === period.length - 2 ? 1.28 : 1;
    for (const category of CATEGORIES) {
      const swing = category.name === 'Payroll' ? bonus : 1;
      spend.set(category.name, money(category.monthly * (0.9 + random() * 0.2) * swing));
    }
    spendByMonth.set(month.key, spend);
  }

  // ── monthly P&L ──────────────────────────────────
  for (const [index, month] of period.entries()) {
    const revenue = revenueByMonth.get(month.key) ?? 0;
    const priorMonth = (index > 0 ? period[index - 1] : null) ?? null;
    const priorRevenue = priorMonth ? (revenueByMonth.get(priorMonth.key) ?? null) : null;
    const spend = spendByMonth.get(month.key) ?? new Map<string, number>();
    const priorSpend = priorMonth ? (spendByMonth.get(priorMonth.key) ?? null) : null;
    await insertPnl(admin, { entityId, month, priorMonth, revenue, priorRevenue, spend, priorSpend, publishedAt });
  }

  // ── the register: one point-of-sale report per month ───────────────────────
  // Net sales are the P&L's "Coffee & food sales" line (catering is invoiced,
  // not rung up), so the Sales Taxes page and the statement tell one story.
  const registerByMonth = new Map<string, { net: number; tax: number }>();
  for (const month of period) {
    const net = money((revenueByMonth.get(month.key) ?? 0) * REGISTER_SHARE);
    const refunds = money(net * 0.012);
    const discounts = money(net * 0.008);
    const tax = money(net * SALES_TAX_RATE);
    const tips = money(net * 0.06);
    const collected = money(net + tax + tips);
    const card = money(collected * 0.78);
    registerByMonth.set(month.key, { net, tax });
    const { data: register, error: registerError } = await admin
      .from('sales_reports')
      .insert({
        business_entity_id: entityId, source_system: 'toast', period_start: month.start, period_end: month.end,
        currency: CURRENCY, gross_sales: money(net + refunds + discounts), net_sales: net, refunds, discounts, tips,
        tax_collected: tax, amount_collected: collected, order_count: Math.round(net / 14.5),
        source: 'firm_document', status: 'published', published_at: publishedAt, confidence: 0.98,
        reconciliation: { passed: true, checks: [{ key: 'net_sales', ok: true }] },
      })
      .select('id')
      .single();
    if (registerError || !register) throw new Error(`insert sales report: ${registerError?.message}`);
    const { error: tenderError } = await admin.from('sales_report_tenders').insert([
      { sales_report_id: register.id, business_entity_id: entityId, label: 'Card', amount: card, position: 0 },
      { sales_report_id: register.id, business_entity_id: entityId, label: 'Cash', amount: money(collected - card), position: 1 },
    ]);
    if (tenderError) throw new Error(`insert tenders: ${tenderError.message}`);
  }
  // A quarter's filing restates what the register rang up in its three months;
  // when the six seeded months do not cover a whole quarter, a fixed figure.
  const quarterOf = (back: number, fallback: { net: number; tax: number }) => {
    const start = quarterStart(last.end, back);
    const end = quarterEnd(last.end, back);
    const inside = period.filter((month) => month.start >= start && month.end <= end);
    if (inside.length !== 3) return fallback;
    const sum = (pick: 'net' | 'tax') => money(inside.reduce((total, month) => total + (registerByMonth.get(month.key)?.[pick] ?? 0), 0));
    return { net: sum('net'), tax: sum('tax') };
  };
  const priorQuarter = quarterOf(1, { net: 96_400, tax: 6_748 });
  const currentQuarter = quarterOf(0, { net: 101_900, tax: 7_133 });

  // A Balance Sheet at every month end, so the page has a trend and something
  // to compare with. The latest carries the sales tax still owed.
  // Sales tax accrues through the quarter and is paid after it closes.
  const owedAt = (index: number): number => {
    if (index === period.length - 1) return currentQuarter.tax;
    const month = period[index];
    return month ? money((registerByMonth.get(month.key)?.tax ?? 0) * ((index % 3) + 1)) : 0;
  };
  for (const [index, month] of period.entries()) {
    const before = index > 0 ? period[index - 1] : undefined;
    await insertBalanceSheet(admin, {
      entityId,
      asOf: month.end,
      step: period.length - 1 - index,
      salesTaxPayable: owedAt(index),
      prior: before ? { asOf: before.end, salesTaxPayable: owedAt(index - 1) } : null,
      publishedAt,
    });
  }

  // ── the documents behind the latest statements ─────────────────────────────
  // So the reports library, the downloads and "original document" have
  // something to open: a PDF printed from the very lines seeded above.
  for (const type of ['profit_and_loss', 'balance_sheet'] as const) {
    await attachDemoDocument(admin, { entityId, type, periodEnd: last.end, publishedAt });
  }

  // ── taxes, reminders, notification ─────────────────────────────────────────
  const { data: jurisdictions } = await admin
    .from('tax_jurisdictions')
    .insert([
      { business_entity_id: entityId, tax_type: 'income', level: 'federal', name: 'IRS (Demo)', code: 'US', filing_frequency: 'annual' },
      { business_entity_id: entityId, tax_type: 'sales', level: 'state', name: 'Florida (Demo)', code: 'US-FL', filing_frequency: 'quarterly' },
    ])
    .select('id, code');
  const federal = jurisdictions?.find((j) => j.code === 'US')?.id ?? null;
  const state = jurisdictions?.find((j) => j.code === 'US-FL')?.id ?? null;
  const year = Number(last.end.slice(0, 4));

  const { data: obligations } = await admin
    .from('tax_obligations')
    .insert([
      {
        business_entity_id: entityId, tax_type: 'income', jurisdiction_id: federal, tax_year: year - 1,
        due_date: `${year}-04-15`, filing_status: 'filed', amount_confirmed: 18_420, amount_paid: 18_420, amount_payable: 0,
        status: 'firm_confirmed', confirmation_number: 'DEMO-IRS-8841', source: 'firm_document', published_at: publishedAt,
        notes: 'Filed on time. Nothing outstanding for this year.',
      },
      {
        business_entity_id: entityId, tax_type: 'income', jurisdiction_id: federal, tax_year: year,
        due_date: `${year + 1}-04-15`, filing_status: 'not_filed', amount_estimated: 21_500, amount_paid: 12_000,
        status: 'estimated', source: 'firm_entry', published_at: publishedAt,
        notes: 'Estimate based on results through the last closed month. Two quarterly payments made so far.',
      },
      {
        business_entity_id: entityId, tax_type: 'sales', jurisdiction_id: state, tax_year: year,
        period_start: quarterStart(last.end, 1), period_end: quarterEnd(last.end, 1), due_date: quarterDue(last.end, 1),
        filing_status: 'filed', taxable_sales: priorQuarter.net, non_taxable_sales: 4_100, tax_collected: priorQuarter.tax,
        amount_paid: priorQuarter.tax, amount_payable: 0, status: 'paid', confirmation_number: 'DEMO-FL-22190',
        source: 'firm_document', published_at: publishedAt,
      },
      {
        business_entity_id: entityId, tax_type: 'sales', jurisdiction_id: state, tax_year: year,
        period_start: quarterStart(last.end, 0), period_end: quarterEnd(last.end, 0), due_date: quarterDue(last.end, 0),
        filing_status: 'not_filed', taxable_sales: currentQuarter.net, non_taxable_sales: 3_800, tax_collected: currentQuarter.tax,
        amount_payable: currentQuarter.tax, status: 'payable', source: 'firm_entry', published_at: publishedAt,
        notes: 'Return prepared, waiting on your confirmation before we file.',
      },
    ])
    .select('id, status');
  const paidObligation = obligations?.find((o) => o.status === 'paid')?.id;
  if (paidObligation) {
    await admin.from('tax_payments').insert({
      business_entity_id: entityId, obligation_id: paidObligation, paid_on: quarterDue(last.end, 1),
      amount: priorQuarter.tax, method: 'ACH', confirmation_number: 'DEMO-FL-22190', source: 'firm_document', published_at: publishedAt,
    });
  }

  await admin.from('reminders').insert([
    { business_entity_id: entityId, reminder_type: 'sales_tax_deadline', title: 'Florida sales tax return (Demo)', amount: currentQuarter.tax, due_date: quarterDue(last.end, 0), status: 'needs_confirmation', responsible: 'client', action_required: 'Confirm the figures so we can file.', source: 'firm_entry', published_at: publishedAt },
    { business_entity_id: entityId, reminder_type: 'estimated_income_tax', title: 'Estimated federal income tax (Demo)', amount: 5_375, due_date: `${year + 1}-01-15`, status: 'upcoming', responsible: 'client', source: 'firm_entry', published_at: publishedAt },
    { business_entity_id: entityId, reminder_type: 'payroll_date', title: 'Payroll run (Demo)', amount: 11_800, due_date: nextFriday(), status: 'upcoming', responsible: 'firm', source: 'firm_entry', published_at: publishedAt },
  ]);

  await admin.from('notifications').insert({
    user_id: userId,
    business_entity_id: entityId,
    kind: 'document.published',
    title: `Profit & Loss for ${last.key} is ready (Demo)`,
    body: 'Your accountant published a new statement.',
    link_path: '/statements/profit-and-loss',
  });

  console.log(`Seeded "${DEMO_BUSINESS}" with ${period.length} months of data.`);
  console.log(`Sign in as ${DEMO_EMAIL} / ${password}`);
  console.log('Remove it again with: pnpm seed:demo -- --remove');
}

/** `back` = 0 for the quarter containing `iso`, 1 for the one before it. */
function quarterStart(iso: string, back: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const quarter = Math.floor(date.getUTCMonth() / 3) - back;
  const start = new Date(Date.UTC(date.getUTCFullYear(), quarter * 3, 1));
  return start.toISOString().slice(0, 10);
}

function quarterEnd(iso: string, back: number): string {
  const start = new Date(`${quarterStart(iso, back)}T00:00:00Z`);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)).toISOString().slice(0, 10);
}

/** Florida files on the 20th of the month after the quarter ends. */
function quarterDue(iso: string, back: number): string {
  const end = new Date(`${quarterEnd(iso, back)}T00:00:00Z`);
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 20)).toISOString().slice(0, 10);
}

function nextFriday(): string {
  const now = new Date();
  const days = (5 - now.getUTCDay() + 7) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

type Line = { name: string; current: number | null; prior: number | null; section?: string; isSection?: boolean; isTotal?: boolean; children?: Line[] };

async function insertLines(admin: Db, entityId: string, reportId: string, lines: Line[]): Promise<void> {
  let position = 0;
  const walk = async (nodes: Line[], parentId: string | null, depth: number): Promise<void> => {
    for (const node of nodes) {
      const { data, error } = await admin
        .from('financial_statement_lines')
        .insert({
          report_id: reportId,
          business_entity_id: entityId,
          parent_line_id: parentId,
          position: (position += 1),
          depth,
          section: node.section ?? null,
          account_name: node.name,
          current: node.current,
          prior: node.prior,
          extracted_current: node.current,
          extracted_prior: node.prior,
          is_section: node.isSection ?? false,
          is_total: node.isTotal ?? false,
          confidence: 0.98,
          source: 'firm_document',
          page_number: 1,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`insert line: ${error?.message}`);
      if (node.children) await walk(node.children, data.id, depth + 1);
    }
  };
  await walk(lines, null, 0);
}

async function insertPnl(
  admin: Db,
  input: {
    entityId: string;
    month: { start: string; end: string; key: string };
    priorMonth: { start: string; end: string } | null;
    revenue: number;
    priorRevenue: number | null;
    /** What each category actually cost this month, and last, keyed by name. */
    spend: ReadonlyMap<string, number>;
    priorSpend: ReadonlyMap<string, number> | null;
    publishedAt: string;
  },
): Promise<void> {
  const { entityId, month, priorMonth, revenue, priorRevenue, spend, priorSpend, publishedAt } = input;
  const cogs = money(revenue * 0.31);
  const priorCogs = priorRevenue === null ? null : money(priorRevenue * 0.31);
  const operating = CATEGORIES.filter((c) => c.kind !== 'cogs');
  const sum = (source: ReadonlyMap<string, number> | null) =>
    source === null ? null : money(operating.reduce((total, c) => total + (source.get(c.name) ?? 0), 0));
  const opex = sum(spend) ?? 0;
  const priorOpex = sum(priorSpend);

  const { data: report, error } = await admin
    .from('financial_reports')
    .insert({
      business_entity_id: entityId,
      report_type: 'profit_and_loss',
      basis: 'accrual',
      currency: CURRENCY,
      period_start: month.start,
      period_end: month.end,
      comparative_start: priorMonth?.start ?? null,
      comparative_end: priorMonth?.end ?? null,
      entity_name_on_statement: DEMO_BUSINESS,
      source: 'firm_document',
      status: 'published',
      published_at: publishedAt,
      confidence: 0.98,
      reconciliation: { passed: true, checks: [{ key: 'net_income_ties', ok: true }] },
    })
    .select('id')
    .single();
  if (error || !report) throw new Error(`insert P&L: ${error?.message}`);

  const grossProfit = money(revenue - cogs);
  const priorGross = priorRevenue === null || priorCogs === null ? null : money(priorRevenue - priorCogs);
  const netIncome = money(grossProfit - opex);
  const priorNet = priorGross === null || priorOpex === null ? null : money(priorGross - priorOpex);

  await insertLines(admin, entityId, report.id, [
    {
      name: 'Income', section: 'income', isSection: true, current: null, prior: null,
      children: [
        { name: 'Coffee & food sales', section: 'income', current: money(revenue * REGISTER_SHARE), prior: priorRevenue === null ? null : money(priorRevenue * REGISTER_SHARE) },
        { name: 'Catering', section: 'income', current: money(revenue * (1 - REGISTER_SHARE)), prior: priorRevenue === null ? null : money(priorRevenue * (1 - REGISTER_SHARE)) },
        { name: 'Total Income', section: 'income', isTotal: true, current: revenue, prior: priorRevenue },
      ],
    },
    {
      name: 'Cost of Goods Sold', section: 'cogs', isSection: true, current: null, prior: null,
      children: [
        { name: 'Coffee beans', section: 'cogs', current: money(cogs * 0.62), prior: priorCogs === null ? null : money(priorCogs * 0.62) },
        { name: 'Milk & dairy', section: 'cogs', current: money(cogs * 0.38), prior: priorCogs === null ? null : money(priorCogs * 0.38) },
        { name: 'Total Cost of Goods Sold', section: 'cogs', isTotal: true, current: cogs, prior: priorCogs },
      ],
    },
    { name: 'Gross Profit', isTotal: true, current: grossProfit, prior: priorGross },
    {
      name: 'Expenses', section: 'expenses', isSection: true, current: null, prior: null,
      children: [
        ...operating.map((c) => ({
          name: c.name,
          section: 'expenses',
          current: spend.get(c.name) ?? 0,
          prior: priorSpend?.get(c.name) ?? null,
        })),
        { name: 'Total Expenses', section: 'expenses', isTotal: true, current: money(opex), prior: priorOpex },
      ],
    },
    { name: 'Net Income', isTotal: true, current: netIncome, prior: priorNet },
  ]);
}

/** The balance sheet `step` months before the latest: the figures drift back from the closing ones. */
function balanceFigures(step: number, salesTaxPayable: number) {
  const cash = 61_480 - step * 2_350;
  const receivable = 8_240 - step * 310;
  const inventory = 5_100 + step * 120;
  // Net of depreciation, so an earlier month carries more of it.
  const equipment = 34_600 + step * 480;
  const currentAssets = money(cash + receivable + inventory);
  const totalAssets = money(currentAssets + equipment);
  const payable = 6_900 - step * 180;
  const card = 3_410 + step * 260;
  const totalLiabilities = money(payable + salesTaxPayable + card);
  return {
    cash, receivable, inventory, equipment, currentAssets, totalAssets, payable, salesTaxPayable, card,
    totalLiabilities, equity: money(totalAssets - totalLiabilities),
  };
}

/** One month-end balance sheet; `prior` is the month before, printed as its comparative column. */
async function insertBalanceSheet(
  admin: Db,
  input: {
    entityId: string;
    asOf: string;
    step: number;
    salesTaxPayable: number;
    prior: { asOf: string; salesTaxPayable: number } | null;
    publishedAt: string;
  },
): Promise<void> {
  const { entityId, asOf, step, publishedAt } = input;
  const now = balanceFigures(step, input.salesTaxPayable);
  const before = input.prior ? balanceFigures(step + 1, input.prior.salesTaxPayable) : null;
  const row = (name: string, section: string, key: keyof typeof now, isTotal = false): Line => ({
    name, section, current: now[key], prior: before ? before[key] : null, ...(isTotal ? { isTotal: true } : {}),
  });

  const { data: report, error } = await admin
    .from('financial_reports')
    .insert({
      business_entity_id: entityId,
      report_type: 'balance_sheet',
      basis: 'accrual',
      currency: CURRENCY,
      period_start: asOf,
      period_end: asOf,
      comparative_start: input.prior?.asOf ?? null,
      comparative_end: input.prior?.asOf ?? null,
      statement_date: asOf,
      entity_name_on_statement: DEMO_BUSINESS,
      source: 'firm_document',
      status: 'published',
      published_at: publishedAt,
      confidence: 0.98,
      reconciliation: { passed: true, checks: [{ key: 'accounting_equation', ok: true }] },
    })
    .select('id')
    .single();
  if (error || !report) throw new Error(`insert balance sheet: ${error?.message}`);

  await insertLines(admin, entityId, report.id, [
    {
      name: 'Assets', section: 'assets', isSection: true, current: null, prior: null,
      children: [
        {
          name: 'Current Assets', section: 'assets', isSection: true, current: null, prior: null,
          children: [
            row('Cash and cash equivalents', 'assets', 'cash'),
            row('Accounts receivable', 'assets', 'receivable'),
            row('Inventory', 'assets', 'inventory'),
            row('Total Current Assets', 'assets', 'currentAssets', true),
          ],
        },
        row('Equipment, net', 'assets', 'equipment'),
        row('Total Assets', 'assets', 'totalAssets', true),
      ],
    },
    {
      name: 'Liabilities', section: 'liabilities', isSection: true, current: null, prior: null,
      children: [
        row('Accounts payable', 'liabilities', 'payable'),
        row('Sales tax payable', 'liabilities', 'salesTaxPayable'),
        row('Credit card', 'liabilities', 'card'),
        row('Total Current Liabilities', 'liabilities', 'totalLiabilities', true),
        row('Total Liabilities', 'liabilities', 'totalLiabilities', true),
      ],
    },
    {
      name: 'Equity', section: 'equity', isSection: true, current: null, prior: null,
      children: [row("Owner's equity", 'equity', 'equity'), row('Total Equity', 'equity', 'equity', true)],
    },
  ]);
}

/** A one-page PDF of a seeded statement, stored and linked as the document it was "extracted" from. */
async function attachDemoDocument(
  admin: Db,
  input: { entityId: string; type: 'profit_and_loss' | 'balance_sheet'; periodEnd: string; publishedAt: string },
): Promise<void> {
  const { entityId, type, periodEnd, publishedAt } = input;
  const { data: report } = await admin
    .from('financial_reports')
    .select('id, period_start, period_end')
    .eq('business_entity_id', entityId)
    .eq('report_type', type)
    .eq('period_end', periodEnd)
    .maybeSingle();
  if (!report) return;
  const { data: lines } = await admin
    .from('financial_statement_lines')
    .select('account_name, depth, current, is_total, is_section')
    .eq('report_id', report.id)
    .order('position');

  const label = type === 'profit_and_loss' ? 'Profit & Loss' : 'Balance Sheet';
  const period = type === 'profit_and_loss' ? `${report.period_start} to ${report.period_end}` : `As of ${report.period_end}`;
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  sheet.drawText(DEMO_BUSINESS, { x: 56, y: 730, size: 16, font: bold });
  sheet.drawText(`${label} - ${period}`, { x: 56, y: 710, size: 11, font: regular });
  sheet.drawText('Demo document. Every figure is invented.', { x: 56, y: 694, size: 9, font: regular });
  let y = 660;
  for (const line of lines ?? []) {
    const font = line.is_total || line.is_section ? bold : regular;
    sheet.drawText(line.account_name, { x: 56 + line.depth * 14, y, size: 10, font });
    if (line.current !== null) {
      const text = amount.format(line.current);
      sheet.drawText(text, { x: 556 - font.widthOfTextAtSize(text, 10), y, size: 10, font });
    }
    y -= 17;
  }
  const bytes = await pdf.save();

  const filename = `${type.replace(/_/g, '-')}-${report.period_end}-demo.pdf`;
  const { data: doc, error: docError } = await admin
    .from('documents')
    .insert({
      business_entity_id: entityId, document_type: type, title: `${label} ${report.period_end} (Demo)`, status: 'published',
      period_start: report.period_start, period_end: report.period_end, published_at: publishedAt,
    })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`insert document: ${docError?.message}`);
  const path = `${entityId}/${doc.id}/v1/${filename}`;
  const { error: uploadError } = await admin.storage.from('documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(`upload document: ${uploadError.message}`);
  const { data: version, error: versionError } = await admin
    .from('document_versions')
    .insert({
      document_id: doc.id, business_entity_id: entityId, version_no: 1, storage_path: path, original_filename: filename,
      mime_type: 'application/pdf', size_bytes: bytes.length, page_count: 1, upload_status: 'uploaded',
    })
    .select('id')
    .single();
  if (versionError || !version) throw new Error(`insert document version: ${versionError?.message}`);
  await admin.from('documents').update({ current_version_id: version.id }).eq('id', doc.id);
  await admin.from('financial_reports').update({ document_version_id: version.id }).eq('id', report.id);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
