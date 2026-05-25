
-- 1) profiles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_authed ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 2) user_roles: restrict SELECT to authenticated
DROP POLICY IF EXISTS ur_select_all ON public.user_roles;
CREATE POLICY ur_select_authed ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- 3) role_permissions
DROP POLICY IF EXISTS rp_select_all ON public.role_permissions;
CREATE POLICY rp_select_authed ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- 4) app_settings
DROP POLICY IF EXISTS app_settings_select_all ON public.app_settings;
CREATE POLICY app_settings_select_authed ON public.app_settings
  FOR SELECT TO authenticated USING (true);

-- 5) recommendation_settings
DROP POLICY IF EXISTS rs_select_all ON public.recommendation_settings;
CREATE POLICY rs_select_authed ON public.recommendation_settings
  FOR SELECT TO authenticated USING (true);

-- 6) creators INSERT: require creator.edit permission (or video.edit_metadata)
DROP POLICY IF EXISTS creators_insert_auth ON public.creators;
CREATE POLICY creators_insert_perm ON public.creators
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'creator.edit')
    OR public.has_permission(auth.uid(), 'video.edit_metadata')
    OR public.has_permission(auth.uid(), 'submission.approve')
  );

-- 7) video_submitters: hide user_id for anonymous rows
DROP POLICY IF EXISTS vs_select_all ON public.video_submitters;
CREATE POLICY vs_select_public_non_anon ON public.video_submitters
  FOR SELECT TO anon, authenticated
  USING (
    anonymous = false
    OR user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'audit.view')
  );

-- 8) video_suggestions: hide user_id for anonymous rows
DROP POLICY IF EXISTS vsg_select_all ON public.video_suggestions;
CREATE POLICY vsg_select_public_non_anon ON public.video_suggestions
  FOR SELECT TO anon, authenticated
  USING (
    anonymous = false
    OR user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'audit.view')
  );

-- 9) realtime.messages: scope notification topic subscriptions to recipient
-- Topic convention used by app should be 'notifications:<user_id>'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS rt_notifications_self ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY rt_notifications_self ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          -- Only allow subscribing to your own notification topic; allow
          -- other non-notification topics (delegated to other policies).
          (realtime.topic() NOT LIKE 'notifications:%')
          OR (realtime.topic() = 'notifications:' || auth.uid()::text)
        )
    $POL$;
  END IF;
END$$;
