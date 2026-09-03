import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { buildHierarchy } from '@/lib/ingestion/hierarchy';
import { FinancialStatementSchema } from '@/lib/ingestion/schemas/financial-statement';

import type { Fixtures } from './fixtures';

// Persists a fixture statement the way the worker + publish flow would, so
// client-portal specs can start from published data. Returns ids and the
// printed totals the UI must show.
export async function seedPublishedStatement(
  fx: Fixtures,
  entityId: string,
  fixture: 'letter-and-pnl' | 'balance-sheet',
  options: { publish?: boolean; uploaded: string[] } = { uploaded: [] },
) {
  const publish = options.publish ?? true;
  const pdf = readFileSync(`tests/fixtures/${fixture}.pdf`);
  const statement = FinancialStatementSchema.parse(JSON.parse(readFileSync(`tests/fixtures/expected/${fixture}.json`, 'utf8')));
  const { rows } = buildHierarchy(statement.lines);
  const now = new Date().toISOString();

  const { data: doc, error: docError } = await fx.admin
    .from('documents')
    .insert({ business_entity_id: entityId, document_type: statement.report_type, title: `${fixture} ${entityId.slice(0, 6)}`, status: publish ? 'published' : 'reconciled', period_start: statement.period_start, period_end: statement.period_end, published_at: publish ? now : null })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`seed statement document: ${docError?.code}`);
  const path = `${entityId}/${doc.id}/v1/${fixture}.pdf`;
  await fx.admin.storage.from('documents').upload(path, pdf, { contentType: 'application/pdf' });
  options.uploaded.push(path);
  const { data: version, error: versionError } = await fx.admin
    .from('document_versions')
    .insert({ document_id: doc.id, business_entity_id: entityId, version_no: 1, storage_path: path, original_filename: `${fixture}.pdf`, mime_type: 'application/pdf', size_bytes: pdf.length, sha256: randomUUID().replace(/-/g, ''), page_count: 3, upload_status: 'uploaded' })
    .select('id')
    .single();
  if (versionError || !version) throw new Error(`seed statement version: ${versionError?.code}`);
  await fx.admin.from('documents').update({ current_version_id: version.id }).eq('id', doc.id);

  const { data: report, error: reportError } = await fx.admin
    .from('financial_reports')
    .insert({ business_entity_id: entityId, report_type: statement.report_type, basis: statement.basis ?? null, currency: statement.currency, period_start: statement.period_start, period_end: statement.period_end, comparative_start: statement.comparative_start ?? null, comparative_end: statement.comparative_end ?? null, source: 'firm_document', document_version_id: version.id, status: publish ? 'published' : 'reconciled', published_at: publish ? now : null, reconciliation: { passed: true, checks: [], lowConfidence: { count: 0, refs: [] } } })
    .select('id')
    .single();
  if (reportError || !report) throw new Error(`seed financial report: ${reportError?.code}`);

  const ids = rows.map(() => randomUUID());
  const idAt = (index: number): string => {
    const id = ids[index];
    if (!id) throw new Error('seed statement line id missing');
    return id;
  };
  await fx.admin.from('financial_statement_lines').insert(
    rows.map((r, i) => ({
      id: idAt(i),
      report_id: report.id,
      business_entity_id: entityId,
      parent_line_id: r.parentIndex === null ? null : idAt(r.parentIndex),
      position: r.position,
      depth: r.depth,
      section: r.section,
      account_name: r.account_name,
      current: r.currentCents === null ? null : r.currentCents / 100,
      prior: r.priorCents === null ? null : r.priorCents / 100,
      is_section: r.is_section,
      is_total: r.is_total,
      page_number: r.page,
      source_text: r.source_text,
      confidence: r.confidence,
      source: 'firm_document',
      document_version_id: version.id,
    })),
  );

  const total = (needle: RegExp) => rows.find((r) => r.is_total && needle.test(r.account_name))?.currentCents ?? null;
  return {
    documentId: doc.id,
    versionId: version.id,
    reportId: report.id,
    period: { start: statement.period_start, end: statement.period_end },
    totals: { netIncome: total(/^net income$/i), revenue: total(/^total income$/i), assets: total(/^total assets$/i) },
    lineCount: rows.length,
  };
}

// Six complete monthly statements for one USD account. The deterministic
// values make Overview totals verifiable without claiming a PDF contained
// periods that the fixture PDF does not actually print.
export async function seedPublishedCashMonths(fx: Fixtures, entityId: string) {
  const now = new Date().toISOString();
  const { data: account, error: accountError } = await fx.admin
    .from('bank_accounts')
    .insert({ business_entity_id: entityId, institution: 'Test Bank', masked_number: '••••4242', account_type: 'checking', currency: 'USD' })
    .select('id')
    .single();
  if (accountError || !account) throw new Error(`seed cash account: ${accountError?.code}`);

  let totalInCents = 0;
  let totalOutCents = 0;
  for (let month = 1; month <= 6; month += 1) {
    const mm = String(month).padStart(2, '0');
    const endDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    const periodStart = `2026-${mm}-01`;
    const periodEnd = `2026-${mm}-${endDay}`;
    const { data: statement, error: statementError } = await fx.admin
      .from('bank_statements')
      .insert({
        business_entity_id: entityId,
        bank_account_id: account.id,
        period_start: periodStart,
        period_end: periodEnd,
        beginning_balance: 1000 + month * 300,
        ending_balance: 1300 + month * 300,
        source: 'firm_entry',
        status: 'published',
        reconciliation: { passed: true, checks: [], lowConfidence: { count: 0, refs: [] } },
        published_at: now,
      })
      .select('id')
      .single();
    if (statementError || !statement) throw new Error(`seed cash statement: ${statementError?.code}`);

    const creditCents = 100_000;
    const debitCents = 110_000;
    totalInCents += creditCents;
    totalOutCents += debitCents;
    const { error: txError } = await fx.admin.from('bank_transactions').insert([
      {
        business_entity_id: entityId,
        bank_account_id: account.id,
        bank_statement_id: statement.id,
        txn_date: `2026-${mm}-05`,
        description: 'Test deposit',
        credit: creditCents / 100,
        source: 'firm_entry',
        dedupe_key: randomUUID().replace(/-/g, ''),
      },
      {
        business_entity_id: entityId,
        bank_account_id: account.id,
        bank_statement_id: statement.id,
        txn_date: `2026-${mm}-15`,
        description: 'Test payment',
        debit: debitCents / 100,
        source: 'firm_entry',
        dedupe_key: randomUUID().replace(/-/g, ''),
      },
    ]);
    if (txError) throw new Error(`seed cash transactions: ${txError.code}`);
  }
  return { totalInCents, totalOutCents, netCents: totalInCents - totalOutCents };
}

export async function seedPublishedReminder(fx: Fixtures, entityId: string, dueDate: string) {
  const { data, error } = await fx.admin
    .from('reminders')
    .insert({
      business_entity_id: entityId,
      reminder_type: 'loan_payment',
      title: 'Equipment loan payment',
      amount: 450,
      due_date: dueDate,
      status: 'upcoming',
      responsible: 'client',
      action_required: 'Schedule the payment.',
      source: 'firm_entry',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed reminder: ${error?.code}`);
  return data.id;
}
