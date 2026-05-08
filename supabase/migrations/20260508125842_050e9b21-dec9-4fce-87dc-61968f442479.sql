
create table public.feed_sections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  template_id uuid references public.feed_sections(id) on delete set null,
  name text not null,
  source text not null check (source in (
    'latest_approved','top_suggested','top_submitted',
    'recent_in_category','by_creator','leaderboard_tier','random_pick'
  )),
  filters jsonb not null default '{}'::jsonb,
  sort text not null default 'recent' check (sort in ('recent','suggest','submission','random','rank')),
  layout text not null default 'grid' check (layout in ('grid','row','compact')),
  size int not null default 12 check (size between 1 and 60),
  refresh_minutes int not null default 30 check (refresh_minutes > 0),
  cycle jsonb not null default '{"keep_seen_ratio":0.4,"inject_new_ratio":0.6,"cycle_window_hours":24}'::jsonb,
  position int not null default 0,
  is_template boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fs_owner_pos on public.feed_sections (owner_id, position);
create index fs_template on public.feed_sections (is_template) where is_template;
alter table public.feed_sections enable row level security;

create policy fs_select_own_or_template on public.feed_sections for select
  using (is_template or owner_id = auth.uid());
create policy fs_insert_self on public.feed_sections for insert
  with check (
    (owner_id = auth.uid() and not is_template) or
    (is_template and public.has_permission(auth.uid(), 'feed.manage_templates'))
  );
create policy fs_update_self on public.feed_sections for update
  using (
    (owner_id = auth.uid() and not is_template) or
    (is_template and public.has_permission(auth.uid(), 'feed.manage_templates'))
  );
create policy fs_delete_self on public.feed_sections for delete
  using (
    (owner_id = auth.uid() and not is_template) or
    (is_template and public.has_permission(auth.uid(), 'feed.manage_templates'))
  );
create trigger fs_updated_at before update on public.feed_sections
  for each row execute function public.set_updated_at();

create table public.user_feed_state (
  user_id uuid not null,
  section_id uuid not null references public.feed_sections(id) on delete cascade,
  session_seed bigint not null,
  last_cycled_at timestamptz not null default now(),
  primary key (user_id, section_id)
);
alter table public.user_feed_state enable row level security;
create policy ufs_self on public.user_feed_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Permissions
insert into public.permissions (key, area, description) values
  ('feed.manage_templates', 'feed', 'Create and edit shared feed templates')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'feed.manage_templates' from public.roles r where r.name = 'admin'
on conflict do nothing;

-- Seed templates
insert into public.feed_sections (owner_id, name, source, sort, layout, size, refresh_minutes, position, is_template)
values
  (null, 'Fresh approvals',     'latest_approved', 'recent',     'grid',    12, 30, 1, true),
  (null, 'Most suggested',      'top_suggested',   'suggest',    'grid',    12, 60, 2, true),
  (null, 'Recently submitted',  'top_submitted',   'submission', 'row',      8, 30, 3, true)
on conflict do nothing;
