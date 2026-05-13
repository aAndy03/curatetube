
-- Status enum for reports
do $$ begin
  create type public.report_status as enum ('open','reviewed','dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null,
  reporter_id uuid not null,
  reason_text text not null check (char_length(reason_text) <= 1500),
  status public.report_status not null default 'open',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, video_id)
);

create index if not exists idx_reports_video on public.reports(video_id);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_created on public.reports(created_at desc);

drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

alter table public.reports enable row level security;

drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self on public.reports
for insert to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists reports_select_self_or_staff on public.reports;
create policy reports_select_self_or_staff on public.reports
for select to authenticated
using (auth.uid() = reporter_id or public.has_permission(auth.uid(), 'report.view'));

drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff on public.reports
for update to authenticated
using (public.has_permission(auth.uid(), 'report.review'))
with check (public.has_permission(auth.uid(), 'report.review'));

-- Permissions: ensure report.view exists and grant both to admin role
insert into public.permissions(key, area, description)
values ('report.view', 'reports', 'View the moderation reports panel.')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_key)
select r.id, k.key
from public.roles r
cross join (values ('report.view'), ('report.review')) as k(key)
where r.name = 'admin'
on conflict do nothing;
