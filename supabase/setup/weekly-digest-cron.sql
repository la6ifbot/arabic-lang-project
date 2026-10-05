-- Durar · the weekly digest (run once, by the owner, in Supabase → SQL Editor).
--
-- Needs: the monitoring migration (supabase/migrations/20261006000000_monitoring_gdpr.sql) and the
-- daily job from daily-email-cron.sql, whose two vault secrets it reuses. Nothing to replace.
--
-- It calls /api/cron/weekly on Mondays at 06:00 and 07:00 UTC. One of those is 08:00 in Amsterdam
-- (summer or winter); only that call sends the digest, to ALERT_EMAIL (else EMAIL_SANDBOX_TO).
-- A second job deletes pg_cron's own run history after 30 days, so it doesn't grow forever.

select cron.schedule(
  'durar-weekly-digest',
  '0 6,7 * * 1',
  $$
  select net.http_get(
    url := replace(
      (select decrypted_secret from vault.decrypted_secrets where name = 'durar_daily_url'),
      '/api/cron/daily', '/api/cron/weekly'
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'durar_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'durar-cron-history-cleanup',
  '30 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '30 days' $$
);

-- Check it:      select jobname, schedule, active from cron.job;
-- Last digests:  select * from public.ops_checks;
-- Stop it:       select cron.unschedule('durar-weekly-digest');
