// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { tenderLabel } from '@/lib/ingestion/schemas/sales-report';

// The extractor stores a tender exactly as the report prints it, which is how
// "DOORDASH" reaches the client's portal — right as a record of the document,
// wrong as the name of a company.
describe('tenderLabel', () => {
  it('spells known channels the way their owners do', () => {
    expect(tenderLabel('DOORDASH')).toBe('DoorDash');
    expect(tenderLabel('doordash')).toBe('DoorDash');
    expect(tenderLabel('Door Dash')).toBe('DoorDash');
    expect(tenderLabel('GRUBHUB')).toBe('Grubhub');
    expect(tenderLabel('UBER EATS')).toBe('Uber Eats');
    expect(tenderLabel('paypal')).toBe('PayPal');
  });

  it('title-cases a label the report shouted', () => {
    expect(tenderLabel('CREDIT AND DEBIT CARDS')).toBe('Credit and debit cards');
    expect(tenderLabel('CASH')).toBe('Cash');
  });

  it('keeps an acronym an acronym', () => {
    expect(tenderLabel('ACH TRANSFERS')).toBe('ACH transfers');
    expect(tenderLabel('EBT')).toBe('EBT');
  });

  it('leaves a label the document wrote in ordinary case alone', () => {
    // An unrecognised tender is a fact about the register, not ours to rewrite.
    expect(tenderLabel('Comida Rápida Delivery')).toBe('Comida Rápida Delivery');
    expect(tenderLabel('House account')).toBe('House account');
    expect(tenderLabel('  Cash on delivery  ')).toBe('Cash on delivery');
  });
});
