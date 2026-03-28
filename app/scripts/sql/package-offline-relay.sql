-- Full package relay schema for internet-first + offline fallback flows.
-- Apply in Supabase SQL editor (staging first).

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'package_status' and n.nspname = 'public'
  ) then
    create type public.package_status as enum (
      'created',
      'picked_up',
      'in_transit',
      'received_offline',
      'synced_online',
      'verified'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'package_event_type' and n.nspname = 'public'
  ) then
    create type public.package_event_type as enum (
      'package_created',
      'package_picked_up',
      'package_in_transit',
      'package_received_offline',
      'package_synced_online',
      'package_verified'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'relay_transport' and n.nspname = 'public'
  ) then
    create type public.relay_transport as enum (
      'ble',
      'wifi_direct',
      'multipeer',
      'unknown'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'verification_decision' and n.nspname = 'public'
  ) then
    create type public.verification_decision as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'sync_outcome' and n.nspname = 'public'
  ) then
    create type public.sync_outcome as enum (
      'success',
      'retry',
      'failed'
    );
  end if;
end;
$$;

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  external_ref text unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  current_holder_user_id uuid references auth.users(id) on delete set null,
  source_device_id text,
  recipient_name text,
  recipient_phone text,
  destination_state text,
  destination_district text,
  destination_city text,
  destination_lat numeric(9, 6),
  destination_lng numeric(9, 6),
  internet_first boolean not null default true,
  status public.package_status not null default 'created',
  payload jsonb not null default '{}'::jsonb,
  last_event_seq bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  synced_at timestamptz,
  constraint chk_packages_destination_pair
    check (
      (destination_lat is null and destination_lng is null)
      or (destination_lat is not null and destination_lng is not null)
    )
);

create table if not exists public.package_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  event_seq bigint not null check (event_seq > 0),
  event_type public.package_event_type not null,
  status public.package_status not null,
  payload jsonb not null default '{}'::jsonb,
  source_user_id uuid references auth.users(id) on delete set null,
  source_device_id text,
  idempotency_key text not null unique,
  event_created_at timestamptz not null default timezone('utc', now()),
  inserted_at timestamptz not null default timezone('utc', now()),
  constraint uq_package_events_sequence unique (package_id, event_seq)
);

create table if not exists public.relay_receipts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  package_event_id uuid references public.package_events(id) on delete set null,
  sender_user_id uuid references auth.users(id) on delete set null,
  receiver_user_id uuid references auth.users(id) on delete set null,
  transport public.relay_transport not null,
  checksum text,
  byte_size integer check (byte_size is null or byte_size >= 0),
  signal_dbm integer check (signal_dbm is null or signal_dbm between -120 and 0),
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.package_verifications (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null unique references public.packages(id) on delete cascade,
  helper_user_id uuid references auth.users(id) on delete set null,
  ngo_user_id uuid references auth.users(id) on delete set null,
  helper_decision public.verification_decision not null default 'pending',
  helper_notes text,
  helper_decision_at timestamptz,
  ngo_decision public.verification_decision not null default 'pending',
  ngo_notes text,
  ngo_decision_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chk_verification_approval_dependency
    check (
      ngo_decision != 'approved'::public.verification_decision
      or helper_decision = 'approved'::public.verification_decision
    )
);

create table if not exists public.package_sync_attempts (
  id uuid primary key default gen_random_uuid(),
  package_event_id uuid not null references public.package_events(id) on delete cascade,
  attempted_by_user_id uuid references auth.users(id) on delete set null,
  attempted_via_device_id text,
  outcome public.sync_outcome not null,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_packages_created_by on public.packages(created_by);
create index if not exists idx_packages_current_holder on public.packages(current_holder_user_id);
create index if not exists idx_packages_status on public.packages(status);
create index if not exists idx_package_events_package_id on public.package_events(package_id);
create index if not exists idx_package_events_source_user on public.package_events(source_user_id);
create index if not exists idx_package_events_event_created_at on public.package_events(event_created_at);
create index if not exists idx_relay_receipts_package_id on public.relay_receipts(package_id);
create index if not exists idx_relay_receipts_receiver on public.relay_receipts(receiver_user_id);
create index if not exists idx_package_verifications_helper on public.package_verifications(helper_user_id);
create index if not exists idx_package_verifications_ngo on public.package_verifications(ngo_user_id);
create index if not exists idx_package_sync_attempts_event on public.package_sync_attempts(package_event_id);

create or replace function public.current_user_type()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.user_type
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    'client'
  );
$$;

grant execute on function public.current_user_type() to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_valid_package_transition(
  old_status public.package_status,
  new_status public.package_status
)
returns boolean
language sql
immutable
as $$
  select case
    when old_status = new_status then true
    when old_status = 'created' and new_status in ('picked_up', 'in_transit', 'received_offline', 'synced_online') then true
    when old_status = 'picked_up' and new_status in ('in_transit', 'received_offline', 'synced_online') then true
    when old_status = 'in_transit' and new_status in ('received_offline', 'synced_online') then true
    when old_status = 'received_offline' and new_status in ('synced_online') then true
    when old_status = 'synced_online' and new_status in ('verified') then true
    else false
  end;
$$;

create or replace function public.enforce_package_transition()
returns trigger
language plpgsql
as $$
begin
  if not public.is_valid_package_transition(old.status, new.status) then
    raise exception 'invalid package status transition: % -> %', old.status, new.status;
  end if;

  if new.status in ('synced_online', 'verified') and new.synced_at is null then
    new.synced_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

create or replace function public.apply_package_event_to_package()
returns trigger
language plpgsql
as $$
declare
  current_seq bigint;
begin
  select p.last_event_seq
  into current_seq
  from public.packages p
  where p.id = new.package_id
  for update;

  if current_seq is null then
    raise exception 'package % not found for event apply', new.package_id;
  end if;

  if new.event_seq <= current_seq then
    raise exception 'event sequence must increase for package %, got %, current %', new.package_id, new.event_seq, current_seq;
  end if;

  update public.packages p
  set
    status = new.status,
    last_event_seq = new.event_seq,
    current_holder_user_id = coalesce(new.source_user_id, p.current_holder_user_id),
    synced_at = case
      when new.status in ('synced_online', 'verified') then timezone('utc', now())
      else p.synced_at
    end,
    updated_at = timezone('utc', now())
  where p.id = new.package_id;

  return new;
end;
$$;

drop trigger if exists trg_packages_touch_updated_at on public.packages;
create trigger trg_packages_touch_updated_at
before update on public.packages
for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_packages_enforce_transition on public.packages;
create trigger trg_packages_enforce_transition
before update of status on public.packages
for each row execute procedure public.enforce_package_transition();

drop trigger if exists trg_package_verifications_touch_updated_at on public.package_verifications;
create trigger trg_package_verifications_touch_updated_at
before update on public.package_verifications
for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_package_events_apply on public.package_events;
create trigger trg_package_events_apply
after insert on public.package_events
for each row execute procedure public.apply_package_event_to_package();

alter table public.packages enable row level security;
alter table public.package_events enable row level security;
alter table public.relay_receipts enable row level security;
alter table public.package_verifications enable row level security;
alter table public.package_sync_attempts enable row level security;

grant select, insert, update on public.packages to authenticated;
grant select, insert on public.package_events to authenticated;
grant select, insert on public.relay_receipts to authenticated;
grant select, insert, update on public.package_verifications to authenticated;
grant select, insert on public.package_sync_attempts to authenticated;

-- packages policies
drop policy if exists "packages_select_policy" on public.packages;
create policy "packages_select_policy"
on public.packages
for select
using (
  auth.role() = 'authenticated'
  and (
    created_by = auth.uid()
    or current_holder_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
  )
);

drop policy if exists "packages_insert_policy" on public.packages;
create policy "packages_insert_policy"
on public.packages
for insert
with check (
  auth.role() = 'authenticated'
  and created_by = auth.uid()
);

drop policy if exists "packages_update_policy" on public.packages;
create policy "packages_update_policy"
on public.packages
for update
using (
  auth.role() = 'authenticated'
  and (
    created_by = auth.uid()
    or current_holder_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    created_by = auth.uid()
    or current_holder_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
  )
);

-- package_events policies
drop policy if exists "package_events_select_policy" on public.package_events;
create policy "package_events_select_policy"
on public.package_events
for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.packages p
    where p.id = package_events.package_id
      and (
        p.created_by = auth.uid()
        or p.current_holder_user_id = auth.uid()
        or public.current_user_type() = 'ngo'
      )
  )
);

drop policy if exists "package_events_insert_policy" on public.package_events;
create policy "package_events_insert_policy"
on public.package_events
for insert
with check (
  auth.role() = 'authenticated'
  and (source_user_id is null or source_user_id = auth.uid())
  and exists (
    select 1
    from public.packages p
    where p.id = package_events.package_id
      and (
        p.created_by = auth.uid()
        or p.current_holder_user_id = auth.uid()
        or public.current_user_type() = 'ngo'
      )
  )
);

-- relay_receipts policies
drop policy if exists "relay_receipts_select_policy" on public.relay_receipts;
create policy "relay_receipts_select_policy"
on public.relay_receipts
for select
using (
  auth.role() = 'authenticated'
  and (
    sender_user_id = auth.uid()
    or receiver_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
    or exists (
      select 1
      from public.packages p
      where p.id = relay_receipts.package_id
        and p.created_by = auth.uid()
    )
  )
);

drop policy if exists "relay_receipts_insert_policy" on public.relay_receipts;
create policy "relay_receipts_insert_policy"
on public.relay_receipts
for insert
with check (
  auth.role() = 'authenticated'
  and (
    sender_user_id = auth.uid()
    or receiver_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
  )
);

-- package_verifications policies
drop policy if exists "package_verifications_select_policy" on public.package_verifications;
create policy "package_verifications_select_policy"
on public.package_verifications
for select
using (
  auth.role() = 'authenticated'
  and (
    helper_user_id = auth.uid()
    or ngo_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
    or exists (
      select 1
      from public.packages p
      where p.id = package_verifications.package_id
        and p.created_by = auth.uid()
    )
  )
);

drop policy if exists "package_verifications_insert_policy" on public.package_verifications;
create policy "package_verifications_insert_policy"
on public.package_verifications
for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.current_user_type() = 'ngo'
    or (public.current_user_type() = 'helper' and helper_user_id = auth.uid())
  )
);

drop policy if exists "package_verifications_update_policy" on public.package_verifications;
create policy "package_verifications_update_policy"
on public.package_verifications
for update
using (
  auth.role() = 'authenticated'
  and (
    public.current_user_type() = 'ngo'
    or helper_user_id = auth.uid()
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.current_user_type() = 'ngo'
    or helper_user_id = auth.uid()
  )
);

-- package_sync_attempts policies
drop policy if exists "package_sync_attempts_select_policy" on public.package_sync_attempts;
create policy "package_sync_attempts_select_policy"
on public.package_sync_attempts
for select
using (
  auth.role() = 'authenticated'
  and (
    attempted_by_user_id = auth.uid()
    or public.current_user_type() = 'ngo'
  )
);

drop policy if exists "package_sync_attempts_insert_policy" on public.package_sync_attempts;
create policy "package_sync_attempts_insert_policy"
on public.package_sync_attempts
for insert
with check (
  auth.role() = 'authenticated'
  and (attempted_by_user_id is null or attempted_by_user_id = auth.uid())
);

-- helper + ngo access to emergency requests feed
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'help_requests'
  ) then
    execute 'alter table public.help_requests add column if not exists verification_status text not null default ''pending''';
    execute 'alter table public.help_requests add column if not exists verified_by_client_at timestamptz';

    execute 'alter table public.help_requests enable row level security';
    execute 'grant select, update on public.help_requests to authenticated';

    execute 'drop policy if exists "help_requests_helper_ngo_select" on public.help_requests';
    execute '
      create policy "help_requests_helper_ngo_select"
      on public.help_requests
      for select
      using (
        auth.role() = ''authenticated''
        and public.current_user_type() in (''helper'', ''ngo'')
      )
    ';

    execute 'drop policy if exists "help_requests_client_select_own" on public.help_requests';
    execute '
      create policy "help_requests_client_select_own"
      on public.help_requests
      for select
      using (
        auth.role() = ''authenticated''
        and (
          public.current_user_type() in (''helper'', ''ngo'')
          or client_id = auth.uid()
        )
      )
    ';

    execute 'drop policy if exists "help_requests_helper_ngo_update_status" on public.help_requests';
    execute '
      create policy "help_requests_helper_ngo_update_status"
      on public.help_requests
      for update
      using (
        auth.role() = ''authenticated''
        and public.current_user_type() in (''helper'', ''ngo'')
      )
      with check (
        auth.role() = ''authenticated''
        and public.current_user_type() in (''helper'', ''ngo'')
      )
    ';

    execute '
      create or replace function public.prevent_helper_resolve_help_requests()
      returns trigger
      language plpgsql
      as $helper_guard$
      begin
        if public.current_user_type() = ''helper''
          and new.status = ''resolved''
          and coalesce(old.status, '''') <> ''resolved'' then
          raise exception ''Helper cannot resolve requests directly. Request NGO resolution.'';
        end if;
        return new;
      end;
      $helper_guard$
    ';

    execute 'drop trigger if exists "trg_help_requests_prevent_helper_resolve" on public.help_requests';
    execute '
      create trigger "trg_help_requests_prevent_helper_resolve"
      before update on public.help_requests
      for each row
      execute procedure public.prevent_helper_resolve_help_requests()
    ';
  end if;
end;
$$;
