
-- Leaderboard tiers
create table public.leaderboard_tiers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  size int not null check (size > 0 and size <= 1000),
  refresh_minutes int not null default 60 check (refresh_minutes > 0),
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leaderboard_tiers enable row level security;
create policy lt_select_all on public.leaderboard_tiers for select using (true);
create policy lt_write_perm on public.leaderboard_tiers for all
  using (public.has_permission(auth.uid(), 'leaderboard.manage'))
  with check (public.has_permission(auth.uid(), 'leaderboard.manage'));
create trigger lt_updated_at before update on public.leaderboard_tiers
  for each row execute function public.set_updated_at();

-- Snapshots
create table public.leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.leaderboard_tiers(id) on delete cascade,
  scope_type text not null check (scope_type in ('global','category','language','creator')),
  scope_value text,
  created_at timestamptz not null default now(),
  next_refresh_at timestamptz not null
);
create index ls_lookup on public.leaderboard_snapshots
  (tier_id, scope_type, coalesce(scope_value,''), created_at desc);
alter table public.leaderboard_snapshots enable row level security;
create policy ls_select_all on public.leaderboard_snapshots for select using (true);
create policy ls_write_perm on public.leaderboard_snapshots for all
  using (public.has_permission(auth.uid(), 'leaderboard.manage'))
  with check (public.has_permission(auth.uid(), 'leaderboard.manage'));

-- Entries
create table public.leaderboard_entries (
  snapshot_id uuid not null references public.leaderboard_snapshots(id) on delete cascade,
  rank int not null,
  video_id uuid not null references public.videos(id) on delete cascade,
  score numeric not null,
  suggest_count int not null default 0,
  submission_count int not null default 0,
  prev_rank int,
  primary key (snapshot_id, rank)
);
alter table public.leaderboard_entries enable row level security;
create policy le_select_all on public.leaderboard_entries for select using (true);
create policy le_write_perm on public.leaderboard_entries for all
  using (public.has_permission(auth.uid(), 'leaderboard.manage'))
  with check (public.has_permission(auth.uid(), 'leaderboard.manage'));

-- Permissions
insert into public.permissions (key, area, description) values
  ('leaderboard.manage', 'leaderboard', 'Manage leaderboard tiers and trigger snapshots')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'leaderboard.manage' from public.roles r where r.name = 'admin'
on conflict do nothing;

-- Seed default tiers
insert into public.leaderboard_tiers (slug, name, size, refresh_minutes, sort_order) values
  ('top10', 'Top 10', 10, 30, 1),
  ('top30', 'Top 30', 30, 60, 2),
  ('top100', 'Top 100', 100, 240, 3),
  ('top500', 'Top 500', 500, 1440, 4)
on conflict (slug) do nothing;
