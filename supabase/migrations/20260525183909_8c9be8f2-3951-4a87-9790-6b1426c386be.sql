CREATE TABLE IF NOT EXISTS public.user_feed_dedup (
  user_id UUID PRIMARY KEY,
  seen_ids UUID[] NOT NULL DEFAULT '{}',
  cycle_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_feed_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ufd_self_select" ON public.user_feed_dedup FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ufd_self_insert" ON public.user_feed_dedup FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "ufd_self_update" ON public.user_feed_dedup FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ufd_self_delete" ON public.user_feed_dedup FOR DELETE USING (user_id = auth.uid());