// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';

import { recordUsage } from '@/lib/ai/nick/persist';

import { Fixtures, supabaseEnv } from '../e2e/helpers/fixtures';

// Nick's daily budget is only a cap if every turn's tokens reach it. Turns that
// finish together used to read the counter, add in TypeScript and write the
// sum back, each over the other's; record_nick_usage (0033) adds in the
// UPDATE itself. Against local Supabase, with the service role the worker and
// the chat route use.
const env = supabaseEnv();

describe.skipIf(!env)('Nick usage accounting', () => {
  const fx = new Fixtures();
  afterAll(() => fx.cleanup());

  it('counts every turn when several finish at once', async () => {
    const tenant = await fx.makeTenant('nick-usage');
    const { data: session } = await fx.admin
      .from('chat_sessions')
      .insert({ business_entity_id: tenant.entityId, user_id: tenant.userId })
      .select('id')
      .single();
    const day = '2026-10-19';

    await Promise.all(
      Array.from({ length: 10 }, (_, turn) =>
        recordUsage(fx.admin, {
          entityId: tenant.entityId,
          sessionId: session!.id,
          day,
          usage: { input: 100, output: 10 },
          firstUserText: turn === 0 ? 'How much did I pay Meta in September?' : null,
        }),
      ),
    );

    const { data: daily } = await fx.admin
      .from('ai_usage_daily')
      .select('input_tokens, output_tokens, messages')
      .eq('business_entity_id', tenant.entityId)
      .eq('day', day)
      .single();
    expect(daily).toEqual({ input_tokens: 1000, output_tokens: 100, messages: 10 });

    const { data: totals } = await fx.admin
      .from('chat_sessions')
      .select('total_input_tokens, total_output_tokens, title, last_message_at')
      .eq('id', session!.id)
      .single();
    expect(totals).toMatchObject({ total_input_tokens: 1000, total_output_tokens: 100 });
    expect(totals?.title).toBeTruthy();
    expect(totals?.last_message_at).not.toBeNull();
  });

  it('cannot be called by a signed-in client', async () => {
    const tenant = await fx.makeTenant('nick-usage-client');
    const { error } = await tenant.client.rpc('record_nick_usage', {
      p_entity: tenant.entityId,
      p_session: tenant.entityId,
      p_day: '2026-10-19',
      p_input: 1,
      p_output: 1,
    });
    expect(error?.code).toBe('42501');
  });
});
