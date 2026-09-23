-- Minimal stand-in for the parts of Supabase that our migrations and RLS rely on, so the
-- policies can be tested against a plain PostgreSQL server (CI service container or local).
-- auth.uid() matches Supabase's own definition: the `sub` claim of the request JWT.
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase's default privileges on new public tables (our migration revokes what it doesn't need).
alter default privileges in schema public grant all on tables to anon, authenticated;
