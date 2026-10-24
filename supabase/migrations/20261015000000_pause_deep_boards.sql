-- The Deep is parked behind VITE_DEEP_ENABLED (off by default), so its boards don't need rebuilding
-- every 15 minutes. Pause the pg_cron job; keep it, the tables and every chosen name as they are.
-- Joining, renaming, leaving, hiding and deleting an account still rebuild the boards at once, so a
-- removed name never lingers. To bring The Deep back: a new migration with active := true.
-- Hosted Supabase doesn't let postgres UPDATE cron.job, so this goes through cron.alter_job, and it is
-- safe to run again (an already paused job stays paused). A plain test database has no pg_cron.

do $$
declare
  v_job bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed: no board job to pause.';
    return;
  end if;
  select jobid into v_job from cron.job where jobname = 'durar-deep-boards';
  if v_job is null then
    raise notice 'No durar-deep-boards job found: nothing to pause.';
  else
    perform cron.alter_job(v_job, active := false);
  end if;
end;
$$;
