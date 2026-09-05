-- 0019_client_onboarding.sql
-- Setting a client up in one step: what they bought, and in what language.
--
-- 1. enabled_modules collapses `statements` + `expenses` into one `bookkeeping`
--    key. The firm sells bookkeeping as one engagement — a client who gets the
--    Profit & Loss also gets the expense breakdown that explains it — so two
--    switches only ever produced a combination nobody sells. Backfilled from
--    `statements`, because that is the switch that decided whether the client
--    saw the books at all; the two old keys are dropped so nothing can read a
--    stale one and disagree with the nav.
--
-- 2. profiles.locale — the client's own language. The firm picks it when it
--    invites them (carried through auth metadata below, so the very first
--    page they see is already right) and the client can change it in their
--    profile afterwards. Null means "never chosen": the URL decides, which is
--    what every existing account gets.
alter table public.business_entities
  alter column enabled_modules
  set default '{"bookkeeping": true, "income_taxes": true}'::jsonb;

update public.business_entities
   set enabled_modules =
         (enabled_modules - 'statements' - 'expenses')
         || jsonb_build_object('bookkeeping', coalesce(enabled_modules -> 'statements', 'true'::jsonb))
 where enabled_modules ?| array['statements', 'expenses'];

-- ── the client's language ────────────────────────────────────────────────────
alter table public.profiles
  add column locale text check (locale in ('en', 'es'));

comment on column public.profiles.locale is
  'Portal language. Null = never chosen, so the URL decides. Set by the firm on invite, changed by the client in Settings → Profile.';

-- Rewritten rather than altered: a plpgsql body cannot be patched in place.
-- `locale` joins full_name and avatar_url as metadata the inviter supplies —
-- an invited client lands on a portal already in their language instead of
-- reading one English screen before they can change it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, locale)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    nullif(new.raw_user_meta_data ->> 'locale', '')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
