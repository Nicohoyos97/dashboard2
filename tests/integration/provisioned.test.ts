// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

import { isUnprovisioned } from '@/lib/auth/provisioned';

import { Fixtures, supabaseEnv } from '../e2e/helpers/fixtures';

// The lock /callback closes on a session nobody provisioned — the one that
// matters for Google, where a stranger arrives already authenticated. It reads
// memberships under the caller's own session, so these run against a real
// database with real RLS rather than a mock that would agree with anything.
const env = supabaseEnv();
const fx = new Fixtures();

const now = () => new Date().toISOString();

describe.skipIf(!env)('isUnprovisioned', () => {
  afterAll(() => fx.cleanup());

  it('turns away an account created seconds ago with nothing behind it', async () => {
    const user = await fx.makeUser('walkin');
    const client = await fx.signedInClient(user.email);
    expect(await isUnprovisioned(client, { id: user.id, created_at: now() })).toBe(true);
  });

  it('lets through a client the firm provisioned', async () => {
    const tenant = await fx.makeTenant('provisioned');
    expect(await isUnprovisioned(tenant.client, { id: tenant.userId, created_at: now() })).toBe(
      false,
    );
  });

  it('lets through a firm user, who is a member of no business', async () => {
    const firm = await fx.makeFirmUser('firm-provisioned');
    expect(await isUnprovisioned(firm.client, { id: firm.userId, created_at: now() })).toBe(false);
  });

  it('leaves an account that predates this sign-in alone', async () => {
    // A client between businesses keeps the pending Overview they are meant to
    // see, and a password reset never becomes a lockout.
    const user = await fx.makeUser('legacy');
    const client = await fx.signedInClient(user.email);
    expect(await isUnprovisioned(client, { id: user.id, created_at: '2020-01-01T00:00:00Z' })).toBe(
      false,
    );
  });

  it('judges nothing when there is no user', async () => {
    expect(await isUnprovisioned(fx.admin, null)).toBe(false);
  });
});
