-- 0010_business_timezone.sql — Each business keeps its own time zone.
--
-- Until now "today" was the UTC calendar date, so a Florida client looking at
-- the portal at 8 pm local already saw tomorrow: a reminder due today read
-- "Due today" hours early, and an obligation due today could flip to a critical
-- "Past due" while the client still had the evening to file. Every date rule in
-- the portal (reminder status, tax alerts, next due date, Nick's context) is a
-- calendar comparison, so it needs the calendar the business actually keeps.
--
-- Firm-controlled, like currency and accounting basis: the client never sets it.

alter table public.business_entities
  add column timezone text not null default 'UTC';

comment on column public.business_entities.timezone is
  'IANA name (e.g. America/New_York). The calendar the business keeps; every "today" in the portal is resolved in it.';

-- A bad name would silently shift every due date, so it is rejected at write
-- time rather than trusted. `now() at time zone <name>` raises on an unknown
-- zone; the trigger only has to let that error through.
create or replace function public.assert_valid_timezone()
returns trigger
language plpgsql as $$
declare
  probe timestamp;
begin
  if new.timezone is null or btrim(new.timezone) = '' then
    raise exception 'business_entities.timezone must be an IANA time zone name';
  end if;
  probe := now() at time zone new.timezone;  -- raises on an unknown zone
  return new;
end;
$$;

create trigger business_entities_timezone_trg
  before insert or update of timezone on public.business_entities
  for each row execute function public.assert_valid_timezone();
