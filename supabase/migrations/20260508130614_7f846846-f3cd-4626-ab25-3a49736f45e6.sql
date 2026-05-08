
-- Phase 6: app_settings, recommendation_settings, attribution toggles

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_settings enable row level security;
create policy "app_settings_select_all" on public.app_settings for select using (true);
create policy "app_settings_write_perm" on public.app_settings for all
  using (has_permission(auth.uid(), 'settings.edit'))
  with check (has_permission(auth.uid(), 'settings.edit'));

create table if not exists public.recommendation_settings (
  id boolean primary key default true,
  weights jsonb not null default '{
    "recency": 1.0,
    "approval_freshness": 0.8,
    "editorial_boost": 1.2,
    "suggest_count": 1.5,
    "leaderboard_presence": 1.0,
    "in_app_trending": 0.7,
    "diversity_penalty": 0.5,
    "user_affinity": 1.0
  }'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint singleton check (id = true)
);
alter table public.recommendation_settings enable row level security;
create policy "rs_select_all" on public.recommendation_settings for select using (true);
create policy "rs_write_perm" on public.recommendation_settings for all
  using (has_permission(auth.uid(), 'settings.edit'))
  with check (has_permission(auth.uid(), 'settings.edit'));

insert into public.recommendation_settings (id) values (true) on conflict do nothing;

-- Default attribution toggles
insert into public.app_settings (key, value) values
  ('attribution.video_detail_chip', 'true'::jsonb),
  ('attribution.creator_contributors', 'true'::jsonb),
  ('attribution.leaderboard_facet', 'false'::jsonb)
on conflict (key) do nothing;
