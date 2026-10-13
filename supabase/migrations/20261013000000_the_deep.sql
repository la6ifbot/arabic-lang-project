-- Durar · Phase 0.7: The Deep (an opt-in leaderboard), and progress rules that run on the server.
--   * record_review / record_reviews: the only way a swipe changes a box. A known word moves deeper
--     only when it's due; a left swipe resets it to box 1. Signed-in users can no longer insert or
--     update word_progress themselves.
--   * Verified progress: verified_box is the depth the server itself has seen earned. A merged
--     browser copy (save_progress) starts at 0 and climbs from its next real review, on the server's
--     own clock, so a box typed into the browser never reaches the board.
--   * deep_scores: per-user depth (sum of verified boxes), pearls (verified box 2+) and this week's
--     net gain, kept up to date by a trigger. Private.
--   * deep_members: who joined, under which name. Private; only deep_* functions touch it.
--   * deep_board / deep_board_info: the public boards (name, score, rank only), rebuilt by pg_cron
--     every 15 minutes and at once when someone joins, renames or leaves.
--   * Hooks from 20261006000000_monitoring_gdpr: deep_digest_stats, deep_export_for; and
--     delete_my_account now removes the member's row and refreshes the boards.

-- ---------------------------------------------------------------------------------------------
-- Box schedule (the same as shared/mastery.ts BOX_DAYS: 1, 3, 7, 16 and 35 days)

create function public.box_interval(p_box smallint)
returns interval
language sql
immutable
set search_path = ''
as $$
  select (array[1, 3, 7, 16, 35])[p_box] * interval '1 day';
$$;

-- Monday 00:00 in Amsterdam, as a date: the start of "This week".
create function public.deep_week_start(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', p_at at time zone 'Europe/Amsterdam')::date;
$$;

-- ---------------------------------------------------------------------------------------------
-- Verified progress

alter table public.word_progress
  add column verified_box smallint not null default 0 check (verified_box between 0 and 5),
  add column verified_at  timestamptz;

comment on column public.word_progress.verified_box is
  'The box the server has seen earned (0 = not yet). Only this counts on The Deep.';

-- The browser can no longer write boxes: reviews go through record_review(), a sign-in merge
-- through save_progress(), and reset through reset_my_progress().
drop policy "Users add their own progress" on public.word_progress;
drop policy "Users update their own progress" on public.word_progress;
revoke insert, update on table public.word_progress from authenticated;

-- The sign-in merge. As before, for each word the latest review wins, so the person's progress
-- keeps working. New words arrive unverified, and a merge never raises a verified box.
create or replace function public.save_progress(p_rows jsonb)
returns integer
language plpgsql
security definer
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
         verified_box = least(p.verified_box, excluded.box),
         updated_at = now()
   where excluded.last_reviewed_at >= p.last_reviewed_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.save_progress(jsonb) from public, anon;
grant execute on function public.save_progress(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rate limit for reviews: 120 a minute and 3,000 a day per person (a person swipes far slower).

create table public.review_rate (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  minute_start timestamptz not null,
  minute_n     integer     not null,
  day_start    date        not null,
  day_n        integer     not null
);

comment on table public.review_rate is 'Per-user review counters for record_review''s rate limit.';
alter table public.review_rate enable row level security;
revoke all on table public.review_rate from anon, authenticated;

create function public.review_rate_take(p_user uuid, p_n integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  m timestamptz := date_trunc('minute', now());
  d date := (now() at time zone 'utc')::date;
  r public.review_rate%rowtype;
begin
  insert into public.review_rate as x (user_id, minute_start, minute_n, day_start, day_n)
  values (p_user, m, p_n, d, p_n)
  on conflict (user_id) do update
     set minute_n = case when x.minute_start = m then x.minute_n + p_n else p_n end,
         minute_start = m,
         day_n = case when x.day_start = d then x.day_n + p_n else p_n end,
         day_start = d
  returning * into r;
  if r.minute_n > 120 or r.day_n > 3000 then
    raise exception 'too many reviews' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.review_rate_take(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- record_review: one swipe by the signed-in user, judged by the server's clock.
--   known:    a new word goes to box 2. A due word moves one box deeper (box 5 is the floor of the
--             sea). A word that isn't due yet stays where it is ("moved": false).
--   learning: back to box 1, due tomorrow; a word seen before counts a lapse.
-- Returns the word's row as the server now has it.

create function public.apply_review(p_user uuid, p_slug text, p_dir text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  t timestamptz := now();
  p public.word_progress%rowtype;
  v_box smallint;
  v_vbox smallint;
  v_vat timestamptz;
  moved boolean := true;
begin
  if p_dir is null or p_dir not in ('known', 'learning') then
    raise exception 'direction must be known or learning' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 64 then
    raise exception 'not a word' using errcode = '22023';
  end if;

  select * into p from public.word_progress w where w.user_id = p_user and w.word_slug = p_slug for update;

  if not found then
    v_box := case when p_dir = 'known' then 2 else 1 end;
    insert into public.word_progress (user_id, word_slug, box, due_at, last_reviewed_at, times_seen, lapses, verified_box, verified_at)
    values (p_user, p_slug, v_box, t + public.box_interval(v_box), t, 1, 0, v_box, t)
    returning * into p;
  elsif p_dir = 'known' and p.due_at > t then
    moved := false;
  elsif p_dir = 'known' then
    v_box := least(p.box + 1, 5);
    -- The verified ladder climbs on the server's own clock: from a merged (unverified) copy it
    -- starts again at box 2; otherwise one box, once that box's time has passed.
    if p.verified_box = 0 then
      v_vbox := 2;
      v_vat := t;
    elsif p.verified_at is null or p.verified_at + public.box_interval(p.verified_box) <= t then
      v_vbox := least(p.verified_box + 1, 5);
      v_vat := t;
    else
      v_vbox := p.verified_box;
      v_vat := p.verified_at;
    end if;
    update public.word_progress w
       set box = v_box, due_at = t + public.box_interval(v_box), last_reviewed_at = t,
           times_seen = w.times_seen + 1, verified_box = v_vbox, verified_at = v_vat, updated_at = t
     where w.user_id = p_user and w.word_slug = p_slug
    returning * into p;
  else
    update public.word_progress w
       set box = 1, due_at = t + public.box_interval(1::smallint), last_reviewed_at = t,
           times_seen = w.times_seen + 1, lapses = w.lapses + 1, verified_box = 1, verified_at = t, updated_at = t
     where w.user_id = p_user and w.word_slug = p_slug
    returning * into p;
  end if;

  return jsonb_build_object(
    'word_slug', p.word_slug, 'box', p.box, 'due_at', p.due_at, 'last_reviewed_at', p.last_reviewed_at,
    'times_seen', p.times_seen, 'lapses', p.lapses, 'moved', moved);
end;
$$;

revoke all on function public.apply_review(uuid, text, text) from public, anon, authenticated;

create function public.record_review(p_slug text, p_dir text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform public.review_rate_take(uid, 1);
  return public.apply_review(uid, p_slug, p_dir);
end;
$$;

-- Several swipes at once, in order (the site's quiet, batched saving): [{"slug": …, "dir": …}, …].
create function public.record_reviews(p_reviews jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  out jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_reviews) <> 'array' or jsonb_array_length(p_reviews) > 100 then
    raise exception 'expected an array of at most 100 reviews' using errcode = '22023';
  end if;
  perform public.review_rate_take(uid, jsonb_array_length(p_reviews));
  for r in select value from jsonb_array_elements(p_reviews) loop
    out := out || jsonb_build_array(public.apply_review(uid, r ->> 'slug', r ->> 'dir'));
  end loop;
  return out;
end;
$$;

revoke all on function public.record_review(text, text), public.record_reviews(jsonb) from public, anon;
grant execute on function public.record_review(text, text), public.record_reviews(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Scores: kept current by a trigger on word_progress, so every path (reviews, merges, reset,
-- deletion) is counted. depth_at / week_at: when that score last changed (the tie-break).

create table public.deep_scores (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  depth      integer     not null default 0,
  pearls     integer     not null default 0,
  depth_at   timestamptz not null default now(),
  week_start date        not null,
  week_gain  integer     not null default 0,
  week_at    timestamptz not null default now()
);

comment on table public.deep_scores is 'Verified depth per user (The Deep). Private: the boards copy only names and scores.';
alter table public.deep_scores enable row level security;
revoke all on table public.deep_scores from anon, authenticated;

create function public.deep_scores_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
  d integer := coalesce(new.verified_box, 0) - coalesce(old.verified_box, 0);
  pz integer := (coalesce(new.verified_box, 0) >= 2)::integer - (coalesce(old.verified_box, 0) >= 2)::integer;
  wk date := public.deep_week_start(now());
begin
  if d = 0 and pz = 0 then
    return null;
  end if;
  if tg_op = 'DELETE' then
    -- Only update: during an account deletion the scores row may already be gone.
    update public.deep_scores s
       set depth = s.depth + d, pearls = s.pearls + pz,
           depth_at = case when d <> 0 then now() else s.depth_at end,
           week_gain = case when s.week_start = wk then s.week_gain + d else d end,
           week_at = case when d <> 0 then now() else s.week_at end,
           week_start = wk
     where s.user_id = uid;
  else
    insert into public.deep_scores as s (user_id, depth, pearls, depth_at, week_start, week_gain, week_at)
    values (uid, d, pz, now(), wk, d, now())
    on conflict (user_id) do update
       set depth = s.depth + d, pearls = s.pearls + pz,
           depth_at = case when d <> 0 then now() else s.depth_at end,
           week_gain = case when s.week_start = wk then s.week_gain + d else d end,
           week_at = case when d <> 0 then now() else s.week_at end,
           week_start = wk;
  end if;
  return null;
end;
$$;

revoke all on function public.deep_scores_track() from public, anon, authenticated;

create trigger word_progress_deep_scores
  after insert or update of verified_box or delete on public.word_progress
  for each row execute function public.deep_scores_track();

-- ---------------------------------------------------------------------------------------------
-- Names: shape rules (also in shared/deepName.ts), a folded key for uniqueness, reserved names
-- and a list of words not allowed in either language.

-- Trimmed, NFC, single spaces.
create function public.deep_name_clean(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(normalize(btrim(p_name), NFC), '\s+', ' ', 'g');
$$;

-- Case, Arabic marks and letter variants, digits and separators folded: "Dāna_7" and "dāna 7"
-- share a key; so do «غوّاص ١٤٢» and «غواص 142».
create function public.deep_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
           translate(
             regexp_replace(lower(public.deep_name_clean(p_name)), '[ً-ْٰـ]', '', 'g'),
             'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
             'ااااهيوي01234567890123456789'),
           '[ ._-]+', ' ', 'g'));
$$;

-- For the word filter: the key with look-alike digits read as letters, separators dropped.
create function public.deep_name_skeleton(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(translate(p_key, '0134578@$', 'oieastbas'), '[^a-zà-ſء-يپچژکگی]', '', 'g');
$$;

create table public.deep_reserved_names (
  name_key text primary key
);

comment on table public.deep_reserved_names is 'Names nobody can choose on The Deep (folded keys). Moderation adds hidden names here.';
alter table public.deep_reserved_names enable row level security;
revoke all on table public.deep_reserved_names from anon, authenticated;

insert into public.deep_reserved_names (name_key)
select public.deep_name_key(n) from unnest(array[
  'durar', 'دُرَر', 'درر', 'the deep', 'deep', 'admin', 'administrator', 'moderator', 'mod', 'staff', 'support',
  'official', 'system', 'root', 'owner', 'team', 'durar team', 'help', 'helpdesk', 'security', 'lativ', 'claude',
  'anthropic', 'anonymous', 'unknown', 'null', 'undefined', 'nobody', 'everyone', 'you', 'me', 'diver', 'pearl', 'pearls',
  'غواص', 'غوّاص', 'لؤلؤ', 'لؤلؤة', 'مدير', 'المدير', 'مشرف', 'الإدارة', 'ادارة', 'إدارة', 'الدعم', 'دعم', 'فريق دُرَر'
]) as n
on conflict do nothing;

-- kind 'part': not allowed anywhere in the name; kind 'word': not allowed as a whole word (so
-- "Hancock" or "Grapevine" stay fine). Kept short on purpose; moderation covers the rest.
create table public.deep_blocked_words (
  word text primary key,
  kind text not null check (kind in ('part', 'word'))
);

comment on table public.deep_blocked_words is 'Words not allowed in names on The Deep (English and Arabic, folded).';
alter table public.deep_blocked_words enable row level security;
revoke all on table public.deep_blocked_words from anon, authenticated;

insert into public.deep_blocked_words (word, kind)
select public.deep_name_key(w), 'part' from unnest(array[
  'fuck', 'fuk', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'pussy', 'porn', 'rapist',
  'hitler', 'nazi', 'wank', 'twat', 'jizz', 'asshole', 'retard', 'tranny', 'kike', 'motherf', 'dildo', 'blowjob',
  'شرموط', 'منيوك', 'متناك', 'قحبه', 'عاهره', 'معرص', 'كسمك', 'كس امك', 'نياك', 'زبي', 'لوطي', 'ديوث'
]) as w
union
select public.deep_name_key(w), 'word' from unnest(array[
  'ass', 'arse', 'dick', 'cock', 'rape', 'anal', 'anus', 'sex', 'sexy', 'cum', 'fag', 'tit', 'tits', 'boob', 'boobs',
  'piss', 'penis', 'vagina', 'bastard', 'dyke', 'spic', 'chink', 'paki', 'crap', 'hoe', 'kill', 'killer',
  'كس', 'زب', 'نيك', 'طيز', 'خول', 'عرص', 'زاني', 'زانيه', 'شاذ', 'حقير', 'خنزير'
]) as w
on conflict do nothing;

-- null when the name is fine, else why not: length, characters, mixed, reserved or not_allowed.
create function public.deep_name_problem(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  n text := public.deep_name_clean(p_name);
  k text;
  sk text;
begin
  if n is null or char_length(n) < 3 or char_length(n) > 20 then
    return 'length';
  end if;
  -- Latin or Arabic letters, digits, single spaces, - _ . (never at the ends or twice in a row),
  -- and Arabic vowel marks only on a letter. Nothing else: no emoji, no direction controls.
  if n !~ '^[A-Za-zÀ-ÖØ-öø-ſء-غف-ْٰپچژکگی0-9٠-٩ ._-]+$'
     or n !~ '[A-Za-zÀ-ÖØ-öø-ſء-غف-يپچژکگی]'
     or n ~ '^[ ._-]|[ ._-]$|[ ._-]{2}'
     or n ~ '(^|[^ء-غف-ْٰپچژکگی])[ً-ْٰ]' then
    return 'characters';
  end if;
  if n ~ '[A-Za-zÀ-ÖØ-öø-ſ]' and n ~ '[ء-غف-يپچژکگی]' then
    return 'mixed';
  end if;
  k := public.deep_name_key(n);
  -- "Diver 142" and «غوّاص ١٤٢» are only ever given out, never chosen.
  if k ~ '^(diver|غواص) ?[0-9]+$' or exists (select 1 from public.deep_reserved_names r where r.name_key = k) then
    return 'reserved';
  end if;
  sk := public.deep_name_skeleton(k);
  if exists (select 1 from public.deep_blocked_words b
              where (b.kind = 'part' and position(public.deep_name_skeleton(b.word) in sk) > 0)
                 or (b.kind = 'part' and position(public.deep_name_skeleton(b.word) in regexp_replace(sk, '(.)\1+', '\1', 'g')) > 0)
                 or (b.kind = 'word' and b.word = any (string_to_array(translate(k, '0134578@$', 'oieastbas'), ' ')))) then
    return 'not_allowed';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Members

create table public.deep_members (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  name       text        not null check (char_length(name) between 3 and 20),
  name_key   text        not null unique,
  generated  boolean     not null default false,
  joined_at  timestamptz not null default now(),
  renamed_at timestamptz
);

comment on table public.deep_members is 'Who joined The Deep and under which name. Private: the boards copy only the name.';
alter table public.deep_members enable row level security;
revoke all on table public.deep_members from anon, authenticated;

-- A free "Diver 142" (or «غوّاص ١٤٢»): the number is unused in either script.
create function public.deep_generated_name(p_script text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n integer;
  tries integer := 0;
begin
  loop
    tries := tries + 1;
    n := 1 + floor(random() * case when tries < 40 then 999 else 99999 end)::integer;
    exit when not exists (select 1 from public.deep_members m where m.name_key in ('diver ' || n, 'غواص ' || n));
  end loop;
  return case when p_script = 'arabic' then 'غوّاص ' || translate(n::text, '0123456789', '٠١٢٣٤٥٦٧٨٩') else 'Diver ' || n end;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The boards: public, and only ever name, score and rank (plus pearls on All time).

create table public.deep_board (
  board  text    not null check (board in ('week', 'all')),
  rank   integer not null,
  name   text    not null,
  score  integer not null,
  pearls integer,
  primary key (board, rank)
);

create table public.deep_board_info (
  board        text        primary key check (board in ('week', 'all')),
  divers       integer     not null,
  week_start   date        not null,
  refreshed_at timestamptz not null
);

comment on table public.deep_board is 'The Deep, as everyone sees it: rank, name and score. Rebuilt every 15 minutes.';
comment on table public.deep_board_info is 'How many divers each board ranks, and when it was rebuilt.';

alter table public.deep_board enable row level security;
alter table public.deep_board_info enable row level security;
create policy "Everyone reads the board" on public.deep_board for select to anon, authenticated using (true);
create policy "Everyone reads the board info" on public.deep_board_info for select to anon, authenticated using (true);
revoke all on table public.deep_board, public.deep_board_info from anon, authenticated;
grant select on table public.deep_board, public.deep_board_info to anon, authenticated;

-- Rebuilds both boards. Ties go to whoever reached the score first.
create function public.deep_refresh_boards()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  wk date := public.deep_week_start(now());
begin
  perform pg_advisory_xact_lock(hashtext('durar_deep_boards'));
  delete from public.deep_board where true;
  insert into public.deep_board (board, rank, name, score, pearls)
  select 'all', row_number() over (order by s.depth desc, s.depth_at, m.name_key), m.name, s.depth, s.pearls
    from public.deep_members m
    join public.deep_scores s on s.user_id = m.user_id
   where s.depth > 0;
  insert into public.deep_board (board, rank, name, score, pearls)
  select 'week', row_number() over (order by s.week_gain desc, s.week_at, m.name_key), m.name, s.week_gain, null
    from public.deep_members m
    join public.deep_scores s on s.user_id = m.user_id
   where s.week_start = wk and s.week_gain > 0;
  delete from public.deep_board_info where true;
  insert into public.deep_board_info (board, divers, week_start, refreshed_at)
  select b, (select count(*) from public.deep_board x where x.board = b), wk, now()
    from unnest(array['week', 'all']) as b;
end;
$$;

-- The caller's own entry and ranks (null when not joined). Ranks come from the boards, so they
-- match what everyone sees; "live" is the caller's score right now.
create function public.deep_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.deep_members%rowtype;
  s public.deep_scores%rowtype;
  wk date := public.deep_week_start(now());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into m from public.deep_members x where x.user_id = uid;
  if not found then
    return null;
  end if;
  select * into s from public.deep_scores x where x.user_id = uid;
  return jsonb_build_object(
    'name', m.name,
    'generated', m.generated,
    'joined_at', m.joined_at,
    'next_rename_at', case when m.renamed_at is not null and m.renamed_at > now() - interval '1 day'
                           then m.renamed_at + interval '1 day' end,
    'live', jsonb_build_object(
      'depth', coalesce(s.depth, 0),
      'pearls', coalesce(s.pearls, 0),
      'week', case when s.week_start = wk then greatest(s.week_gain, 0) else 0 end),
    'all', (select jsonb_build_object('rank', b.rank, 'score', b.score, 'pearls', b.pearls)
              from public.deep_board b where b.board = 'all' and b.name = m.name),
    'week', (select jsonb_build_object('rank', b.rank, 'score', b.score)
               from public.deep_board b where b.board = 'week' and b.name = m.name)
  );
end;
$$;

create function public.deep_raise_name_problem(p_problem text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'deep_name:%', p_problem using errcode = '22023';
end;
$$;

-- Join with a chosen name, or with none for a generated one ('latin' or 'arabic').
create function public.deep_join(p_name text default null, p_script text default 'latin')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_name text;
  problem text;
  tries integer := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.deep_members m where m.user_id = uid) then
    return public.deep_me();
  end if;
  if p_name is not null then
    problem := public.deep_name_problem(p_name);
    if problem is not null then
      perform public.deep_raise_name_problem(problem);
    end if;
  end if;
  loop
    tries := tries + 1;
    v_name := coalesce(public.deep_name_clean(p_name), public.deep_generated_name(p_script));
    begin
      insert into public.deep_members (user_id, name, name_key, generated)
      values (uid, v_name, public.deep_name_key(v_name), p_name is null);
      exit;
    exception when unique_violation then
      if p_name is not null or tries > 5 then
        perform public.deep_raise_name_problem('taken');
      end if;
    end;
  end loop;
  perform public.deep_refresh_boards();
  return public.deep_me();
end;
$$;

-- A new name (or a new generated one). Once a day after the first change.
create function public.deep_rename(p_name text default null, p_script text default 'latin')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.deep_members%rowtype;
  v_name text;
  problem text;
  tries integer := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into m from public.deep_members x where x.user_id = uid for update;
  if not found then
    raise exception 'not in the deep' using errcode = 'P0002';
  end if;
  if m.renamed_at is not null and m.renamed_at > now() - interval '1 day' then
    raise exception 'deep_rename_too_soon' using errcode = 'P0001';
  end if;
  if p_name is not null then
    problem := public.deep_name_problem(p_name);
    if problem is not null then
      perform public.deep_raise_name_problem(problem);
    end if;
  end if;
  loop
    tries := tries + 1;
    v_name := coalesce(public.deep_name_clean(p_name), public.deep_generated_name(p_script));
    begin
      update public.deep_members x
         set name = v_name, name_key = public.deep_name_key(v_name), generated = p_name is null, renamed_at = now()
       where x.user_id = uid;
      exit;
    exception when unique_violation then
      if p_name is not null or tries > 5 then
        perform public.deep_raise_name_problem('taken');
      end if;
    end;
  end loop;
  perform public.deep_refresh_boards();
  return public.deep_me();
end;
$$;

-- Leave: the name disappears from both boards at once. Progress stays.
create function public.deep_leave()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.deep_members m where m.user_id = uid;
  perform public.deep_refresh_boards();
end;
$$;

revoke all on function
  public.box_interval(smallint),
  public.deep_week_start(timestamptz),
  public.deep_name_clean(text),
  public.deep_name_key(text),
  public.deep_name_skeleton(text),
  public.deep_name_problem(text),
  public.deep_generated_name(text),
  public.deep_refresh_boards(),
  public.deep_raise_name_problem(text),
  public.deep_me(),
  public.deep_join(text, text),
  public.deep_rename(text, text),
  public.deep_leave()
from public, anon, authenticated;

grant execute on function public.deep_me(), public.deep_join(text, text), public.deep_rename(text, text), public.deep_leave()
to authenticated;
grant execute on function public.deep_refresh_boards() to service_role;

-- ---------------------------------------------------------------------------------------------
-- Moderation (docs/OPERATIONS.md, "The Deep"): run in the SQL editor as the owner.
--   select public.deep_hide('Name');    -- gives that diver a generated name; nobody can pick it again
--   select public.deep_remove('Name');  -- takes them off The Deep altogether (they can rejoin)

create function public.deep_hide(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.deep_name_key(p_name);
  m public.deep_members%rowtype;
  v_new text;
begin
  select * into m from public.deep_members x where x.name_key = k;
  if not found then
    return 'No diver is called ' || coalesce(p_name, 'that') || '.';
  end if;
  insert into public.deep_reserved_names (name_key) values (k) on conflict do nothing;
  v_new := public.deep_generated_name(case when m.name ~ '[ء-ي]' then 'arabic' else 'latin' end);
  update public.deep_members x set name = v_new, name_key = public.deep_name_key(v_new), generated = true where x.user_id = m.user_id;
  perform public.deep_refresh_boards();
  return 'Hidden: ' || m.name || ' is now ' || v_new || '.';
end;
$$;

create function public.deep_remove(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.deep_name_key(p_name);
  n integer;
begin
  insert into public.deep_reserved_names (name_key) values (k) on conflict do nothing;
  delete from public.deep_members x where x.name_key = k;
  get diagnostics n = row_count;
  perform public.deep_refresh_boards();
  return case when n > 0 then 'Removed ' || p_name || ' from The Deep.' else 'No diver is called ' || p_name || '.' end;
end;
$$;

revoke all on function public.deep_hide(text), public.deep_remove(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Hooks left by 20261006000000_monitoring_gdpr

-- The weekly digest: how many divers are on The Deep, and how many joined in the week.
create or replace function public.deep_digest_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'participants', (select count(*) from public.deep_members),
    'joined', (select count(*) from public.deep_members m where m.joined_at >= p_from and m.joined_at < p_to));
$$;

-- Download my data: the caller's entry on The Deep, or null.
create or replace function public.deep_export_for(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'name', m.name,
           'generated_name', m.generated,
           'joined_at', m.joined_at,
           'renamed_at', m.renamed_at,
           'depth', coalesce(s.depth, 0),
           'pearls_in_the_deep', coalesce(s.pearls, 0),
           'depth_gained_this_week', case when s.week_start = public.deep_week_start(now()) then s.week_gain else 0 end)
    from public.deep_members m
    left join public.deep_scores s on s.user_id = m.user_id
   where m.user_id = p_user_id;
$$;

revoke all on function public.deep_digest_stats(timestamptz, timestamptz), public.deep_export_for(uuid) from public, anon, authenticated;

-- Deleting an account also takes its name off The Deep at once (the rows would cascade anyway;
-- the boards are rebuilt straight away so the name doesn't linger for 15 minutes).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_email text;
  was_member boolean;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = uid;
  delete from public.subscribers where user_id = uid or (v_email is not null and email = v_email);
  delete from public.saved_pearls where user_id = uid;
  delete from public.deep_members where user_id = uid;
  was_member := found;
  delete from auth.users where id = uid;
  if was_member then
    perform public.deep_refresh_boards();
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Rebuild the boards every 15 minutes (Monday 00:00 in Amsterdam is always on a quarter hour, so
-- "This week" starts afresh on time). Only where pg_cron is installed (Supabase); a plain test
-- database skips it.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('durar-deep-boards', '*/15 * * * *', 'select public.deep_refresh_boards()');
  else
    raise notice 'pg_cron is not installed: The Deep''s boards rebuild only when someone joins, renames or leaves.';
  end if;
end;
$$;

select public.deep_refresh_boards();
