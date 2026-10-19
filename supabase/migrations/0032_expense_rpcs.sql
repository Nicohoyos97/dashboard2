-- 0032_expense_rpcs.sql
-- The two Expenses RPCs return exactly what 0011/0012 returned, planned for
-- the values they are called with, and the summary from five passes over the
-- period's rows instead of eighteen.
--
-- Planning. A LANGUAGE sql function that is not inlined (these pin
-- search_path, so they never are) plans its body with the arguments as
-- unknown parameters. For the summary that generic plan was nested loops that
-- read bank_accounts once per transaction: 64 ms on a busy half year, where
-- the same query planned with its values takes 14 ms, plus 0.4 ms to plan.
-- PL/pgSQL with plan_cache_mode = force_custom_plan plans each call with its
-- values.
--
-- Passes. The `rows` CTE was materialised once and then read once per figure:
-- the total, the count and the uncategorised share each on their own, three
-- passes for recurring, three for fixed, and one per month of the period for
-- the chart, each month a correlated subquery. The scalar figures now come
-- from one aggregate with FILTER, and the months from one GROUP BY joined to
-- the calendar, so a month with no spending still reads 0.

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
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  result jsonb;
begin
  with needle as (
    -- LIKE's own metacharacters, with backslash as the escape character.
    select case
      when p_search is null then null
      else '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as pattern
  ),
  rows as materialized (
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
  ),
  totals as (
    select
      round(sum(debit) * 100)                                                as total,
      count(*)                                                               as n,
      round(sum(debit) filter (where category_id is null) * 100)             as uncategorized,
      round(sum(debit) filter (where is_recurring is true) * 100)            as recurring_yes,
      round(sum(debit) filter (where is_recurring is false) * 100)           as recurring_no,
      round(sum(debit) filter (where is_recurring is null) * 100)            as recurring_unknown,
      round(sum(debit) filter (where category_is_fixed is true) * 100)       as fixed_yes,
      round(sum(debit) filter (where category_is_fixed is false) * 100)      as fixed_no,
      round(sum(debit) filter (where category_is_fixed is null) * 100)       as fixed_unknown
    from rows
  )
  select jsonb_build_object(
    'total_cents',   coalesce(t.total, 0),
    'count',         t.n,
    'uncategorized_cents', coalesce(t.uncategorized, 0),
    'by_kind', coalesce((
      select jsonb_object_agg(kind, cents) from (
        select category_kind as kind, round(sum(debit) * 100) as cents
        from rows where category_kind is not null group by category_kind
      ) k
    ), '{}'::jsonb),
    'recurring', jsonb_build_object(
      'yes',     coalesce(t.recurring_yes, 0),
      'no',      coalesce(t.recurring_no, 0),
      'unknown', coalesce(t.recurring_unknown, 0)
    ),
    'fixed', jsonb_build_object(
      'yes',     coalesce(t.fixed_yes, 0),
      'no',      coalesce(t.fixed_no, 0),
      'unknown', coalesce(t.fixed_unknown, 0)
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
      select jsonb_agg(jsonb_build_object('month', to_char(g, 'YYYY-MM'), 'cents', coalesce(b.cents, 0)) order by g)
      from generate_series(date_trunc('month', p_start), date_trunc('month', p_end), interval '1 month') g
      left join (
        select month_key, round(sum(debit) * 100) as cents from rows group by month_key
      ) b on b.month_key = to_char(g, 'YYYY-MM')
    ), '[]'::jsonb)
  )
  into result
  from totals t;
  return result;
end;
$$;

create or replace function public.portal_expense_vendors(
  p_entity   uuid,
  p_currency text,
  p_start    date,
  p_end      date
)
returns table (vendor text)
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
begin
  return query
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
end;
$$;
