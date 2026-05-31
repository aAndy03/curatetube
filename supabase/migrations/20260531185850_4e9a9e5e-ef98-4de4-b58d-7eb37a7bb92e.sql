
-- Phase 8: edge cases

-- 1) Prevent concurrent duplicate AI jobs for the same (video_id, job_type)
--    while one is still active. UI/server can re-run after completion (which
--    bumps run_version on ai_job_results).
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_active_video_type_unique
  ON public.ai_jobs (video_id, job_type)
  WHERE status IN ('pending','claimed','running','paused');

-- 2) Post-batch validator: mark ai_job_results.entity_deleted=true when the
--    referenced category/tag was renamed-with-new-id or deleted after the run.
CREATE OR REPLACE FUNCTION public.validate_ai_results_deleted_entities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  WITH upd AS (
    UPDATE public.ai_job_results r
    SET entity_deleted = true
    WHERE r.entity_deleted = false
      AND (
        (r.result_type = 'categorise'
          AND NOT EXISTS (SELECT 1 FROM public.categories c
                           WHERE c.id = r.entity_id AND c.deleted_at IS NULL))
        OR
        (r.result_type IN ('tag_primary','tag_secondary','tag_rest')
          AND NOT EXISTS (SELECT 1 FROM public.tags t
                           WHERE t.id = r.entity_id AND t.deleted_at IS NULL))
      )
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM upd;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_ai_results_deleted_entities() FROM public;
GRANT EXECUTE ON FUNCTION public.validate_ai_results_deleted_entities() TO service_role;

-- 3) Pause all running/claimed AI jobs (used when gateway is throttled).
CREATE OR REPLACE FUNCTION public.pause_active_ai_jobs(_reason text DEFAULT 'throttled')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.ai_jobs
  SET status = 'paused',
      paused_at = now(),
      error_text = COALESCE(error_text, _reason),
      updated_at = now()
  WHERE status IN ('pending','claimed','running');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_active_ai_jobs(text) FROM public;
GRANT EXECUTE ON FUNCTION public.pause_active_ai_jobs(text) TO service_role;

-- Resume paused jobs (after throttle clears).
CREATE OR REPLACE FUNCTION public.resume_paused_ai_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.ai_jobs
  SET status = 'pending',
      resumed_at = now(),
      updated_at = now()
  WHERE status = 'paused';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_paused_ai_jobs() FROM public;
GRANT EXECUTE ON FUNCTION public.resume_paused_ai_jobs() TO service_role;
