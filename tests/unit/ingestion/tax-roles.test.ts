// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { filingStatus, taxDocumentRole } from '@/lib/ingestion/tax-roles';

describe('tax document roles', () => {
  it('takes the role from the type chosen at upload, not from what was read', () => {
    expect(taxDocumentRole('sales_tax_filing')).toBe('filing');
    expect(taxDocumentRole('sales_tax_payment')).toBe('payment');
    expect(taxDocumentRole('income_tax_document')).toBe('any');
  });

  it('never lets a return call itself paid', () => {
    // An ST-1 prints a Confirmation Number and a Date Submitted: submitted, not paid.
    expect(filingStatus('paid')).toBe('payable');
    expect(filingStatus('payable')).toBe('payable');
    expect(filingStatus('pending_review')).toBe('pending_review');
    expect(filingStatus('estimated')).toBe('estimated');
  });
});
