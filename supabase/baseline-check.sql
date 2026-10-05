-- Durar · Read-only check: which of the migrations applied by hand production really has
-- Changes nothing. The first production run of the Migrations workflow (scripts/db/migrate.sh
-- --baseline) runs it, records every migration marked ok as already applied, and lets the workflow
-- apply the rest. It stops, changing nothing, if a line says MISSING (applied before this phase, so
-- production must have it) or PARTIAL (some of a hand-run migration's parts are missing).
-- Phase 0.7's monitoring migration may have been run by hand or not: "not applied" is fine.
with fn as (
  select p.proname, pg_get_functiondef(p.oid) as body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
trg as (
  select t.tgname from pg_trigger t where not t.tgisinternal
),
known(name) as (
  values ('saved_pearls'), ('subscribers'), ('daily_sends'), ('subscribe_attempts'), ('daily_runs'), ('word_progress'),
         ('ops_checks'), ('error_log')
),
-- Phase 0.7 monitoring (20261006000000): how many of its parts are there, out of 7.
monitoring(present) as (
  select (to_regclass('public.ops_checks') is not null)::int + (to_regclass('public.error_log') is not null)::int
       + (select count(distinct proname)::int from fn
           where proname in ('ops_report', 'health_ping', 'weekly_digest_stats', 'export_my_data'))
       + (select count(*)::int from fn where proname = 'subscriptions_housekeeping' and body like '%error_log%')
),
checks(n, item, ok) as (
  values
    (1, '20260924000000 saved_pearls',
     to_regclass('public.saved_pearls') is not null and exists (select 1 from trg where tgname = 'saved_pearls_limit')),
    (2, '20260925000000 pearl_of_the_day',
     to_regclass('public.subscribers') is not null and to_regclass('public.daily_sends') is not null
       and to_regclass('public.subscribe_attempts') is not null
       and exists (select 1 from fn where proname = 'subscription_request')),
    (3, '20260925120000 email_monitoring',
     to_regclass('public.daily_runs') is not null and exists (select 1 from fn where proname = 'daily_health')
       and exists (select 1 from fn where proname = 'subscriptions_housekeeping' and body like '%daily_runs%')),
    (4, '20260926000000 word_progress',
     to_regclass('public.word_progress') is not null and exists (select 1 from fn where proname = 'save_progress')
       and exists (select 1 from fn where proname = 'revisit_candidates')),
    (5, '20261003000000 account_daily_email',
     exists (select 1 from trg where tgname = 'subscribe_confirmed_account')
       and exists (select 1 from trg where tgname = 'subscribe_confirmed_account_on_insert'))
)
select item as "check", case when ok then 'ok' else 'MISSING' end as result from checks
union all
select '20261006000000 monitoring_gdpr',
       case present when 7 then 'ok' when 0 then 'not applied (the workflow applies it)' else 'PARTIAL' end
  from monitoring
union all
select 'migration history table',
       case when to_regclass('supabase_migrations.schema_migrations') is null then 'none yet (expected)'
            else 'exists already' end
union all
select 'other tables in public',
       coalesce((select string_agg(c.relname, ', ' order by c.relname)
                   from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind in ('r', 'p')
                    and c.relname not in (select name from known)), 'none')
union all
select 'postgres version', current_setting('server_version');
-- END OF PART 1 OF 1
