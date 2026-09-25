-- Durar · the morning health check (run once, by the owner, in Supabase → SQL Editor).
--
-- Needs: the email monitoring migration (supabase/migrations/20260925120000_email_monitoring.sql)
-- and the daily job from daily-email-cron.sql, whose two vault secrets it reuses. Nothing to replace.
--
-- It calls /api/cron/health at 06:15 and 07:15 UTC. One of those is 08:15 in Amsterdam (summer or
-- winter); only that call checks today's run, and it emails the owner if the run is missing or had
-- problems. The other call returns at once.

select cron.schedule(
  'durar-email-health',
  '15 6,7 * * *',
  $$
  select net.http_get(
    url := replace(
      (select decrypted_secret from vault.decrypted_secrets where name = 'durar_daily_url'),
      '/api/cron/daily', '/api/cron/health'
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'durar_cron_secret')
    ),
    timeout_milliseconds := 15000
  );
  $$
);

-- Check it:      select jobname, schedule, active from cron.job;
-- Today's run:   select * from public.daily_runs order by run_date desc limit 7;
-- Stop it:       select cron.unschedule('durar-email-health');
