CREATE TABLE IF NOT EXISTS public.batch_flush_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  action_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  fail_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_flush_log_created_at ON public.batch_flush_log (created_at DESC);

ALTER TABLE public.batch_flush_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY bfl_insert_self
  ON public.batch_flush_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bfl_select_self_or_admin
  ON public.batch_flush_log FOR SELECT
  USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'settings.edit'));

-- Default flush interval (10 minutes)
INSERT INTO public.app_settings (key, value)
VALUES ('action_flush_interval_ms', to_jsonb(600000))
ON CONFLICT (key) DO NOTHING;