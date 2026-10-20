-- 0033_nick_usage_atomic.sql
-- Nick's token accounting in one statement per counter.
--
-- recordUsage read the day's counter, added the turn in TypeScript and wrote
-- the sum back, then did the same to the session's totals: four round trips,
-- and two turns finishing together (two tabs, two members of one business)
-- each wrote their own sum over the other's, so a turn's tokens could vanish
-- from the budget that is supposed to cap them. Here the addition happens in
-- the UPDATE itself, which Postgres serialises on the row.
--
-- Called by the service role only, with the business the session belongs to;
-- the session's update names both, so a mismatched pair changes nothing.

create or replace function public.record_nick_usage(
  p_entity uuid,
  p_session uuid,
  p_day date,
  p_input bigint,
  p_output bigint,
  p_title text default null
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.ai_usage_daily (business_entity_id, day, input_tokens, output_tokens, messages, updated_at)
  values (p_entity, p_day, p_input, p_output, 1, now())
  on conflict (business_entity_id, day) do update
    set input_tokens  = public.ai_usage_daily.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage_daily.output_tokens + excluded.output_tokens,
        messages      = public.ai_usage_daily.messages + 1,
        updated_at    = now();

  update public.chat_sessions
     set total_input_tokens  = total_input_tokens + p_input,
         total_output_tokens = total_output_tokens + p_output,
         last_message_at     = now(),
         title               = coalesce(title, p_title)
   where id = p_session and business_entity_id = p_entity;
$$;

revoke execute on function public.record_nick_usage(uuid, uuid, date, bigint, bigint, text) from public, anon, authenticated;
grant  execute on function public.record_nick_usage(uuid, uuid, date, bigint, bigint, text) to service_role;
