-- Durar · Phase 0.7: monitoring and GDPR completeness
--   * ops_checks:  when background jobs (the nightly backup, the monthly restore test, the weekly
--                  digest) last ran, for the weekly digest. Numbers only, never secrets or paths.
--   * error_log:   API failures, without personal data, kept 30 days.
--   * health_ping, weekly_digest_stats: what /api/health and the weekly digest read.
--   * export_my_data: "Download my data" for a signed-in user (their own data only).
--   * Retention: the error log joins the daily housekeeping.
-- Hooks for The Deep (Phase 0.7 section F): deep_digest_stats() and deep_export_for() return null
-- until that migration replaces them, so the digest and the export pick it up without changes here.

-- ---------------------------------------------------------------------------------------------
-- Background job status

create table public.ops_checks (
  name        text        primary key check (name ~ '^[a-z_]{1,40}$'),
  last_ok     boolean     not null,
  last_run_at timestamptz not null default now(),
  last_ok_at  timestamptz,
  -- Small, non-sensitive numbers only (e.g. {"bytes": 123456, "tables": 12}).
  detail      jsonb       not null default '{}'::jsonb check (pg_column_size(detail) <= 2000)
);

comment on table public.ops_checks is 'Last run of each background job (backup, restore_test, weekly_digest), for monitoring.';

alter table public.ops_checks enable row level security;
revoke all on table public.ops_checks from anon, authenticated;
grant select, insert, update, delete on table public.ops_checks to service_role;

-- Called by the GitHub backup and restore workflows (as the database owner, over the pooler) and
-- by the weekly digest (service role). p_at: when the job ran, if not now (e.g. the nightly backup
-- copying the time of the latest monthly restore test from GitHub's records).
create function public.ops_report(p_name text, p_ok boolean, p_detail jsonb default '{}'::jsonb, p_at timestamptz default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ops_checks as c (name, last_ok, last_run_at, last_ok_at, detail)
  values (p_name, p_ok, coalesce(p_at, now()), case when p_ok then coalesce(p_at, now()) end, coalesce(p_detail, '{}'::jsonb))
  on conflict (name) do update
     set last_ok = excluded.last_ok,
         last_run_at = excluded.last_run_at,
         last_ok_at = greatest(excluded.last_ok_at, c.last_ok_at),
         detail = excluded.detail;
$$;

create function public.ops_status()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.name, jsonb_build_object(
           'last_ok', c.last_ok, 'last_run_at', c.last_run_at, 'last_ok_at', c.last_ok_at, 'detail', c.detail)), '{}'::jsonb)
    from public.ops_checks c;
$$;

-- ---------------------------------------------------------------------------------------------
-- Error log: which API function failed, and a scrubbed, short message. No emails, ids or IPs
-- (the server scrubs them before writing; see server/errors.ts). Deleted after 30 days.

create table public.error_log (
  id      bigint      generated always as identity primary key,
  at      timestamptz not null default now(),
  source  text        not null check (char_length(source) between 1 and 60),
  code    text        check (char_length(code) <= 60),
  message text        check (char_length(message) <= 300)
);

comment on table public.error_log is 'API failures without personal data (kept 30 days).';
create index error_log_at_idx on public.error_log (at);

alter table public.error_log enable row level security;
revoke all on table public.error_log from anon, authenticated;
grant select, insert, delete on table public.error_log to service_role;

create function public.error_log_record(p_source text, p_code text, p_message text)
returns void
language sql
set search_path = ''
as $$
  insert into public.error_log (source, code, message)
  values (left(p_source, 60), left(p_code, 60), left(p_message, 300));
$$;

-- ---------------------------------------------------------------------------------------------
-- /api/health: one round trip that proves the database answers with the service key.

create function public.health_ping()
returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;

-- ---------------------------------------------------------------------------------------------
-- The weekly digest: aggregate counts only, for [p_from, p_to) as Amsterdam calendar days.

-- The Deep's line (participants). Replaced by The Deep's migration; null means "not live yet".
create function public.deep_digest_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select null::jsonb;
$$;

create function public.weekly_digest_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := p_from::timestamp at time zone 'Europe/Amsterdam';
  t1 timestamptz := p_to::timestamp at time zone 'Europe/Amsterdam';
begin
  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'subscribers', jsonb_build_object(
      'total',        (select count(*) from public.subscribers s where s.status = 'confirmed'),
      'new',          (select count(*) from public.subscribers s where s.confirmed_at >= t0 and s.confirmed_at < t1),
      'unsubscribed', (select count(*) from public.subscribers s where s.status = 'unsubscribed' and s.unsubscribed_at >= t0 and s.unsubscribed_at < t1),
      'pending',      (select count(*) from public.subscribers s where s.status = 'pending')
    ),
    'emails', jsonb_build_object(
      'sent',       (select count(*) from public.daily_sends d where d.status = 'sent' and d.send_date >= p_from and d.send_date < p_to),
      'failed',     (select count(*) from public.daily_sends d where d.status = 'failed' and d.send_date >= p_from and d.send_date < p_to),
      'bounces',    (select count(*) from public.subscribers s where s.status = 'bounced' and s.updated_at >= t0 and s.updated_at < t1),
      'complaints', (select count(*) from public.subscribers s where s.status = 'complained' and s.updated_at >= t0 and s.updated_at < t1),
      'days_complete', (select count(*) from public.daily_runs r where r.status = 'complete' and r.run_date >= p_from and r.run_date < p_to),
      'days_with_problems', (select count(*) from public.daily_runs r where r.status <> 'complete' and r.run_date >= p_from and r.run_date < p_to)
    ),
    'accounts', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'new',   (select count(*) from auth.users u where u.created_at >= t0 and u.created_at < t1)
    ),
    'reviews', jsonb_build_object(
      -- Words whose latest review fell in the week, and how many people reviewed anything.
      'words',  (select count(*) from public.word_progress p where p.last_reviewed_at >= t0 and p.last_reviewed_at < t1),
      'people', (select count(distinct p.user_id) from public.word_progress p where p.last_reviewed_at >= t0 and p.last_reviewed_at < t1)
    ),
    'deep', public.deep_digest_stats(t0, t1),
    'errors', jsonb_build_object(
      'total', (select count(*) from public.error_log e where e.at >= t0 and e.at < t1),
      'by_source', (select coalesce(jsonb_object_agg(x.source, x.n), '{}'::jsonb)
                      from (select e.source, count(*) as n from public.error_log e
                             where e.at >= t0 and e.at < t1 group by e.source order by n desc limit 5) x)
    ),
    'ops', public.ops_status()
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Retention. Runs with the daily email (as before), now also clearing the error log after 30 days.
-- Send logs and run summaries: 60 days. Unconfirmed sign-ups: 7 days. Rate-limit IP hashes: 1 day.
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
  v_errors integer;
begin
  delete from public.subscribers s where s.status = 'pending' and coalesce(s.confirm_sent_at, s.created_at) < now() - interval '7 days';
  get diagnostics v_pending = row_count;
  delete from public.subscribe_attempts a where a.at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;
  delete from public.daily_sends d where d.send_date < current_date - 60;
  get diagnostics v_sends = row_count;
  delete from public.daily_runs r where r.run_date < current_date - 60;
  get diagnostics v_runs = row_count;
  delete from public.error_log e where e.at < now() - interval '30 days';
  get diagnostics v_errors = row_count;
  return jsonb_build_object('expired_pending', v_pending, 'old_attempts', v_attempts, 'old_sends', v_sends,
                            'old_runs', v_runs, 'old_errors', v_errors);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Download my data: everything Durar keeps about the caller, as one JSON document.

-- The Deep's entry for a user (display name, joined). Replaced by The Deep's migration.
create function public.deep_export_for(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select null::jsonb;
$$;

create function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_user auth.users%rowtype;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_user from auth.users u where u.id = uid;
  return jsonb_build_object(
    'account', jsonb_build_object(
      'email', v_user.email,
      'created_at', v_user.created_at,
      'sign_in_method', coalesce(v_user.raw_app_meta_data ->> 'provider', 'email'),
      'sea_topic', v_user.raw_user_meta_data -> 'sea_topic'
    ),
    'saved_pearls', (select coalesce(jsonb_agg(jsonb_build_object('word', p.word_slug, 'saved_at', p.created_at) order by p.created_at), '[]'::jsonb)
                       from public.saved_pearls p where p.user_id = uid),
    'progress', (select coalesce(jsonb_agg(jsonb_build_object(
                          'word', w.word_slug, 'box', w.box, 'due_at', w.due_at, 'last_reviewed_at', w.last_reviewed_at,
                          'times_seen', w.times_seen, 'lapses', w.lapses) order by w.word_slug), '[]'::jsonb)
                   from public.word_progress w where w.user_id = uid),
    'email_subscription', (select jsonb_build_object(
                                    'email', s.email, 'status', s.status, 'subscribed_at', s.created_at,
                                    'confirmed_at', s.confirmed_at, 'unsubscribed_at', s.unsubscribed_at)
                             from public.subscribers s
                            where s.user_id = uid or s.email = lower(v_user.email)
                            order by (s.user_id = uid) desc nulls last
                            limit 1),
    'the_deep', public.deep_export_for(uid)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may call what

revoke all on function
  public.ops_report(text, boolean, jsonb, timestamptz),
  public.ops_status(),
  public.error_log_record(text, text, text),
  public.health_ping(),
  public.deep_digest_stats(timestamptz, timestamptz),
  public.weekly_digest_stats(date, date),
  public.deep_export_for(uuid),
  public.export_my_data()
from public, anon, authenticated;

grant execute on function
  public.ops_report(text, boolean, jsonb, timestamptz),
  public.ops_status(),
  public.error_log_record(text, text, text),
  public.health_ping(),
  public.weekly_digest_stats(date, date)
to service_role;

grant execute on function public.export_my_data() to authenticated;
