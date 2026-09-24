-- Durar · Pearl of the Day by email
-- Subscribers need no account. All reads and writes go through the server (Vercel functions using
-- the service role) or through the two small functions a signed-in user may call for their own row.

create table public.subscribers (
  id                uuid        primary key default gen_random_uuid(),
  email             text        not null unique,
  status            text        not null default 'pending'
                    check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced', 'complained')),
  -- Optional link to an account, so the account menu can show and toggle the subscription.
  user_id           uuid        unique references auth.users (id) on delete cascade,
  -- SHA-256 of the confirmation token; the token itself only ever exists in the email.
  confirm_token_hash text,
  confirm_sent_at   timestamptz,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  unsubscribed_at   timestamptz,
  updated_at        timestamptz not null default now(),
  constraint subscribers_email_normalized check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email like '%_@_%')
);

comment on table public.subscribers is 'Pearl of the Day email subscribers (double opt-in).';
create index subscribers_status_idx on public.subscribers (status);
create index subscribers_confirm_token_idx on public.subscribers (confirm_token_hash) where confirm_token_hash is not null;

-- One row per subscriber per day: the primary key makes a second send for the same day impossible,
-- even if the daily job retries or two runs overlap.
create table public.daily_sends (
  subscriber_id uuid        not null references public.subscribers (id) on delete cascade,
  send_date     date        not null,
  word_slug     text        not null,
  status        text        not null default 'reserved' check (status in ('reserved', 'sent', 'failed')),
  message_id    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (subscriber_id, send_date)
);

-- Per-IP rate limiting for the public subscribe endpoint (the IP is stored only as a keyed hash).
create table public.subscribe_attempts (
  ip_hash text        not null,
  at      timestamptz not null default now()
);
create index subscribe_attempts_ip_idx on public.subscribe_attempts (ip_hash, at desc);

alter table public.subscribers enable row level security;
alter table public.daily_sends enable row level security;
alter table public.subscribe_attempts enable row level security;
-- No policies: nobody reaches these tables directly through the API. The service role bypasses RLS.
revoke all on table public.subscribers, public.daily_sends, public.subscribe_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Server-side functions (service role only)

create function public.subscription_request(
  p_email text,
  p_ip_hash text,
  p_user_id uuid,
  p_verified boolean,
  p_token_hash text
) returns table (outcome text, subscriber_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row public.subscribers%rowtype;
begin
  if p_ip_hash is not null then
    if (select count(*) from public.subscribe_attempts a where a.ip_hash = p_ip_hash and a.at > now() - interval '1 hour') >= 5 then
      return query select 'rate_limited'::text, null::uuid;
      return;
    end if;
    insert into public.subscribe_attempts (ip_hash) values (p_ip_hash);
  end if;

  if p_user_id is not null then
    -- An account follows one address: release any other row it was linked to.
    update public.subscribers s set user_id = null where s.user_id = p_user_id and s.email <> v_email;
  end if;

  select * into v_row from public.subscribers s where s.email = v_email for update;

  if not found then
    insert into public.subscribers (email, status, user_id, confirm_token_hash, confirm_sent_at, confirmed_at)
    values (
      v_email,
      case when p_verified then 'confirmed' else 'pending' end,
      p_user_id,
      case when p_verified then null else p_token_hash end,
      case when p_verified then null else now() end,
      case when p_verified then now() end
    )
    returning * into v_row;
    return query select (case when p_verified then 'confirmed' else 'send_confirmation' end)::text, v_row.id;
    return;
  end if;

  if p_user_id is not null and v_row.user_id is null then
    update public.subscribers s set user_id = p_user_id, updated_at = now() where s.id = v_row.id;
  end if;

  if v_row.status in ('bounced', 'complained') then
    return query select 'noop'::text, v_row.id; -- never email an address that bounced or complained
  elsif v_row.status = 'confirmed' then
    return query select 'confirmed'::text, v_row.id;
  elsif p_verified then
    update public.subscribers s
       set status = 'confirmed', confirmed_at = now(), unsubscribed_at = null, confirm_token_hash = null, updated_at = now()
     where s.id = v_row.id;
    return query select 'confirmed'::text, v_row.id;
  elsif v_row.status = 'pending' and v_row.confirm_sent_at > now() - interval '10 minutes' then
    return query select 'noop'::text, v_row.id; -- don't flood an inbox with confirmation emails
  else
    update public.subscribers s
       set status = 'pending', confirm_token_hash = p_token_hash, confirm_sent_at = now(), updated_at = now()
     where s.id = v_row.id;
    return query select 'send_confirmation'::text, v_row.id;
  end if;
end;
$$;

create function public.subscription_confirm(p_token_hash text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_row public.subscribers%rowtype;
begin
  select * into v_row from public.subscribers s where s.confirm_token_hash = p_token_hash for update;
  if not found then
    return 'invalid';
  elsif v_row.status = 'confirmed' then
    return 'already_confirmed';
  elsif v_row.status <> 'pending' or v_row.confirm_sent_at < now() - interval '7 days' then
    return 'expired';
  end if;
  update public.subscribers s
     set status = 'confirmed', confirmed_at = now(), unsubscribed_at = null, updated_at = now()
   where s.id = v_row.id;
  return 'confirmed';
end;
$$;

create function public.subscription_unsubscribe(p_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  update public.subscribers s
     set status = case when s.status in ('bounced', 'complained') then s.status else 'unsubscribed' end,
         unsubscribed_at = coalesce(s.unsubscribed_at, now()),
         confirm_token_hash = null,
         updated_at = now()
   where s.id = p_id;
  return case when found then 'unsubscribed' else 'unknown' end;
end;
$$;

-- The unsubscribe link proves the visitor can read that inbox, so resubscribing needs no new opt-in.
create function public.subscription_resubscribe(p_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select s.status into v_status from public.subscribers s where s.id = p_id for update;
  if not found then
    return 'unknown';
  elsif v_status in ('bounced', 'complained') then
    return 'blocked';
  end if;
  update public.subscribers s
     set status = 'confirmed', confirmed_at = coalesce(s.confirmed_at, now()), unsubscribed_at = null, updated_at = now()
   where s.id = p_id;
  return 'confirmed';
end;
$$;

-- Atomically reserves the next batch of recipients for a day. Rows already present for that day are
-- skipped, and concurrent runs skip each other's locked rows.
create function public.daily_claim(p_date date, p_slug text, p_limit integer, p_only text[] default null)
returns table (subscriber_id uuid, email text)
language plpgsql
set search_path = ''
as $$
begin
  return query
  with picked as (
    select s.id, s.email
      from public.subscribers s
     where s.status = 'confirmed'
       and (p_only is null or s.email = any (p_only))
       and not exists (select 1 from public.daily_sends d where d.subscriber_id = s.id and d.send_date = p_date)
     order by s.confirmed_at, s.id
     limit greatest(p_limit, 0)
     for update of s skip locked
  ), reserved as (
    insert into public.daily_sends (subscriber_id, send_date, word_slug, status)
    select p.id, p_date, p_slug, 'reserved' from picked p
    on conflict do nothing
    returning daily_sends.subscriber_id
  )
  select p.id, p.email from picked p join reserved r on r.subscriber_id = p.id;
end;
$$;

create function public.daily_pending_count(p_date date, p_only text[] default null)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.subscribers s
   where s.status = 'confirmed'
     and (p_only is null or s.email = any (p_only))
     and not exists (select 1 from public.daily_sends d where d.subscriber_id = s.id and d.send_date = p_date);
$$;

create function public.daily_mark(p_subscriber_id uuid, p_date date, p_status text, p_message_id text default null)
returns void
language sql
set search_path = ''
as $$
  update public.daily_sends d
     set status = p_status, message_id = coalesce(p_message_id, d.message_id), updated_at = now()
   where d.subscriber_id = p_subscriber_id and d.send_date = p_date;
$$;

-- Hard bounces and complaints (from the SES suppression list): never email that address again.
create function public.subscription_suppress(p_email text, p_reason text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.subscribers s
     set status = case when p_reason = 'complaint' then 'complained' else 'bounced' end,
         updated_at = now()
   where s.email = lower(btrim(p_email)) and s.status not in ('bounced', 'complained');
  return found;
end;
$$;

-- Daily tidy-up: unconfirmed sign-ups expire after 7 days; rate-limit and send logs are kept briefly.
create function public.subscriptions_housekeeping()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pending integer;
  v_attempts integer;
  v_sends integer;
begin
  delete from public.subscribers s where s.status = 'pending' and coalesce(s.confirm_sent_at, s.created_at) < now() - interval '7 days';
  get diagnostics v_pending = row_count;
  delete from public.subscribe_attempts a where a.at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;
  delete from public.daily_sends d where d.send_date < current_date - 60;
  get diagnostics v_sends = row_count;
  return jsonb_build_object('expired_pending', v_pending, 'old_attempts', v_attempts, 'old_sends', v_sends);
end;
$$;

revoke all on function
  public.subscription_request(text, text, uuid, boolean, text),
  public.subscription_confirm(text),
  public.subscription_unsubscribe(uuid),
  public.subscription_resubscribe(uuid),
  public.daily_claim(date, text, integer, text[]),
  public.daily_pending_count(date, text[]),
  public.daily_mark(uuid, date, text, text),
  public.subscription_suppress(text, text),
  public.subscriptions_housekeeping()
from public, anon, authenticated;

grant execute on function
  public.subscription_request(text, text, uuid, boolean, text),
  public.subscription_confirm(text),
  public.subscription_unsubscribe(uuid),
  public.subscription_resubscribe(uuid),
  public.daily_claim(date, text, integer, text[]),
  public.daily_pending_count(date, text[]),
  public.daily_mark(uuid, date, text, text),
  public.subscription_suppress(text, text),
  public.subscriptions_housekeeping()
to service_role;

grant select, insert, update, delete on table public.subscribers, public.daily_sends, public.subscribe_attempts to service_role;

-- ---------------------------------------------------------------------------------------------
-- Signed-in users: see and switch off their own subscription (matched by account link or email).
-- Switching on goes through the server, which handles double opt-in when it's needed.

create function public.my_subscription()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.status
       from public.subscribers s
      where s.user_id = auth.uid()
         or s.email = (select lower(u.email) from auth.users u where u.id = auth.uid())
      order by (s.user_id = auth.uid()) desc nulls last
      limit 1),
    'none');
$$;

create function public.unsubscribe_me()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.subscribers s
     set status = case when s.status in ('bounced', 'complained') then s.status else 'unsubscribed' end,
         unsubscribed_at = now(), confirm_token_hash = null, updated_at = now()
   where s.user_id = auth.uid()
      or s.email = (select lower(u.email) from auth.users u where u.id = auth.uid());
  return 'unsubscribed';
end;
$$;

revoke all on function public.my_subscription(), public.unsubscribe_me() from public, anon;
grant execute on function public.my_subscription(), public.unsubscribe_me() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Deleting an account now also removes its subscription (and, by cascade, its send log).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_email text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = uid;
  delete from public.subscribers where user_id = uid or (v_email is not null and email = v_email);
  delete from public.saved_pearls where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
