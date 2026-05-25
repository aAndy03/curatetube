-- Phase 11: Postgres-side dedup RPC for category-aware feed rails.
-- Resolves descendants via category_ancestors, dedupes against seen ids,
-- and returns the trimmed video list in a single round trip.

CREATE OR REPLACE FUNCTION public.fetch_category_feed_videos(
  _category_id uuid,
  _exclude uuid[],
  _limit int
)
RETURNS TABLE(
  id uuid,
  youtube_id text,
  title text,
  thumbnail_url text,
  duration_seconds int,
  published_at timestamptz,
  submission_count int,
  suggest_count int,
  primary_tag_ids uuid[],
  creator_id uuid,
  creator_title text,
  creator_handle text,
  creator_thumbnail_url text,
  total_in_category bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH cat_set AS (
    SELECT descendant_id AS cid
    FROM public.category_ancestors
    WHERE ancestor_id = _category_id
  ),
  vc AS (
    SELECT DISTINCT video_id
    FROM public.video_categories
    WHERE category_id IN (SELECT cid FROM cat_set)
  ),
  total AS (SELECT COUNT(*)::bigint AS n FROM vc),
  picked AS (
    SELECT v.*
    FROM public.videos v
    JOIN vc ON vc.video_id = v.id
    WHERE v.status = 'approved'
      AND v.id <> ALL (COALESCE(_exclude, ARRAY[]::uuid[]))
    ORDER BY v.suggest_count DESC NULLS LAST,
             v.first_submitted_at DESC
    LIMIT GREATEST(_limit, 0)
  )
  SELECT
    p.id,
    p.youtube_id,
    p.title,
    p.thumbnail_url,
    p.duration_seconds,
    p.published_at,
    p.submission_count,
    p.suggest_count,
    p.primary_tag_ids,
    c.id,
    c.title,
    c.handle,
    c.thumbnail_url,
    (SELECT n FROM total)
  FROM picked p
  LEFT JOIN public.creators c ON c.id = p.creator_id;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_category_feed_videos(uuid, uuid[], int) TO anon, authenticated;

-- Convenience view: last successful refresh per MV (for admin health widgets).
CREATE OR REPLACE VIEW public.mv_last_refresh AS
SELECT DISTINCT ON (view_name)
  view_name,
  triggered_at AS last_refreshed_at,
  duration_ms,
  ok,
  rows_affected,
  error
FROM public.mv_refresh_log
ORDER BY view_name, triggered_at DESC;

GRANT SELECT ON public.mv_last_refresh TO anon, authenticated;