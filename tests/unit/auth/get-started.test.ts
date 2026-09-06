import { describe, expect, it } from 'vitest';

import { getStartedUrl } from '@/lib/auth/get-started';

describe('getStartedUrl', () => {
  it('sends a reader to the plans in their own language', () => {
    expect(getStartedUrl('en')).toBe('https://hoyosbaker.com/get-started/bookkeeping?start=plans');
    expect(getStartedUrl('es')).toBe(
      'https://hoyosbaker.com/es/get-started/bookkeeping?start=plans',
    );
  });

  it('leaves an unknown locale on the English page rather than inventing a path', () => {
    expect(getStartedUrl('fr')).toBe('https://hoyosbaker.com/get-started/bookkeeping?start=plans');
  });

  it('names the screen that leads to checkout', () => {
    // Without `start=plans` the page opens on its two-way chooser, and the
    // client we just told to buy a plan lands one click short of the cards.
    for (const locale of ['en', 'es']) {
      expect(getStartedUrl(locale)).toContain('?start=plans');
    }
  });
});
