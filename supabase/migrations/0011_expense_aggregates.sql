-- 0011_expense_aggregates.sql — Server-side aggregation for the Expenses page.
--
-- The page was materialising every debit of the period (and of the prior one)
-- to compute totals it then paged 25 rows from, plus a third scan for the
-- vendor facet: for a busy entity that is tens of thousands of joined rows and
-- ~15 sequential PostgREST pages per view, repeated on every filter click.
-- Postgres can group; PostgREST cannot, so the aggregates move into a function.
--
-- SECURITY INVOKER on purpose: RLS still decides which rows the caller sees.
-- The explicit `bank_statements.status = 'published'` filter matters for a firm
-- preview, whose RLS branch can otherwise read drafts — the same reason the
-- TypeScript loaders carry it.

create or replace function public.portal_expense_summary(
  p_entity     uuid,
  p_currency   text,
  p_start      date,
  p_end        date,
  p_category   uuid    default null,
  p_vendor     text    default null,
  p_account    uuid    default null,
  p_recurring  boolean default null,
  p_search     text    default null,
  p_min        numeric default null,
  p_max        numeric default null,
  p_top        integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with rows as (
    select
      t.id,
      t.debit,
      t.category_id,
      t.vendor,
      t.is_recurring,
      to_char(t.txn_date, 'YYYY-MM') as month_key,
      c.name    as category_name,
      c.kind    as category_kind,
      c.is_fixed as category_is_fixed
    from bank_transactions t
      join bank_statements s on s.id = t.bank_statement_id
      join bank_accounts   a on a.id = t.bank_account_id
      left join expense_categories c on c.id = t.category_id
    where t.business_entity_id = p_entity
      and s.status = 'published'
      and a.currency = p_currency
      and t.debit is not null
      and t.debit > 0
      and t.txn_date between p_start and p_end
      and (p_category  is null or t.category_id     = p_category)
      and (p_vendor    is null or t.vendor          = p_vendor)
      and (p_account   is null or t.bank_account_id = p_account)
      and (p_recurring is null or t.is_recurring is not distinct from p_recurring)
      -- The caller escapes the pattern; `like` keeps % and _ literal unless it does not.
      and (p_search    is null or t.description ilike '%' || p_search || '%')
      and (p_min       is null or t.debit >= p_min)
      and (p_max       is null or t.debit <= p_max)
  )
  select jsonb_build_object(
    'total_cents',   coalesce((select round(sum(debit) * 100) from rows), 0),
    'count',         (select count(*) from rows),
    'uncategorized_cents', coalesce((select round(sum(debit) * 100) from rows where category_id is null), 0),
    'by_kind', coalesce((
      select jsonb_object_agg(kind, cents) from (
        select category_kind as kind, round(sum(debit) * 100) as cents
        from rows where category_kind is not null group by category_kind
      ) k
    ), '{}'::jsonb),
    -- Three-way splits: a flag the firm never set stays "unknown" rather than
    -- collapsing into "no", which would read as a decision nobody made.
    'recurring', jsonb_build_object(
      'yes',     coalesce((select round(sum(debit) * 100) from rows where is_recurring is true), 0),
      'no',      coalesce((select round(sum(debit) * 100) from rows where is_recurring is false), 0),
      'unknown', coalesce((select round(sum(debit) * 100) from rows where is_recurring is null), 0)
    ),
    'fixed', jsonb_build_object(
      'yes',     coalesce((select round(sum(debit) * 100) from rows where category_is_fixed is true), 0),
      'no',      coalesce((select round(sum(debit) * 100) from rows where category_is_fixed is false), 0),
      'unknown', coalesce((select round(sum(debit) * 100) from rows where category_is_fixed is null), 0)
    ),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'cents', cents, 'count', n) order by cents desc)
      from (
        select coalesce(category_id::text, '') as key, category_name as label,
               round(sum(debit) * 100) as cents, count(*) as n
        from rows group by category_id, category_name order by 3 desc limit p_top
      ) c
    ), '[]'::jsonb),
    'by_vendor', coalesce((
      select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'cents', cents, 'count', n) order by cents desc)
      from (
        select coalesce(vendor, '') as key, vendor as label,
               round(sum(debit) * 100) as cents, count(*) as n
        from rows group by vendor order by 3 desc limit p_top
      ) v
    ), '[]'::jsonb),
    -- Zero-filled across the whole range: the caller only ever asks for a period
    -- published statements fully cover, so a zero month is a month with no debits.
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'cents', cents) order by m)
      from (
        select to_char(g, 'YYYY-MM') as m,
               coalesce((select round(sum(debit) * 100) from rows where month_key = to_char(g, 'YYYY-MM')), 0) as cents
        from generate_series(date_trunc('month', p_start), date_trunc('month', p_end), interval '1 month') g
      ) months
    ), '[]'::jsonb)
  );
$$;

-- Distinct vendors for the filter facet, matching the rows the page can return.
create or replace function public.portal_expense_vendors(
  p_entity   uuid,
  p_currency text,
  p_start    date,
  p_end      date
)
returns table (vendor text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct t.vendor
  from bank_transactions t
    join bank_statements s on s.id = t.bank_statement_id
    join bank_accounts   a on a.id = t.bank_account_id
  where t.business_entity_id = p_entity
    and s.status = 'published'
    and a.currency = p_currency
    and t.vendor is not null
    and t.debit is not null
    and t.debit > 0
    and t.txn_date between p_start and p_end
  order by t.vendor;
$$;

revoke execute on function public.portal_expense_summary(uuid, text, date, date, uuid, text, uuid, boolean, text, numeric, numeric, integer) from public, anon;
revoke execute on function public.portal_expense_vendors(uuid, text, date, date) from public, anon;
grant  execute on function public.portal_expense_summary(uuid, text, date, date, uuid, text, uuid, boolean, text, numeric, numeric, integer) to authenticated, service_role;
grant  execute on function public.portal_expense_vendors(uuid, text, date, date) to authenticated, service_role;

-- The table query pages by date/amount within a period for one entity.
create index if not exists bank_transactions_entity_date_idx
  on public.bank_transactions (business_entity_id, txn_date desc, id);
