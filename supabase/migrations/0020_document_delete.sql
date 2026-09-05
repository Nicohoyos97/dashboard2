-- 0020_document_delete.sql
-- Deleting an uploaded document from the firm portal.
--
-- Until now nothing could delete a document: `documents` had INSERT and UPDATE
-- policies for firm admins and no DELETE, and the `documents` bucket the same.
-- That was right for published financial history and wrong for the case it
-- also blocked — a failed upload session leaving four unpublishable files and
-- the half-processed rows behind them, with no way to clear them.
--
-- The rule this adds is not "an unpublished document may be deleted". That is
-- what it looks like from the document's own row, and it is not enough: a
-- document that was published once and then withdrawn goes back to
-- `reconciled`, while the tax obligations it stamped keep their `published_at`
-- and stay in the client's portal. Deleting that document would leave those
-- figures alive with `document_version_id` set to null by the foreign keys —
-- a number in a client's Sales Taxes page with no source behind it, which
-- INITIAL_PROMPT.md §3 forbids outright. So the invariant is about what
-- *derives* from the document:
--
--   a document may be deleted only when it is not published itself AND
--   nothing published derives from any of its versions.
--
-- The policy states the first half and the trigger the second, because a
-- policy cannot explain why it refused and this one has to.

-- ── the guard ────────────────────────────────────────────────────────────────
-- security definer so the count is the truth rather than whatever the caller's
-- policies let it see: a guard that under-counts is a guard that lets the
-- delete through.
create or replace function public.guard_document_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  published_rows integer;
begin
  select
    (select count(*) from public.financial_reports r
      join public.document_versions v on v.id = r.document_version_id
      where v.document_id = old.id and r.status = 'published')
  + (select count(*) from public.bank_statements b
      join public.document_versions v on v.id = b.document_version_id
      where v.document_id = old.id and b.status = 'published')
  + (select count(*) from public.tax_obligations t
      join public.document_versions v on v.id = t.document_version_id
      where v.document_id = old.id and t.published_at is not null)
  + (select count(*) from public.tax_payments p
      join public.document_versions v on v.id = p.document_version_id
      where v.document_id = old.id and p.published_at is not null)
  + (select count(*) from public.payroll_obligations p
      join public.document_versions v on v.id = p.document_version_id
      where v.document_id = old.id and p.published_at is not null)
  + (select count(*) from public.reminders m
      join public.document_versions v on v.id = m.document_version_id
      where v.document_id = old.id and m.published_at is not null)
  into published_rows;

  if published_rows > 0 then
    raise exception 'document has % published figure(s) derived from it', published_rows
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.guard_document_delete() from public, anon, authenticated, service_role;

create trigger documents_guard_delete
  before delete on public.documents
  for each row execute function public.guard_document_delete();

-- ── the policy ───────────────────────────────────────────────────────────────
-- Published documents are withdrawn, never deleted: the client has seen this
-- one, and the portal's own Report history points at it. Withdraw first, then
-- delete — two deliberate steps rather than one that cannot be taken back.
create policy "documents_admin_delete" on public.documents
  for delete to authenticated
  using (public.is_firm_admin() and published_at is null);

-- ── the bytes ────────────────────────────────────────────────────────────────
-- Without this the row goes and the PDF stays: billed, unreachable, and still
-- holding the client's financial data.
create policy "documents_admin_delete_object" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_firm_admin());
