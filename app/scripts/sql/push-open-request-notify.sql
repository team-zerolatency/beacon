-- Beacon push notifications for new open SOS requests.
-- Apply in Supabase SQL editor before enabling the edge function trigger.

create extension if not exists pgcrypto;
create extension if not exists pg_net;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('ngo', 'client')),
  expo_push_token text not null unique,
  platform text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_push_tokens_role_active
  on public.device_push_tokens (role, is_active);

create index if not exists idx_device_push_tokens_user
  on public.device_push_tokens (user_id);

create table if not exists public.push_runtime_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;
alter table public.push_runtime_config enable row level security;

-- Users can register and manage their own device tokens.
drop policy if exists "Users manage own push tokens" on public.device_push_tokens;
create policy "Users manage own push tokens"
  on public.device_push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Runtime config should be managed by service role only.
drop policy if exists "No direct read runtime config" on public.push_runtime_config;
create policy "No direct read runtime config"
  on public.push_runtime_config
  for select
  to authenticated
  using (false);

-- Keep updated_at in sync.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_device_push_tokens_updated_at on public.device_push_tokens;
create trigger set_device_push_tokens_updated_at
before update on public.device_push_tokens
for each row
execute function public.set_updated_at();

drop trigger if exists set_push_runtime_config_updated_at on public.push_runtime_config;
create trigger set_push_runtime_config_updated_at
before update on public.push_runtime_config
for each row
execute function public.set_updated_at();

create or replace function public.notify_open_request_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  function_url text;
  webhook_secret text;
begin
  if new.status is distinct from 'open' then
    return new;
  end if;

  select value into function_url
  from public.push_runtime_config
  where key = 'new_open_request_push_url';

  select value into webhook_secret
  from public.push_runtime_config
  where key = 'new_open_request_push_secret';

  if function_url is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'id', new.id,
      'message', new.message,
      'target_ngo_name', new.target_ngo_name,
      'target_state', new.target_state,
      'target_district', new.target_district,
      'target_city', new.target_city
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_open_request_push on public.help_requests;
create trigger trg_notify_open_request_push
after insert on public.help_requests
for each row
execute function public.notify_open_request_push();

-- Example config values (replace with your project values):
-- insert into public.push_runtime_config (key, value)
-- values
--   ('new_open_request_push_url', 'https://<project-ref>.functions.supabase.co/notify-new-open-request'),
--   ('new_open_request_push_secret', '<strong-random-secret>')
-- on conflict (key) do update set value = excluded.value;
