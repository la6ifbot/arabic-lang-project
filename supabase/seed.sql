-- Durar · Fake data for staging and for CI's backup check. Never real people: every address is at
-- example.com and nobody can sign in with these accounts (no password). Safe to run again.
-- Staging gets it from the "Migrations" workflow (seed staging); `supabase start` loads it locally.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        confirmation_sent_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 'diver' || n || '@example.com', '',
       case when n % 4 = 0 then null else now() - (n || ' days')::interval end, now() - (n || ' days')::interval,
       '{"provider": "email", "providers": ["email"]}', '{}',
       now() - (n || ' days')::interval, now()
  from generate_series(1, 12) as n
on conflict (id) do nothing;

-- A few people who only subscribed to the email, without an account.
insert into public.subscribers (email, status, confirmed_at, unsubscribed_at)
values ('reader1@example.com', 'confirmed', now() - interval '20 days', null),
       ('reader2@example.com', 'confirmed', now() - interval '3 days', null),
       ('reader3@example.com', 'pending', null, null),
       ('reader4@example.com', 'unsubscribed', now() - interval '30 days', now() - interval '2 days')
on conflict (email) do nothing;

-- Saved pearls and mastery progress for the confirmed accounts.
insert into public.saved_pearls (user_id, word_slug, created_at)
select u.id, w.slug, now() - (w.n || ' hours')::interval
  from auth.users u
 cross join (values (1, 'durrah'), (2, 'bahr'), (3, 'najm'), (4, 'sarab')) as w(n, slug)
 where u.email like 'diver%@example.com' and u.email_confirmed_at is not null
on conflict do nothing;

insert into public.word_progress (user_id, word_slug, box, due_at, last_reviewed_at, times_seen, lapses)
select u.id, w.slug, w.box, now() + (w.box || ' days')::interval, now() - interval '1 day', w.box + 1, 0
  from auth.users u
 cross join (values ('durrah', 3), ('bahr', 2), ('najm', 1), ('qamar', 5), ('sarab', 4)) as w(slug, box)
 where u.email like 'diver%@example.com' and u.email_confirmed_at is not null
on conflict do nothing;
