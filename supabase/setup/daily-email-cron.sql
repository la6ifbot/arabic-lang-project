-- Durar · schedule the Pearl of the Day email (run once, by the owner, in Supabase → SQL Editor).
--
-- Why pg_cron: it's free on Supabase, runs to the minute, and handles the 07:00–08:00 Amsterdam
-- window in small batches. Vercel Hobby cron runs at most once a day, at an imprecise minute.
-- The job calls the site every 10 minutes from 05:00 to 06:59 UTC. That covers 07:00–07:59 in
-- Amsterdam in both summer (UTC+2) and winter (UTC+1); the function itself sends only in 07:xx
-- Amsterdam time, so the other calls return at once. Each daily run also touches the database,
-- which keeps a free Supabase project from pausing for inactivity.
--
-- Before running: Database → Extensions → enable “pg_cron” and “pg_net”.
-- Replace the two placeholders below. The secret must equal CRON_SECRET in Vercel.

select vault.create_secret('https://arabic-lang-project.vercel.app/api/cron/daily', 'durar_daily_url');
select vault.create_secret('REPLACE-WITH-THE-CRON_SECRET-VALUE', 'durar_cron_secret');

select cron.schedule(
  'durar-daily-email',
  '*/10 5-6 * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'durar_daily_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'durar_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it:      select * from cron.job;
-- Recent runs:   select * from cron.job_run_details order by start_time desc limit 20;
-- Responses:     select status_code, content from net._http_response order by created desc limit 20;
-- Change the URL on domain day:
--   select vault.update_secret((select id from vault.secrets where name = 'durar_daily_url'), 'https://<domain>/api/cron/daily');
-- Stop it:       select cron.unschedule('durar-daily-email');
