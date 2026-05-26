
-- =========================================================================
-- Plan 5 Phase 1 — AI orchestration schema
-- =========================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.ai_job_type AS ENUM ('categorise','tag_primary','tag_secondary','tag_rest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_job_scope AS ENUM ('user_submit','admin_single','admin_batch','admin_queue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_job_status AS ENUM ('pending','claimed','running','paused','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_review_status AS ENUM ('none','pending_review','accepted','partially_accepted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- ai_taxonomy_snapshot
-- =========================================================================
CREATE TABLE public.ai_taxonomy_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  categories_compact TEXT NOT NULL DEFAULT '',
  platform_tags_compact TEXT NOT NULL DEFAULT '',
  secondary_tags_compact TEXT NOT NULL DEFAULT '',
  total_categories INT NOT NULL DEFAULT 0,
  total_tags INT NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX ai_taxonomy_snapshot_current_idx
  ON public.ai_taxonomy_snapshot (is_current) WHERE is_current = true;

GRANT SELECT ON public.ai_taxonomy_snapshot TO authenticated;
GRANT ALL ON public.ai_taxonomy_snapshot TO service_role;
ALTER TABLE public.ai_taxonomy_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY ats_select_authed ON public.ai_taxonomy_snapshot
  FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- ai_agent_sessions
-- =========================================================================
CREATE TABLE public.ai_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_index INT NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  scope public.ai_job_scope NOT NULL,
  context_snapshot_id UUID REFERENCES public.ai_taxonomy_snapshot(id),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_job_id UUID,
  total_jobs_completed INT NOT NULL DEFAULT 0,
  total_prompt_tokens INT NOT NULL DEFAULT 0,
  total_completion_tokens INT NOT NULL DEFAULT 0,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_ended_at TIMESTAMPTZ,
  end_reason TEXT
);
CREATE INDEX ai_agent_sessions_active_idx
  ON public.ai_agent_sessions (scope, last_heartbeat)
  WHERE session_ended_at IS NULL;

GRANT SELECT ON public.ai_agent_sessions TO authenticated;
GRANT ALL ON public.ai_agent_sessions TO service_role;
ALTER TABLE public.ai_agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY aas_select_staff ON public.ai_agent_sessions
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.view'));

-- =========================================================================
-- ai_jobs
-- =========================================================================
CREATE TABLE public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type public.ai_job_type NOT NULL,
  scope public.ai_job_scope NOT NULL,
  video_id UUID NOT NULL,
  batch_id UUID,
  assigned_session_id UUID REFERENCES public.ai_agent_sessions(id) ON DELETE SET NULL,
  taxonomy_snapshot_id UUID REFERENCES public.ai_taxonomy_snapshot(id),
  status public.ai_job_status NOT NULL DEFAULT 'pending',
  model_used TEXT,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  max_duration_s INT,
  max_results INT,
  priority INT NOT NULL DEFAULT 5,
  created_by UUID,
  error_text TEXT,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_jobs_dispatch_idx
  ON public.ai_jobs (scope, status, priority, created_at)
  WHERE status IN ('pending','claimed','running','paused');
CREATE INDEX ai_jobs_batch_idx ON public.ai_jobs (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX ai_jobs_video_idx ON public.ai_jobs (video_id);

CREATE TRIGGER ai_jobs_set_updated_at
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.ai_jobs TO authenticated;
GRANT ALL ON public.ai_jobs TO service_role;
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ajobs_select_own_or_staff ON public.ai_jobs
  FOR SELECT TO authenticated
  USING (
    (scope = 'user_submit' AND created_by = auth.uid())
    OR public.has_permission(auth.uid(), 'audit.view')
    OR public.has_permission(auth.uid(), 'video.edit_metadata')
  );

-- =========================================================================
-- ai_job_results
-- =========================================================================
CREATE TABLE public.ai_job_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.ai_jobs(id) ON DELETE CASCADE,
  video_id UUID NOT NULL,
  result_type public.ai_job_type NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0,
  was_accepted BOOLEAN,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  run_version INT NOT NULL DEFAULT 1,
  entity_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_job_results_video_idx
  ON public.ai_job_results (video_id, result_type, run_version DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX ai_job_results_job_idx ON public.ai_job_results (job_id);

GRANT SELECT ON public.ai_job_results TO authenticated;
GRANT ALL ON public.ai_job_results TO service_role;
ALTER TABLE public.ai_job_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY ajr_select_staff_or_owner ON public.ai_job_results
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'video.edit_metadata')
    OR public.has_permission(auth.uid(), 'audit.view')
    OR EXISTS (
      SELECT 1 FROM public.ai_jobs j
      WHERE j.id = ai_job_results.job_id
        AND j.scope = 'user_submit'
        AND j.created_by = auth.uid()
    )
  );

-- =========================================================================
-- videos: AI metadata columns
-- =========================================================================
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS ai_categorised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_tagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_categorisation_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_tagging_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence_avg FLOAT,
  ADD COLUMN IF NOT EXISTS ai_review_status public.ai_review_status NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS videos_ai_review_status_idx
  ON public.videos (ai_review_status)
  WHERE ai_review_status <> 'none';

-- =========================================================================
-- profiles: suspension
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- =========================================================================
-- app_settings seeds for AI
-- =========================================================================
INSERT INTO public.app_settings (key, value) VALUES
  ('ai_max_parallel_agents', to_jsonb(2)),
  ('ai_user_submit_model', to_jsonb('google/gemini-2.5-flash-lite'::text)),
  ('ai_admin_model', to_jsonb('openai/gpt-5-mini'::text)),
  ('ai_batch_model', to_jsonb('google/gemini-2.5-flash'::text)),
  ('ai_fallback_model_order', '["google/gemini-2.5-flash-lite","google/gemini-2.5-flash","openai/gpt-5-nano"]'::jsonb),
  ('ai_max_categories_per_video', to_jsonb(30)),
  ('ai_min_tags_secondary', to_jsonb(50)),
  ('ai_session_max_jobs', to_jsonb(20)),
  ('ai_heartbeat_timeout_s', to_jsonb(90)),
  ('ai_user_submit_auto', to_jsonb(true)),
  ('ai_stale_threshold_days', to_jsonb(365)),
  ('ai_max_batch_size', to_jsonb(500)),
  ('ai_all_models_throttled', to_jsonb(false)),
  ('show_ai_attribution_on_videos', to_jsonb(false)),
  ('max_owners', to_jsonb(2))
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- New permission keys + grants to owner/admin roles
-- =========================================================================
INSERT INTO public.permissions (key, area, description) VALUES
  ('ai.dispatch', 'ai', 'Dispatch AI categorisation/tagging jobs'),
  ('ai.review', 'ai', 'Review and accept/reject AI suggestions'),
  ('ai.manage', 'ai', 'Manage AI orchestrator settings and batches'),
  ('users.view', 'users', 'View the users administration page'),
  ('users.manage', 'users', 'Manage users (suspend, assign roles)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.roles r
CROSS JOIN (VALUES ('ai.dispatch'),('ai.review'),('ai.manage'),('users.view'),('users.manage')) p(key)
WHERE r.name IN ('owner','admin')
ON CONFLICT DO NOTHING;
