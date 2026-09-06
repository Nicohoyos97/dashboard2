-- 0024_sales_tax_jurisdictions.sql
-- Where a business is registered to collect sales tax.
--
-- `tax_jurisdictions` has existed since 0005 as the place an obligation belongs
-- to, and nothing has ever written a row to it: the extractor puts the taxing
-- authority a filing names into `tax_obligations.notes` as free text, so the
-- client's Sales Taxes page could only count what it had — a card that read
-- "Jurisdictions: 0". The firm knows the answer at the moment it sets a client
-- up, so from here it is asked there and stored here: Illinois, and the City of
-- Niles under it.
--
-- `tax_type` is the one column this needs. A row here is not a place, it is a
-- registration — this business, with this authority, for this tax — and
-- `filing_frequency` is only meaningful per tax: Illinois sales tax is filed
-- monthly and Illinois income tax annually, and both are "Illinois". Without
-- the column the two registrations would collide on the unique key.
alter table public.tax_jurisdictions
  add column tax_type text;

-- Every row that exists anywhere: the demo seed's federal row is income tax,
-- its state row is the sales one. Production has none.
update public.tax_jurisdictions
   set tax_type = case when level = 'federal' then 'income' else 'sales' end;

alter table public.tax_jurisdictions
  alter column tax_type set not null,
  add constraint tax_jurisdictions_tax_type_check
    check (tax_type in ('income', 'sales', 'payroll')),
  -- Each of these names is a pill in the client's portal. An empty one is a
  -- blank pill, which reads as a jurisdiction nobody can name.
  add constraint tax_jurisdictions_name_not_blank check (btrim(name) <> ''),
  -- The shape 0005 wrote in a comment and nothing enforced: 'US', 'US-IL',
  -- 'US-IL-CITY-OF-NILES'. Codes are derived from the chosen state and the
  -- typed city name, so this is what catches a builder that has stopped
  -- agreeing with itself before two cities silently become one row.
  add constraint tax_jurisdictions_code_shape check (
    case level
      when 'federal' then code = 'US'
      when 'state'   then code ~ '^US-[A-Z]{2}$'
      else                code ~ '^US-[A-Z]{2}-[A-Z0-9-]+$'
    end
  );

alter table public.tax_jurisdictions
  drop constraint tax_jurisdictions_business_entity_id_level_code_key,
  add constraint tax_jurisdictions_registration_key
    unique (business_entity_id, tax_type, level, code);

comment on column public.tax_jurisdictions.tax_type is
  'Which tax this registration is for. A business can be registered with one authority for more than one, on different filing frequencies.';
