-- 0027_worker_dead_jobs.sql
-- A job that dies on its last attempt fails, and so does its document.
--
-- claim_processing_jobs() re-queued every stale `running` row as `pending`
-- without looking at its attempts, and then claimed only rows with
-- `attempts < max_attempts`. A worker killed by the platform on a job's third
-- attempt therefore left a `pending` row that nothing would ever claim again,
-- and its document said "processing" for good. The firm could not recover it
-- either: retryJob() only resets `failed` or `succeeded` rows.
--
-- Now a stale row with attempts left is re-queued as before, and one without is
-- marked `failed` (error_code `worker_timeout`) with its document, exactly as
-- the worker does when a last attempt throws (lib/ingestion/worker.ts). The
-- same statement settles rows already stranded by the old function, so the
-- first claim after this migration repairs production, and from then on the
-- Retry button reaches them.

create or replace function public.claim_processing_jobs(batch_size integer default 1)
returns setof public.document_processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  with dead as (
    update public.document_processing_jobs
       set status = 'failed', error_code = 'worker_timeout', locked_at = null, finished_at = now()
     where attempts >= max_attempts
       and ((status = 'running' and locked_at < now() - interval '10 minutes') or status = 'pending')
    returning document_version_id
  )
  update public.documents d
     set status = 'failed'
    from public.document_versions v
   where v.id in (select document_version_id from dead)
     and d.id = v.document_id
     and d.status not in ('published', 'failed');

  update public.document_processing_jobs
     set status = 'pending', locked_at = null
   where status = 'running' and locked_at < now() - interval '10 minutes';

  return query
    with picked as (
      select id
        from public.document_processing_jobs
       where status = 'pending' and run_after <= now() and attempts < max_attempts
       order by created_at
       for update skip locked
       limit greatest(batch_size, 1)
    )
    update public.document_processing_jobs j
       set status = 'running', locked_at = now(), attempts = j.attempts + 1
      from picked
     where j.id = picked.id
    returning j.*;
end;
$$;

revoke execute on function public.claim_processing_jobs(integer) from public, anon, authenticated, service_role;
grant  execute on function public.claim_processing_jobs(integer) to service_role;

-- The cron calls this every minute, and both sweeps above read `running` rows,
-- which the only queue index (pending rows) does not cover.
create index if not exists jobs_running_idx
  on public.document_processing_jobs (locked_at) where status = 'running';
