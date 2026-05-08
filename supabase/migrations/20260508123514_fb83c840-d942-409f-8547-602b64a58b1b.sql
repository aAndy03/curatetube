
-- Personal lists
create type public.user_list_status as enum ('wishlist','liked','disliked','watched');

create table public.user_video_status (
  user_id uuid not null,
  video_id uuid not null references public.videos(id) on delete cascade,
  status public.user_list_status not null,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id, status)
);
create index on public.user_video_status (user_id, status, created_at desc);
create index on public.user_video_status (video_id, status);

alter table public.user_video_status enable row level security;
create policy uvs_select_self on public.user_video_status for select using (auth.uid() = user_id);
create policy uvs_insert_self on public.user_video_status for insert with check (auth.uid() = user_id);
create policy uvs_delete_self on public.user_video_status for delete using (auth.uid() = user_id);

-- Suggest casts (distinct from likes)
create table public.video_suggestions (
  user_id uuid not null,
  video_id uuid not null references public.videos(id) on delete cascade,
  anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index on public.video_suggestions (video_id);
create index on public.video_suggestions (user_id, created_at desc);

alter table public.video_suggestions enable row level security;
create policy vsg_select_all on public.video_suggestions for select using (true);
create policy vsg_insert_self on public.video_suggestions for insert with check (auth.uid() = user_id);
create policy vsg_delete_self on public.video_suggestions for delete using (auth.uid() = user_id);

create or replace function public.video_suggestions_count_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set suggest_count = suggest_count + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set suggest_count = greatest(0, suggest_count - 1) where id = old.video_id;
    return old;
  end if;
  return null;
end $$;
create trigger trg_vsg_count_ins after insert on public.video_suggestions
  for each row execute function public.video_suggestions_count_sync();
create trigger trg_vsg_count_del after delete on public.video_suggestions
  for each row execute function public.video_suggestions_count_sync();

-- Notifications
create type public.notification_type as enum (
  'submission_approved','submission_rejected','role_changed',
  'wishlisted_creator_new_video','video_entered_top_n','suggestion_reached_tier',
  'admin_broadcast','audit_mode_ack','deletion_grace_reminder'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type public.notification_type not null,
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy notif_select_self on public.notifications for select using (auth.uid() = user_id);
create policy notif_update_self on public.notifications for update using (auth.uid() = user_id);
create policy notif_delete_self on public.notifications for delete using (auth.uid() = user_id);
create policy notif_insert_perm on public.notifications for insert
  with check (auth.uid() = user_id or public.has_permission(auth.uid(), 'notification.broadcast'));

alter publication supabase_realtime add table public.notifications;

-- Account deletion requests
create table public.account_deletion_requests (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  reason text,
  cancel_token text not null unique,
  cancelled_at timestamptz,
  finalized_at timestamptz
);

alter table public.account_deletion_requests enable row level security;
create policy adr_select_self on public.account_deletion_requests for select
  using (auth.uid() = user_id or public.has_permission(auth.uid(),'audit.view'));
create policy adr_insert_self on public.account_deletion_requests for insert with check (auth.uid() = user_id);
create policy adr_update_self on public.account_deletion_requests for update using (auth.uid() = user_id);
create policy adr_delete_self on public.account_deletion_requests for delete using (auth.uid() = user_id);

-- New permissions
insert into public.permissions (key, area, description) values
  ('suggest.cast','suggest','Cast a suggest on a video'),
  ('list.manage','lists','Manage own personal lists'),
  ('notification.broadcast','notifications','Send admin broadcast notifications'),
  ('audit.view_identity','audit','Resolve identity behind anonymous audit entries'),
  ('account.delete_self','account','Request own account deletion')
on conflict (key) do nothing;

-- Grant suggest/list/delete to member; broadcast & view_identity to admin
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('suggest.cast'),('list.manage'),('account.delete_self')) as p(key)
where r.name in ('member','contributor','admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('notification.broadcast'),('audit.view_identity')) as p(key)
where r.name = 'admin'
on conflict do nothing;
