-- 0012_expense_search_escape.sql — `portal_expense_summary` escaped nothing.
--
-- 0011 built the search pattern as '%' || p_search || '%' and left escaping to
-- the caller. tests/e2e/expense-aggregates.spec.ts calls the function directly
-- and showed what that means: a search for `row %` matched every row instead of
-- none. A function that is safe only when called correctly is not safe, and
-- PostgREST exposes it to any authenticated session — so it escapes its own
-- input now, and the TypeScript caller passes the text through untouched.
--
-- (The PostgREST `.ilike()` path in lib/portal/expenses.ts keeps its own
-- escaping: that layer has extra syntax of its own, including `*` for `%`.)

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
  with needle as (
    -- LIKE's own metacharacters, with backslash as the escape character.
    select case
      when p_search is null then null
      else '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as pattern
  ),
  rows as (
    select
      t.id,
      t.debit,
      t.category_id,
      t.vendor,
      t.is_recurring,
      to_char(t.txn_date, 'YYYY-MM') as month_key,
      c.name     as category_name,
      c.kind     as category_kind,
      c.is_fixed as category_is_fixed
    from bank_transactions t
      join bank_statements s on s.id = t.bank_statement_id
      join bank_accounts   a on a.id = t.bank_account_id
      left join expense_categories c on c.id = t.category_id
      cross join needle n
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
      and (n.pattern   is null or t.description ilike n.pattern)
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
