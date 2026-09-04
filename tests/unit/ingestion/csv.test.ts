// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  applyCsvMapping,
  dedupeKey,
  normalizeDescription,
  parseCsv,
  parseCsvDate,
  proposeCsvMapping,
} from '@/lib/ingestion/csv';
import { BankActivitySchema } from '@/lib/ingestion/schemas/bank-activity';
import { CsvMappingSchema } from '@/lib/ingestion/schemas/csv-mapping';

import {
  isRecord,
  messageJson,
  mockMessages,
  must,
  readExpected,
  readFixture,
  server,
  testClient,
} from './helpers/anthropic-mock';

const csvText = readFixture('transactions.csv').toString('utf8');
const mapping = CsvMappingSchema.parse(readExpected('transactions.mapping.json'));
const bank = BankActivitySchema.parse(readExpected('bank-statement.json'));

describe('parseCsv', () => {
  it('returns trimmed headers and one record per data row', () => {
    const table = parseCsv(csvText);
    expect(table.headers).toEqual(['Date', 'Description', 'Amount', 'Balance']);
    expect(table.rows).toHaveLength(12);
    expect(table.rows[0]).toEqual({
      Date: '06/02/2026',
      Description: 'Deposit - Client payment INV-1042',
      Amount: '8450.00',
      Balance: '49825.90',
    });
  });

  it.each([
    ['', 'empty input'],
    ['Date,Amount\n', 'a header row only'],
    ['Date,,Amount\n1,2,3\n', 'a blank header'],
    ['Date,Amount\n"unterminated,1\n', 'a broken quote'],
  ])('rejects %j (%s) with csv_unparseable', (text) => {
    expect(() => parseCsv(text)).toThrow(expect.objectContaining({ name: 'IngestionError', code: 'csv_unparseable' }));
  });
});

describe('parseCsvDate', () => {
  it.each([
    ['06/02/2026', 'MM/DD/YYYY', '2026-06-02'],
    ['2/6/2026', 'DD/MM/YYYY', '2026-06-02'],
    ['2026-06-02', 'YYYY-MM-DD', '2026-06-02'],
    ['06/02/26', 'MM/DD/YY', '2026-06-02'],
    ['02-06-2026', 'DD-MM-YYYY', '2026-06-02'],
    ['13/40/2026', 'MM/DD/YYYY', null],
    ['06/31/2026', 'MM/DD/YYYY', null],
    ['2026-06-02', 'MM/DD/YYYY', null],
    ['June 2, 2026', 'MM/DD/YYYY', null],
  ] as const)('parses %s as %s → %s', (raw, format, expected) => {
    expect(parseCsvDate(raw, format)).toBe(expected);
  });
});

describe('applyCsvMapping', () => {
  it('maps the fixture export onto exactly the bank statement transactions', () => {
    const { transactions, skipped } = applyCsvMapping(parseCsv(csvText).rows, mapping);
    expect(skipped).toEqual([]);
    expect(transactions).toHaveLength(12);
    transactions.forEach((transaction, index) => {
      const printed = must(bank.transactions[index]);
      expect(transaction).toEqual({
        row: index + 1,
        date: printed.date,
        description: printed.description,
        debit: printed.debit ?? null,
        credit: printed.credit ?? null,
        balance: printed.running_balance ?? null,
      });
    });
  });

  it('skips rows with unusable dates or amounts, reporting only the row number and a reason', () => {
    const rows = [
      { Date: 'nope', Description: 'a', Amount: '1.00', Balance: '' },
      { Date: '06/02/2026', Description: 'b', Amount: 'abc', Balance: '' },
      { Date: '06/02/2026', Description: 'c', Amount: '', Balance: '' },
      { Date: '06/02/2026', Description: 'd', Amount: '2.00', Balance: 'n/a' },
    ];
    const { transactions, skipped } = applyCsvMapping(rows, mapping);
    expect(skipped).toEqual([
      { row: 1, reason: 'invalid_date' },
      { row: 2, reason: 'invalid_amount' },
      { row: 3, reason: 'missing_amount' },
    ]);
    expect(transactions).toEqual([{ row: 4, date: '2026-06-02', description: 'd', debit: null, credit: '2.00', balance: null }]);
  });

  it('honours positive_is_debit', () => {
    const rows = [
      { Date: '06/02/2026', Description: 'charge', Amount: '100.00', Balance: '' },
      { Date: '06/03/2026', Description: 'payment', Amount: '-50.00', Balance: '' },
    ];
    const { transactions } = applyCsvMapping(rows, { ...mapping, sign_convention: 'positive_is_debit' });
    expect(transactions.map((t) => [t.debit, t.credit])).toEqual([['100.00', null], [null, '50.00']]);
  });

  it('handles separate debit and credit columns as unsigned magnitudes', () => {
    const twoColumn = CsvMappingSchema.parse({
      columns: { date: 'Date', description: 'Memo', debit: 'Debit', credit: 'Credit', amount: null, balance: null },
      date_format: 'YYYY-MM-DD',
      sign_convention: 'debit_credit',
    });
    const rows = [
      { Date: '2026-06-02', Memo: 'rent', Debit: '25.00', Credit: '' },
      { Date: '2026-06-03', Memo: 'refund', Debit: '', Credit: '(10.00)' },
      { Date: '2026-06-04', Memo: 'zero', Debit: '0.00', Credit: '0' },
    ];
    const { transactions, skipped } = applyCsvMapping(rows, twoColumn);
    expect(transactions.map((t) => [t.debit, t.credit, t.balance])).toEqual([
      ['25.00', null, null],
      [null, '10.00', null],
    ]);
    // A row that moves no money is skipped, not emitted. bank_transactions has
    // `check (debit is not null or credit is not null)`, so emitting it made the
    // chunked upsert throw and failed the whole import — one "BALANCE FORWARD,
    // 0.00" line anywhere in a 400-row export killed it with an opaque
    // persist_transactions code and no partial result.
    expect(skipped).toEqual([{ row: 3, reason: 'missing_amount' }]);
  });

  it('skips a zero row rather than failing the import', () => {
    const twoColumn = CsvMappingSchema.parse({
      columns: { date: 'Date', description: 'Memo', debit: 'Debit', credit: 'Credit', amount: null, balance: null },
      date_format: 'YYYY-MM-DD',
      sign_convention: 'debit_credit',
    });
    const rows = [
      { Date: '2026-06-01', Memo: 'BALANCE FORWARD', Debit: '0.00', Credit: '' },
      { Date: '2026-06-02', Memo: 'rent', Debit: '25.00', Credit: '' },
    ];
    const { transactions, skipped } = applyCsvMapping(rows, twoColumn);
    expect(transactions.map((t) => t.debit)).toEqual(['25.00']);
    expect(skipped).toEqual([{ row: 1, reason: 'missing_amount' }]);
    for (const transaction of transactions) {
      expect(transaction.debit !== null || transaction.credit !== null).toBe(true);
    }
  });
});

describe('dedupeKey', () => {
  const base = { date: '2026-06-18', amountCents: -38999, description: 'Card - Amazon supplies', account: 'acct-1' };

  it('is a stable sha256 hex digest', () => {
    expect(dedupeKey(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(dedupeKey(base)).toBe(dedupeKey({ ...base }));
  });

  it('normalises the description (case, whitespace, punctuation) and nothing else', () => {
    expect(dedupeKey({ ...base, description: '  CARD   amazon Supplies! ' })).toBe(dedupeKey(base));
    expect(dedupeKey({ ...base, amountCents: -38998 })).not.toBe(dedupeKey(base));
    expect(dedupeKey({ ...base, account: 'acct-2' })).not.toBe(dedupeKey(base));
    expect(dedupeKey({ ...base, date: '2026-06-19' })).not.toBe(dedupeKey(base));
  });

  it('normalizeDescription lower-cases, strips punctuation and collapses whitespace', () => {
    expect(normalizeDescription('  Card - Office  DEPOT! ')).toBe('card office depot');
    expect(normalizeDescription('Café Ñandú #12')).toBe('café ñandú 12');
  });
});

describe('proposeCsvMapping', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('asks the fast model with the headers and a bounded sample, then validates the answer', async () => {
    const captured = mockMessages([messageJson(mapping)]);
    const table = parseCsv(csvText);
    const sampleRows = Array.from({ length: 30 }, (_, i) => must(table.rows[i % table.rows.length]));
    const result = await proposeCsvMapping({ headers: table.headers, sampleRows, anthropic: testClient() });
    expect(result.mapping).toEqual(mapping);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40 });

    const body = must(captured[0]);
    expect(body.model).toBe('fast-test-model');
    expect(body.max_tokens).toBe(8000);
    const content = isRecord(body.messages) ? null : must(Array.isArray(body.messages) ? body.messages[0] : null);
    const text = isRecord(content) && Array.isArray(content.content) && isRecord(content.content[0]) ? String(content.content[0].text) : '';
    expect(text).toContain('<csv_headers>\n["Date","Description","Amount","Balance"]');
    const sample: unknown = JSON.parse(must(/<csv_sample_rows>\n([\s\S]*)\n<\/csv_sample_rows>/.exec(text)?.[1]));
    expect(Array.isArray(sample) ? sample.length : -1).toBe(20);
  });

  it('rejects a mapping that names a column the file does not have', async () => {
    mockMessages([messageJson({ ...mapping, columns: { ...mapping.columns, date: 'Posted' } })]);
    await expect(
      proposeCsvMapping({ headers: ['Date', 'Description', 'Amount', 'Balance'], sampleRows: [], anthropic: testClient() }),
    ).rejects.toMatchObject({ name: 'IngestionError', code: 'csv_mapping_invalid', detail: 'columns.date' });
  });
});
