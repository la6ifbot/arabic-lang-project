-- Durar · My Pearls
-- Stores only which words (by slug) each user has saved. Word content stays in the static
-- site (src/data/words.json); the database never holds it.

create table public.saved_pearls (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  word_slug  text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, word_slug),
  constraint saved_pearls_slug_format check (word_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(word_slug) <= 64)
);

comment on table public.saved_pearls is 'Words a user saved to My Pearls. One row per (user, word).';

-- Newest-first listing for the Library.
create index saved_pearls_user_created_idx on public.saved_pearls (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: every signed-in user sees and changes only their own rows.
alter table public.saved_pearls enable row level security;

create policy "Users read their own pearls"
  on public.saved_pearls for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users save their own pearls"
  on public.saved_pearls for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users remove their own pearls"
  on public.saved_pearls for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Supabase grants everything on new tables to anon/authenticated by default; narrow that.
-- No UPDATE at all: a saved pearl is only ever added or removed.
revoke all on table public.saved_pearls from anon, authenticated;
grant select, insert, delete on table public.saved_pearls to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Guard rail for a free-tier database: cap pearls per user (the whole word list is far smaller).
create function public.saved_pearls_enforce_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_pearls where user_id = new.user_id) >= 1000 then
    raise exception 'pearl limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger saved_pearls_limit
  before insert on public.saved_pearls
  for each row execute function public.saved_pearls_enforce_limit();

-- Only ever called by the trigger, never via the API.
revoke all on function public.saved_pearls_enforce_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Self-service account deletion (GDPR “right to erasure”) without a custom server.
-- Deleting the auth user cascades to saved_pearls.
create function public.delete_my_account()
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
  delete from public.saved_pearls where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
