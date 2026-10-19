// Persistence of a General Ledger export, inside the worker with the service
// role. No model is involved: the file is parsed and checked
// deterministically, and every row names its business_entity_id. Re-running a
// job clears the version's unpublished ledger first (clearDerived), so
// processing is idempotent.
import { randomUUID } from 'node:crypto';

import type { PersistContext, PersistSummary } from '@/lib/ingestion/persist';
import { WorkerError } from '@/lib/ingestion/persist';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/types';

import { parseGeneralLedger } from './parse';
import type { LedgerPeriod } from './period';
import { accountTotals, reconcileLedger } from './reconcile';

type Admin = ReturnType<typeof createAdminClient>;

const CHUNK = 500;
const money = (cents: number): number => cents / 100;

/** A CSV the firm uploaded without choosing a type, recognised by its title lines. */
export function looksLikeGeneralLedger(text: string): boolean {
  const head = text.replace(/^﻿/, '').split(/\r?\n/, 6);
  return head.some((line) => /^"?[^,]*general ledger/i.test(line.trim()));
}

export async function persistGeneralLedger(
  admin: Admin,
  ctx: PersistContext,
  text: string,
  documentPeriod: LedgerPeriod | null,
): Promise<PersistSummary> {
  const parsed = parseGeneralLedger(text);
  // The period the export prints wins; the one the firm typed on the document
  // is the fallback for a layout whose title line we do not read.
  const period = parsed.period ?? documentPeriod;
  if (!period) throw new WorkerError('ledger_no_period');
  const reconciliation = reconcileLedger(parsed, period);

  const { data: ledger, error } = await admin
    .from('general_ledgers')
    .insert({
      business_entity_id: ctx.entityId,
      period_start: period.start,
      period_end: period.end,
      basis: parsed.basis,
      currency: ctx.currency,
      company_name: parsed.company,
      document_version_id: ctx.versionId,
      // `processing` until every account and transaction is in: a row that
      // already read `reconciled` while a later chunk failed was a ledger with
      // part of its transactions that review and publish could both reach.
      status: 'processing',
      reconciliation: JSON.parse(JSON.stringify(reconciliation)) as Json,
    })
    .select('id')
    .single();
  if (error || !ledger) throw new WorkerError('persist_ledger');

  try {
    await insertRows(admin, ledger.id, ctx, parsed);
  } catch (insertError) {
    // Accounts and transactions cascade with the row; the retry starts clean.
    await admin.from('general_ledgers').delete().eq('id', ledger.id);
    throw insertError;
  }
  const { error: statusError } = await admin
    .from('general_ledgers')
    .update({ status: reconciliation.passed ? 'reconciled' : 'needs_review' })
    .eq('id', ledger.id);
  if (statusError) throw new WorkerError('persist_ledger');

  // What the export says fills in whatever the firm left blank at upload.
  const { data: doc } = await admin.from('documents').select('period_start, period_end').eq('id', ctx.documentId).maybeSingle();
  if (doc && (!doc.period_start || !doc.period_end)) {
    await admin.from('documents').update({ period_start: period.start, period_end: period.end }).eq('id', ctx.documentId);
  }

  return {
    results: 1,
    passed: reconciliation.passed,
    warnings: parsed.basis ? [] : ['ledger: no basis printed'],
  };
}

async function insertRows(admin: Admin, ledgerId: string, ctx: PersistContext, parsed: ReturnType<typeof parseGeneralLedger>): Promise<void> {
  const totals = accountTotals(parsed);
  const counts = parsed.accounts.map(() => 0);
  for (const tx of parsed.transactions) counts[tx.accountIndex] = (counts[tx.accountIndex] ?? 0) + 1;
  // Ids are minted here so a sub-account can name its parent in the same insert.
  const ids = parsed.accounts.map(() => randomUUID());
  const accountRows = parsed.accounts.map((account, index) => ({
    id: ids[index] ?? randomUUID(),
    ledger_id: ledgerId,
    business_entity_id: ctx.entityId,
    parent_id: account.parentIndex === null ? null : (ids[account.parentIndex] ?? null),
    name: account.name,
    depth: account.depth,
    position: index,
    printed_total: account.printedTotalCents === null ? null : money(account.printedTotalCents),
    total: money(totals[index] ?? 0),
    transaction_count: counts[index] ?? 0,
  }));
  // Parents precede their sub-accounts in file order, so every chunk's parent
  // rows already exist when its children arrive.
  for (let i = 0; i < accountRows.length; i += CHUNK) {
    const { error: accountError } = await admin.from('ledger_accounts').insert(accountRows.slice(i, i + CHUNK));
    if (accountError) throw new WorkerError('persist_ledger_accounts');
  }

  const txRows = parsed.transactions.map((tx, index) => ({
    ledger_id: ledgerId,
    account_id: ids[tx.accountIndex] ?? '',
    business_entity_id: ctx.entityId,
    txn_date: tx.date,
    txn_type: tx.type,
    num: tx.num,
    name: tx.name,
    description: tx.description,
    split: tx.split,
    amount: money(tx.amountCents),
    position: index,
  }));
  for (let i = 0; i < txRows.length; i += CHUNK) {
    const { error: txError } = await admin.from('ledger_transactions').insert(txRows.slice(i, i + CHUNK));
    if (txError) throw new WorkerError('persist_ledger_transactions');
  }
}
