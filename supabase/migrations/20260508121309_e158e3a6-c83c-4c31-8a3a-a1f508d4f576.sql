
-- enums
create type public.audit_privacy_mode as enum ('anonymous','public');
create type public.audit_visibility as enum ('internal','staff','public');

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text unique,
  avatar_url text,
  audit_privacy_mode public.audit_privacy_mode not null default 'anonymous',
  recommendation_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- roles
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.roles enable row level security;

-- permissions catalog
create table public.permissions (
  key text primary key,
  area text not null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.permissions enable row level security;

-- role_permissions
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
alter table public.role_permissions enable row level security;

-- user_roles
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
alter table public.user_roles enable row level security;

-- security-definer permission check (Owner inherits everything)
create or replace function public.has_permission(_user_id uuid, _key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _user_id
      and (
        r.name = 'owner'
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission_key = _key
        )
      )
  )
$$;

create or replace function public.has_role(_user_id uuid, _role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _user_id and r.name = _role
  )
$$;

-- audit log
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_display_snapshot text,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  ip_hash text,
  visibility public.audit_visibility not null default 'internal',
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index audit_log_target_idx on public.audit_log(target_type, target_id);
create index audit_log_actor_idx on public.audit_log(actor_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

-- new user trigger: profile + first-user-Owner + default member role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_role_id uuid;
  member_role_id uuid;
  has_owner boolean;
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );

  select id into owner_role_id from public.roles where name = 'owner';
  select id into member_role_id from public.roles where name = 'member';
  select exists(
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'owner'
  ) into has_owner;

  if owner_role_id is not null and not has_owner then
    insert into public.user_roles (user_id, role_id, granted_by)
    values (new.id, owner_role_id, new.id);
  end if;

  if member_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, member_role_id)
    on conflict do nothing;
  end if;

  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS policies
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);

create policy "roles_select_all" on public.roles for select using (true);
create policy "roles_insert_perm" on public.roles for insert with check (public.has_permission(auth.uid(),'role.create'));
create policy "roles_update_perm" on public.roles for update using (public.has_permission(auth.uid(),'role.edit'));
create policy "roles_delete_perm" on public.roles for delete using (public.has_permission(auth.uid(),'role.delete') and not is_system);

create policy "permissions_select_all" on public.permissions for select using (true);

create policy "rp_select_all" on public.role_permissions for select using (true);
create policy "rp_insert_perm" on public.role_permissions for insert with check (public.has_permission(auth.uid(),'role.set_permissions'));
create policy "rp_delete_perm" on public.role_permissions for delete using (public.has_permission(auth.uid(),'role.set_permissions'));

create policy "ur_select_all" on public.user_roles for select using (true);
create policy "ur_insert_perm" on public.user_roles for insert with check (public.has_permission(auth.uid(),'user.assign_role'));
create policy "ur_delete_perm" on public.user_roles for delete using (public.has_permission(auth.uid(),'user.assign_role'));

create policy "audit_select_staff" on public.audit_log for select using (public.has_permission(auth.uid(),'audit.view'));
create policy "audit_insert_auth" on public.audit_log for insert with check (auth.uid() is not null);
