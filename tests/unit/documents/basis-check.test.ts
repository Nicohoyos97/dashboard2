import { describe, expect, it } from 'vitest';

import { basisMismatch } from '@/lib/documents/basis-check';

describe('basisMismatch', () => {
  it('names the method of a document that is not on the business’s', () => {
    expect(basisMismatch('cash', ['accrual'])).toBe('accrual');
    expect(basisMismatch('accrual', [null, 'cash'])).toBe('cash');
  });

  it('says nothing when they agree, or when the document prints no method', () => {
    expect(basisMismatch('cash', ['cash'])).toBeNull();
    expect(basisMismatch('cash', [null])).toBeNull();
    expect(basisMismatch('cash', [])).toBeNull();
    expect(basisMismatch(null, ['accrual'])).toBeNull();
  });
});
