-- Durar · New accounts get the Pearl of the Day email
-- An account is subscribed once its address is proven: by the confirmation link Supabase emails
-- (with "Confirm email" on) or by Google. Switching it off (account menu or the email's link) sticks:
-- an unsubscribed, bounced or complained address is never subscribed again here.

create function public.subscribe_confirmed_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
begin
  if v_email is null or v_email = '' then
    return new;
  end if;
  -- With "Confirm email" off, Supabase confirms an email sign-up without sending anything, which
  -- proves nothing: only a link that was actually sent, or Google, counts.
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email'
     and new.confirmation_sent_at is null and new.recovery_sent_at is null then
    return new;
  end if;
  -- Never block a sign-up over the email list: on any error, log it and let the account through.
  begin
    -- An account follows one address (as in subscription_request).
    update public.subscribers s set user_id = null where s.user_id = new.id and s.email <> v_email;
    insert into public.subscribers as s (email, status, user_id, confirmed_at)
    values (v_email, 'confirmed', new.id, now())
    on conflict (email) do update
       set status = case when s.status = 'pending' then 'confirmed' else s.status end,
           confirmed_at = case when s.status = 'pending' then now() else s.confirmed_at end,
           confirm_token_hash = case when s.status = 'pending' then null else s.confirm_token_hash end,
           user_id = coalesce(s.user_id, excluded.user_id),
           updated_at = now();
  exception when others then
    raise warning 'Durar: could not subscribe account % to the daily email: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.subscribe_confirmed_account() from public, anon, authenticated;

-- Supabase inserts every account unconfirmed and confirms it with a later update.
create trigger subscribe_confirmed_account
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.subscribe_confirmed_account();

create trigger subscribe_confirmed_account_on_insert
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.subscribe_confirmed_account();

-- Accounts that already exist get it too (the owner's choice, 2 Oct 2026), by the same rule, once.
insert into public.subscribers as s (email, status, user_id, confirmed_at)
select lower(btrim(u.email)), 'confirmed', u.id, now()
  from auth.users u
 where u.email_confirmed_at is not null
   and lower(btrim(u.email)) like '%_@_%'
   and char_length(btrim(u.email)) between 3 and 254
   and (coalesce(u.raw_app_meta_data ->> 'provider', 'email') <> 'email'
        or u.confirmation_sent_at is not null or u.recovery_sent_at is not null)
   and not exists (select 1 from public.subscribers t where t.user_id = u.id)
on conflict (email) do update
   set status = case when s.status = 'pending' then 'confirmed' else s.status end,
       confirmed_at = case when s.status = 'pending' then now() else s.confirmed_at end,
       confirm_token_hash = case when s.status = 'pending' then null else s.confirm_token_hash end,
       user_id = coalesce(s.user_id, excluded.user_id),
       updated_at = now();

comment on table public.subscribers is
  'Pearl of the Day email subscribers: double opt-in from the form, or a confirmed account (opt-out).';
