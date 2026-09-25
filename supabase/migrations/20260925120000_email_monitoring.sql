-- Durar · a run log for the daily email, and the numbers the morning health check reads.
-- The daily function records one row per date (its calls in the 07:00 window add up), and the
-- health check (/api/cron/health, about 08:15 Amsterdam) emails the owner if the row is missing
-- or shows a problem. Server-only, like the other email tables.

create table public.daily_runs (
  run_date     date        primary key,
  word_slug    text        not null,
  mode         text        not null,
  claimed      integer     not null default 0,
  sent         integer     not null default 0,
  failed       integer     not null default 0,
  -- Confirmed subscribers still waiting for today's email after the latest call.
  remaining    integer,
  invocations  integer     not null default 0,
  -- complete: nobody left and no failures · had_failures: some sends failed · incomplete: people
  -- still waiting · error: the latest call stopped with an error (last_error says why).
  status       text        not null check (status in ('complete', 'had_failures', 'incomplete', 'error')),
  last_error   text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz not null default now()
);

comment on table public.daily_runs is 'One summary row per day of the Pearl of the Day email (monitoring).';

alter table public.daily_runs enable row level security;
revoke all on table public.daily_runs from anon, authenticated;
grant select, insert, update, delete on table public.daily_runs to service_role;

-- Called at the end of every daily call inside the send window (and when a call fails).
create function public.daily_run_record(
  p_date date,
  p_slug text,
  p_mode text,
  p_claimed integer,
  p_sent integer,
  p_failed integer,
  p_remaining integer,
  p_error text default null
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_row public.daily_runs%rowtype;
begin
  insert into public.daily_runs as r (run_date, word_slug, mode, claimed, sent, failed, remaining, invocations, status, last_error)
  values (p_date, p_slug, p_mode, p_claimed, p_sent, p_failed, p_remaining, 1, 'incomplete', left(p_error, 500))
  on conflict (run_date) do update
     set word_slug   = excluded.word_slug,
         mode        = excluded.mode,
         claimed     = r.claimed + excluded.claimed,
         sent        = r.sent + excluded.sent,
         failed      = r.failed + excluded.failed,
         remaining   = coalesce(excluded.remaining, r.remaining),
         invocations = r.invocations + 1,
         last_error  = coalesce(excluded.last_error, r.last_error),
         finished_at = now()
  returning * into v_row;

  update public.daily_runs r
     set status = case
           when p_error is not null then 'error'
           when coalesce(v_row.remaining, 1) > 0 then 'incomplete'
           when v_row.failed > 0 then 'had_failures'
           else 'complete'
         end
   where r.run_date = p_date
  returning r.status into v_row.status;
  return v_row.status;
end;
$$;

-- What the health check needs for one day: the run row (or null) and today's send log by status.
-- 'reserved' rows are sends that were claimed but never marked: a call died mid-batch.
create function public.daily_health(p_date date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'run', (select to_jsonb(r) from public.daily_runs r where r.run_date = p_date),
    'sends', jsonb_build_object(
      'sent',     (select count(*) from public.daily_sends d where d.send_date = p_date and d.status = 'sent'),
      'failed',   (select count(*) from public.daily_sends d where d.send_date = p_date and d.status = 'failed'),
      'reserved', (select count(*) from public.daily_sends d where d.send_date = p_date and d.status = 'reserved')
    )
  );
$$;

-- Old run rows go with the send log (60 days).
create or replace function public.subscriptions_housekeeping()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pending integer;
  v_attempts integer;
  v_sends integer;
  v_runs integer;
begin
  delete from public.subscribers s where s.status = 'pending' and coalesce(s.confirm_sent_at, s.created_at) < now() - interval '7 days';
  get diagnostics v_pending = row_count;
  delete from public.subscribe_attempts a where a.at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;
  delete from public.daily_sends d where d.send_date < current_date - 60;
  get diagnostics v_sends = row_count;
  delete from public.daily_runs r where r.run_date < current_date - 60;
  get diagnostics v_runs = row_count;
  return jsonb_build_object('expired_pending', v_pending, 'old_attempts', v_attempts, 'old_sends', v_sends, 'old_runs', v_runs);
end;
$$;

revoke all on function
  public.daily_run_record(date, text, text, integer, integer, integer, integer, text),
  public.daily_health(date)
from public, anon, authenticated;

grant execute on function
  public.daily_run_record(date, text, text, integer, integer, integer, integer, text),
  public.daily_health(date)
to service_role;
