
-- ============ ENUMS ============
do $$ begin
  create type public.video_status as enum ('pending','approved','rejected','removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_status as enum ('pending','approved','rejected','duplicate','invalid');
exception when duplicate_object then null; end $$;

-- ============ CREATORS ============
create table if not exists public.creators (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text not null unique,
  title text not null,
  handle text,
  thumbnail_url text,
  description text,
  country text,
  subscriber_count bigint,
  video_count bigint,
  channel_url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creators_title_idx on public.creators (lower(title));

-- ============ VIDEOS ============
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null unique,
  creator_id uuid references public.creators(id) on delete set null,
  title text not null,
  description text,
  thumbnail_url text,
  duration_seconds integer,
  published_at timestamptz,
  view_count bigint,
  like_count bigint,
  language text,
  status public.video_status not null default 'pending',
  submission_count integer not null default 0,
  suggest_count integer not null default 0,
  first_submitted_at timestamptz not null default now(),
  last_metadata_fetch timestamptz,
  curator_note text,
  content_warnings text[] not null default '{}',
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists videos_status_idx on public.videos (status);
create index if not exists videos_creator_idx on public.videos (creator_id);
create index if not exists videos_published_idx on public.videos (published_at desc);

-- ============ SUBMISSIONS ============
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid not null references auth.users(id) on delete set null,
  youtube_url text not null,
  youtube_id text,
  video_id uuid references public.videos(id) on delete set null,
  status public.submission_status not null default 'pending',
  anonymous boolean not null default false,
  note text,
  content_warnings text[] not null default '{}',
  suggested_categories text[] not null default '{}',
  suggested_tags text[] not null default '{}',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_status_idx on public.submissions (status);
create index if not exists submissions_submitter_idx on public.submissions (submitter_id);
create index if not exists submissions_youtube_id_idx on public.submissions (youtube_id);

-- ============ VIDEO_SUBMITTERS ============
create table if not exists public.video_submitters (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  anonymous boolean not null default false,
  first_submitted_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

-- ============ CATEGORIES ============
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  parent_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_categories (
  video_id uuid not null references public.videos(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (video_id, category_id)
);

-- ============ TAGS ============
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.video_tags (
  video_id uuid not null references public.videos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (video_id, tag_id)
);

-- ============ RATE LIMITS ============
create table if not exists public.rate_limit_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_user_action_idx on public.rate_limit_events (user_id, action, created_at desc);

-- ============ TRIGGERS ============
drop trigger if exists trg_creators_updated on public.creators;
create trigger trg_creators_updated before update on public.creators
  for each row execute function public.set_updated_at();

drop trigger if exists trg_videos_updated on public.videos;
create trigger trg_videos_updated before update on public.videos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_submissions_updated on public.submissions;
create trigger trg_submissions_updated before update on public.submissions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ============ RLS ============
alter table public.creators enable row level security;
alter table public.videos enable row level security;
alter table public.submissions enable row level security;
alter table public.video_submitters enable row level security;
alter table public.categories enable row level security;
alter table public.video_categories enable row level security;
alter table public.tags enable row level security;
alter table public.video_tags enable row level security;
alter table public.rate_limit_events enable row level security;

-- creators: public read; staff write
create policy creators_select_all on public.creators for select using (true);
create policy creators_insert_auth on public.creators for insert
  with check (auth.uid() is not null);
create policy creators_update_perm on public.creators for update
  using (public.has_permission(auth.uid(), 'creator.edit'));
create policy creators_delete_perm on public.creators for delete
  using (public.has_permission(auth.uid(), 'creator.block'));

-- videos: public read approved; staff read all; staff write
create policy videos_select_public on public.videos for select
  using (status = 'approved' or public.has_permission(auth.uid(), 'submission.view_queue'));
create policy videos_insert_auth on public.videos for insert
  with check (auth.uid() is not null);
create policy videos_update_perm on public.videos for update
  using (
    public.has_permission(auth.uid(), 'video.edit_metadata')
    or public.has_permission(auth.uid(), 'submission.approve')
    or public.has_permission(auth.uid(), 'submission.reject')
  );
create policy videos_delete_perm on public.videos for delete
  using (public.has_permission(auth.uid(), 'video.delete'));

-- submissions
create policy submissions_select_self_or_queue on public.submissions for select
  using (
    submitter_id = auth.uid()
    or public.has_permission(auth.uid(), 'submission.view_queue')
  );
create policy submissions_insert_self on public.submissions for insert
  with check (
    auth.uid() = submitter_id
    and public.has_permission(auth.uid(), 'submission.create')
  );
create policy submissions_update_self_or_mod on public.submissions for update
  using (
    (submitter_id = auth.uid() and public.has_permission(auth.uid(), 'submission.edit_own'))
    or public.has_permission(auth.uid(), 'submission.approve')
    or public.has_permission(auth.uid(), 'submission.reject')
  );

-- video_submitters
create policy vs_select_all on public.video_submitters for select using (true);
create policy vs_insert_self on public.video_submitters for insert
  with check (auth.uid() = user_id);

-- categories
create policy categories_select_all on public.categories for select using (true);
create policy categories_insert_perm on public.categories for insert
  with check (public.has_permission(auth.uid(), 'category.create'));
create policy categories_update_perm on public.categories for update
  using (public.has_permission(auth.uid(), 'category.edit'));
create policy categories_delete_perm on public.categories for delete
  using (public.has_permission(auth.uid(), 'category.delete'));

create policy vc_select_all on public.video_categories for select using (true);
create policy vc_write_perm on public.video_categories for all
  using (public.has_permission(auth.uid(), 'video.edit_metadata'))
  with check (public.has_permission(auth.uid(), 'video.edit_metadata'));

-- tags
create policy tags_select_all on public.tags for select using (true);
create policy tags_insert_auth on public.tags for insert
  with check (auth.uid() is not null);
create policy tags_update_perm on public.tags for update
  using (public.has_permission(auth.uid(), 'tag.edit'));
create policy tags_delete_perm on public.tags for delete
  using (public.has_permission(auth.uid(), 'tag.delete'));

create policy vt_select_all on public.video_tags for select using (true);
create policy vt_write_perm on public.video_tags for all
  using (public.has_permission(auth.uid(), 'video.edit_metadata'))
  with check (public.has_permission(auth.uid(), 'video.edit_metadata'));

-- rate_limit_events: insert own; read own; staff read all
create policy rle_select_self on public.rate_limit_events for select
  using (user_id = auth.uid() or public.has_permission(auth.uid(), 'audit.view'));
create policy rle_insert_self on public.rate_limit_events for insert
  with check (auth.uid() = user_id);

-- ============ DEFAULT PERMISSION GRANTS ============
-- Grant submission.create, suggest.cast to 'member' role
do $$
declare
  member_id uuid;
  contributor_id uuid;
  admin_id uuid;
  k text;
begin
  select id into member_id from public.roles where name = 'member';
  select id into admin_id from public.roles where name = 'admin';

  if member_id is not null then
    foreach k in array array['submission.create','suggest.cast'] loop
      insert into public.role_permissions(role_id, permission_key)
      values (member_id, k) on conflict do nothing;
    end loop;
  end if;

  if admin_id is not null then
    foreach k in array array[
      'submission.create','submission.create_batch','submission.view_queue',
      'submission.approve','submission.reject','submission.bulk_moderate',
      'video.edit_metadata','video.delete','video.feature',
      'creator.edit','creator.block',
      'category.create','category.edit','category.delete',
      'tag.create','tag.edit','tag.delete','tag_suggestion.review',
      'audit.view','user.view','user.assign_role',
      'suggest.cast'
    ] loop
      insert into public.role_permissions(role_id, permission_key)
      values (admin_id, k) on conflict do nothing;
    end loop;
  end if;

  -- Create Contributor role if not exists
  if not exists (select 1 from public.roles where name = 'contributor') then
    insert into public.roles(name, description, is_system, color)
    values ('contributor','Trusted contributor — submit videos and cast suggests', true, null)
    returning id into contributor_id;
    foreach k in array array[
      'submission.create','submission.create_batch','submission.edit_own','submission.delete_own',
      'suggest.cast','tag.create'
    ] loop
      insert into public.role_permissions(role_id, permission_key)
      values (contributor_id, k) on conflict do nothing;
    end loop;
  end if;
end $$;

-- ============ AUDIT LOG TIGHTENING ============
-- Ensure audit_log cannot be tampered: no update policy needed (none exists)
