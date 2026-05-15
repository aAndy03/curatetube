-- Phase 6: Broadcast archive
CREATE TABLE public.broadcast_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  link text,
  category text NOT NULL DEFAULT 'general',
  expires_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX broadcast_notifications_created_at_idx ON public.broadcast_notifications(created_at DESC);
CREATE INDEX broadcast_notifications_status_idx ON public.broadcast_notifications(archived_at, expires_at);
CREATE INDEX broadcast_notifications_category_idx ON public.broadcast_notifications(category);

ALTER TABLE public.broadcast_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY bn_select_all_authed ON public.broadcast_notifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY bn_insert_perm ON public.broadcast_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'notification.broadcast'));

CREATE POLICY bn_update_perm ON public.broadcast_notifications
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'notification.broadcast')
    OR public.has_permission(auth.uid(), 'broadcasts.archive')
  );

CREATE POLICY bn_delete_perm ON public.broadcast_notifications
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'broadcasts.delete'));

CREATE TRIGGER broadcast_notifications_set_updated_at
  BEFORE UPDATE ON public.broadcast_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read tracking
CREATE TABLE public.user_broadcast_reads (
  user_id uuid NOT NULL,
  broadcast_id uuid NOT NULL REFERENCES public.broadcast_notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, broadcast_id)
);
CREATE INDEX user_broadcast_reads_broadcast_idx ON public.user_broadcast_reads(broadcast_id);

ALTER TABLE public.user_broadcast_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY ubr_select_self_or_staff ON public.user_broadcast_reads
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'notification.broadcast'));

CREATE POLICY ubr_insert_self ON public.user_broadcast_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY ubr_delete_self ON public.user_broadcast_reads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Permissions
INSERT INTO public.permissions(key, area, description) VALUES
  ('broadcasts.archive', 'broadcasts', 'Archive/restore broadcast notifications'),
  ('broadcasts.delete', 'broadcasts', 'Permanently delete broadcast notifications')
ON CONFLICT (key) DO NOTHING;

-- Grant new perms to roles that already have notification.broadcast
INSERT INTO public.role_permissions(role_id, permission_key)
SELECT rp.role_id, p.key
FROM public.role_permissions rp
CROSS JOIN (VALUES ('broadcasts.archive'), ('broadcasts.delete')) AS p(key)
WHERE rp.permission_key = 'notification.broadcast'
ON CONFLICT DO NOTHING;

-- Default categories
INSERT INTO public.app_settings(key, value)
VALUES ('broadcast_categories', '["general","maintenance","announcement","release","incident"]'::jsonb)
ON CONFLICT (key) DO NOTHING;