import { describe, expect, it } from 'vitest';

import { base32Decode, totp } from '../e2e/helpers/totp';

// RFC 6238 Appendix B test vectors (HMAC-SHA1, 30 s step). The 6-digit code is
// the last six digits of the RFC's 8-digit value. The e2e MFA flow relies on
// this helper, so it must match a real authenticator app exactly.
const SECRET_ASCII = '12345678901234567890';
const SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('decodes base32', () => {
    expect(base32Decode(SECRET_B32).toString('ascii')).toBe(SECRET_ASCII);
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches RFC 6238 at t=%i', (seconds, code) => {
    expect(totp(SECRET_B32, seconds * 1000)).toBe(code);
  });
});
