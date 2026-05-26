
-- Atomic claim of the next pending AI job for a given scope (or any scope when _scope is null).
CREATE OR REPLACE FUNCTION public.claim_ai_job(
  _scope ai_job_scope DEFAULT NULL,
  _session_id uuid DEFAULT NULL
) RETURNS public.ai_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked public.ai_jobs;
BEGIN
  SELECT * INTO picked
  FROM public.ai_jobs
  WHERE status = 'pending'
    AND (_scope IS NULL OR scope = _scope)
  ORDER BY priority ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF picked.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.ai_jobs
     SET status = 'running',
         assigned_session_id = COALESCE(_session_id, assigned_session_id),
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = picked.id
  RETURNING * INTO picked;

  RETURN picked;
END
$$;

REVOKE ALL ON FUNCTION public.claim_ai_job(ai_job_scope, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ai_job(ai_job_scope, uuid) TO service_role;

-- Re-queue jobs whose session heartbeat is stale (older than _timeout_s seconds).
CREATE OR REPLACE FUNCTION public.sweep_stale_ai_sessions(_timeout_s int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  WITH stale AS (
    SELECT s.id FROM public.ai_agent_sessions s
    WHERE s.session_ended_at IS NULL
      AND s.last_heartbeat < now() - make_interval(secs => _timeout_s)
  ),
  ended AS (
    UPDATE public.ai_agent_sessions
       SET session_ended_at = now(),
           end_reason = COALESCE(end_reason, 'heartbeat_timeout')
     WHERE id IN (SELECT id FROM stale)
    RETURNING id
  )
  UPDATE public.ai_jobs j
     SET status = 'pending',
         assigned_session_id = NULL,
         updated_at = now()
   WHERE j.assigned_session_id IN (SELECT id FROM ended)
     AND j.status IN ('running','claimed');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_ai_sessions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_ai_sessions(int) TO service_role;

-- Re-queue failed jobs that still have retries remaining.
CREATE OR REPLACE FUNCTION public.sweep_ai_retries()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE public.ai_jobs
     SET status = 'pending',
         retry_count = retry_count + 1,
         assigned_session_id = NULL,
         failed_at = NULL,
         updated_at = now()
   WHERE status = 'failed'
     AND retry_count < max_retries
     AND COALESCE(error_text, '') NOT IN ('taxonomy_mismatch','credits_exhausted');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END
$$;

REVOKE ALL ON FUNCTION public.sweep_ai_retries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_ai_retries() TO service_role;
