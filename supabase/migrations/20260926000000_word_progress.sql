-- Durar · Mastery (Phase 0.5)
-- One row per (user, word) the user has swiped: which of the five boxes it sits in and when it is
-- due back. The box rules themselves live in shared/mastery.ts (used by the site, the email sender
-- and the tests); the database only stores the result and keeps it safe.

create table public.word_progress (
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  word_slug        text        not null,
  box              smallint    not null check (box between 1 and 5),
  due_at           timestamptz not null,
  last_reviewed_at timestamptz not null,
  times_seen       integer     not null default 1 check (times_seen >= 0),
  lapses           integer     not null default 0 check (lapses >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, word_slug),
  constraint word_progress_slug_format check (word_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(word_slug) <= 64)
);

comment on table public.word_progress is 'Mastery: the box (1–5) and due time of each word a user has swiped.';

-- “What is due for this user?” (the site's queue and the email's revisit line).
create index word_progress_user_due_idx on public.word_progress (user_id, due_at);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: every signed-in user sees and changes only their own rows. Anon gets nothing.
alter table public.word_progress enable row level security;

create policy "Users read their own progress"
  on public.word_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own progress"
  on public.word_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own progress"
  on public.word_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users remove their own progress"
  on public.word_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.word_progress from anon, authenticated;
grant select, insert, update, delete on table public.word_progress to authenticated;
grant select, insert, update, delete on table public.word_progress to service_role;

-- ---------------------------------------------------------------------------------------------
-- Guard rail for a free-tier database: cap rows per user (the whole word list is far smaller).
-- Updating a word that is already there is always allowed, even at the cap.
create function public.word_progress_enforce_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.word_progress p where p.user_id = new.user_id and p.word_slug = new.word_slug)
     and (select count(*) from public.word_progress p where p.user_id = new.user_id) >= 5000 then
    raise exception 'progress limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger word_progress_limit
  before insert on public.word_progress
  for each row execute function public.word_progress_enforce_limit();

revoke all on function public.word_progress_enforce_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- save_progress: the one write path the site uses. Takes a batch of rows (JSON array) and upserts
-- them for the caller. For each word the row with the latest last_reviewed_at wins, so retries,
-- out-of-order batches and the sign-in merge of browser progress are all safe to repeat.
-- Runs as the caller (security invoker), so the policies above still apply.
create function public.save_progress(p_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'expected an array of at most 500 rows' using errcode = '22023';
  end if;
  with incoming as (
    select distinct on (r.word_slug)
           r.word_slug,
           r.box,
           r.due_at,
           -- A device with a clock far in the future must not freeze a word forever.
           least(r.last_reviewed_at, now() + interval '5 minutes') as last_reviewed_at,
           coalesce(r.times_seen, 1) as times_seen,
           coalesce(r.lapses, 0) as lapses
      from jsonb_to_recordset(p_rows) as r(word_slug text, box smallint, due_at timestamptz, last_reviewed_at timestamptz, times_seen integer, lapses integer)
     order by r.word_slug, r.last_reviewed_at desc
  )
  insert into public.word_progress as p (user_id, word_slug, box, due_at, last_reviewed_at, times_seen, lapses)
  select uid, i.word_slug, i.box, i.due_at, i.last_reviewed_at, i.times_seen, i.lapses from incoming i
  on conflict (user_id, word_slug) do update
     set box = excluded.box,
         due_at = excluded.due_at,
         last_reviewed_at = excluded.last_reviewed_at,
         times_seen = greatest(p.times_seen, excluded.times_seen),
         lapses = greatest(p.lapses, excluded.lapses),
         updated_at = now()
   where excluded.last_reviewed_at >= p.last_reviewed_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.save_progress(jsonb) from public, anon;
grant execute on function public.save_progress(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- “Reset my progress”: deletes only the caller's progress. Saved pearls are never touched.
create function public.reset_my_progress()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.word_progress p where p.user_id = uid;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.reset_my_progress() from public, anon;
grant execute on function public.reset_my_progress() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Email sender (service role only): the due words of subscribers who are linked to an account,
-- up to 20 per subscriber, oldest due first. The sender picks one (skipping retired words) with
-- the same rule the site uses.
create function public.revisit_candidates(p_subscriber_ids uuid[], p_now timestamptz default now())
returns table (subscriber_id uuid, word_slug text, box smallint, due_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select x.subscriber_id, x.word_slug, x.box, x.due_at
    from (
      select s.id as subscriber_id, p.word_slug, p.box, p.due_at,
             row_number() over (partition by s.id order by p.due_at, p.box, p.word_slug) as n
        from public.subscribers s
        join public.word_progress p on p.user_id = s.user_id
       where s.id = any (p_subscriber_ids)
         and s.user_id is not null
         and p.due_at <= p_now
    ) x
   where x.n <= 20
   order by x.subscriber_id, x.n;
$$;

revoke all on function public.revisit_candidates(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.revisit_candidates(uuid[], timestamptz) to service_role;
