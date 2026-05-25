
-- Restrict direct video inserts to pending status (admin client bypasses RLS for approvals)
DROP POLICY IF EXISTS videos_insert_auth ON public.videos;
CREATE POLICY videos_insert_auth ON public.videos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND status = 'pending');

-- Restrict direct tag inserts: only user-sourced, unapproved, non-platform, secondary tier
DROP POLICY IF EXISTS tags_insert_auth ON public.tags;
CREATE POLICY tags_insert_auth ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND source = 'user'
    AND tier = 'secondary'
    AND is_platform_tag = false
    AND approved = false
  );
