
-- harden helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- revoke direct execute on definer functions (they're still callable from policies/triggers)
revoke execute on function public.has_permission(uuid, text) from public, anon, authenticated;
revoke execute on function public.has_role(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- seed system roles
insert into public.roles (name, description, is_system) values
  ('owner','Full access. Inherits every permission.', true),
  ('admin','High-trust staff with most permissions.', true),
  ('contributor','May submit videos and cast suggestions.', true),
  ('member','Default role for every signed-in user.', true)
on conflict (name) do nothing;

-- seed permissions catalog
insert into public.permissions (key, area, description) values
  ('submission.create','submissions','Submit new videos'),
  ('submission.create_batch','submissions','Submit multiple videos at once'),
  ('submission.edit_own','submissions','Edit own submissions'),
  ('submission.delete_own','submissions','Delete own submissions'),
  ('submission.view_queue','moderation','View pending submission queue'),
  ('submission.approve','moderation','Approve submissions'),
  ('submission.reject','moderation','Reject submissions'),
  ('submission.bulk_moderate','moderation','Bulk moderate submissions'),
  ('video.edit_metadata','library','Edit video metadata'),
  ('video.delete','library','Delete videos'),
  ('video.feature','library','Feature a video'),
  ('video.merge_duplicates','library','Merge duplicate videos'),
  ('creator.edit','library','Edit creators'),
  ('creator.merge','library','Merge creators'),
  ('creator.block','library','Block creators'),
  ('category.create','taxonomy','Create categories'),
  ('category.edit','taxonomy','Edit categories'),
  ('category.delete','taxonomy','Delete categories'),
  ('tag.create','taxonomy','Create tags'),
  ('tag.edit','taxonomy','Edit tags'),
  ('tag.delete','taxonomy','Delete tags'),
  ('tag_suggestion.review','taxonomy','Review tag/category suggestions'),
  ('section.create','feed','Create feed sections'),
  ('section.edit','feed','Edit feed sections'),
  ('section.delete','feed','Delete feed sections'),
  ('section.reorder','feed','Reorder feed sections'),
  ('feed_template.manage','feed','Manage global feed templates'),
  ('suggest.cast','community','Cast a Suggest on a video'),
  ('leaderboard.configure','leaderboard','Configure leaderboard tiers and cadence'),
  ('leaderboard.snapshot_manage','leaderboard','Manage leaderboard snapshots'),
  ('user.view','users','View user list'),
  ('user.suspend','users','Suspend users'),
  ('user.assign_role','users','Assign roles to users'),
  ('role.create','roles','Create roles'),
  ('role.edit','roles','Edit roles'),
  ('role.delete','roles','Delete roles'),
  ('role.set_permissions','roles','Assign permissions to roles'),
  ('rules.edit_submission_limits','rules','Edit submission rate limits'),
  ('rules.edit_suggest_limits','rules','Edit suggest rate limits'),
  ('report.review','reports','Review user reports'),
  ('notification.broadcast','notifications','Broadcast notifications'),
  ('audit.view','system','View internal audit log'),
  ('audit.view_identity','system','Resolve actor identity behind anonymous audit entries'),
  ('audit.modify_visibility','system','Change visibility of an audit entry'),
  ('settings.edit','system','Edit application settings')
on conflict (key) do nothing;

-- admin defaults: most permissions except Owner-only forensic ones
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.name = 'admin'
  and p.key not in ('audit.view_identity','audit.modify_visibility','role.delete','settings.edit')
on conflict do nothing;

-- contributor defaults
insert into public.role_permissions (role_id, permission_key)
select r.id, k
from public.roles r,
     (values
        ('submission.create'),
        ('submission.create_batch'),
        ('submission.edit_own'),
        ('submission.delete_own'),
        ('suggest.cast')
     ) as v(k)
where r.name = 'contributor'
on conflict do nothing;

-- member defaults
insert into public.role_permissions (role_id, permission_key)
select r.id, 'suggest.cast'
from public.roles r
where r.name = 'member'
on conflict do nothing;
