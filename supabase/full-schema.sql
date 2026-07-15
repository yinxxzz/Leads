create table if not exists public.allocation_record_cache (
  channel text not null check (channel in ('bpo', 'tmk', 'cc')),
  dt date not null,
  user_id text not null,
  rank integer not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists allocation_record_cache_user_date_idx
  on public.allocation_record_cache (user_id, dt desc, channel);

create table if not exists public.allocation_cache_refreshes (
  channel text not null check (channel in ('bpo', 'tmk', 'cc')),
  dt date not null,
  status text not null check (status in ('success', 'failed')),
  row_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  error_message text,
  primary key (channel, dt)
);

alter table public.allocation_record_cache enable row level security;
alter table public.allocation_cache_refreshes enable row level security;
