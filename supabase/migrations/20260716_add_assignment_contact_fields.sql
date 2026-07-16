alter table public.allocation_record_cache
  add column if not exists has_actual_assignment boolean not null default false,
  add column if not exists sales_ldap text,
  add column if not exists assigned_at timestamptz,
  add column if not exists has_called boolean not null default false,
  add column if not exists has_connected boolean not null default false,
  add column if not exists call_count integer not null default 0,
  add column if not exists latest_touch_at timestamptz;

create index if not exists allocation_record_cache_actual_assignment_idx
  on public.allocation_record_cache (user_id, has_actual_assignment, dt desc);
