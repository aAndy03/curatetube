
-- =====================================================
-- 1. Primary tags sync (Bug 2)
-- =====================================================

CREATE OR REPLACE FUNCTION public.sync_video_primary_tag_ids(_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(tag_id ORDER BY rank ASC), ARRAY[]::uuid[])
  INTO ids
  FROM (
    SELECT tag_id, rank
    FROM public.video_tags
    WHERE video_id = _video_id AND rank IS NOT NULL AND rank <= 3
    ORDER BY rank ASC
    LIMIT 3
  ) s;
  UPDATE public.videos SET primary_tag_ids = ids WHERE id = _video_id;
END $$;

CREATE OR REPLACE FUNCTION public.video_tags_primary_sync_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_video_primary_tag_ids(NEW.video_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.sync_video_primary_tag_ids(NEW.video_id);
    IF OLD.video_id IS DISTINCT FROM NEW.video_id THEN
      PERFORM public.sync_video_primary_tag_ids(OLD.video_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.sync_video_primary_tag_ids(OLD.video_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_video_tags_primary_sync ON public.video_tags;
CREATE TRIGGER trg_video_tags_primary_sync
AFTER INSERT OR UPDATE OR DELETE ON public.video_tags
FOR EACH ROW EXECUTE FUNCTION public.video_tags_primary_sync_trg();

-- Backfill all videos that have video_tags rows.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT video_id FROM public.video_tags LOOP
    PERFORM public.sync_video_primary_tag_ids(r.video_id);
  END LOOP;
END $$;

-- =====================================================
-- 2. mv_category_suggest_score (Phase 7)
--    score = sum(suggest_delta_24h)*3 + sum(suggest_delta_72h)*1
--          + (videos_with_suggests / total_videos) * 10
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_category_suggest_score;

CREATE MATERIALIZED VIEW public.mv_category_suggest_score AS
WITH s24 AS (
  SELECT video_id, count(*)::int AS c
  FROM public.video_suggestions
  WHERE created_at > now() - interval '24 hours'
  GROUP BY video_id
),
s72 AS (
  SELECT video_id, count(*)::int AS c
  FROM public.video_suggestions
  WHERE created_at > now() - interval '72 hours'
  GROUP BY video_id
),
-- Resolve every video to all its ancestor categories via closure.
vca AS (
  SELECT DISTINCT ca.ancestor_id AS category_id, vc.video_id
  FROM public.video_categories vc
  JOIN public.category_ancestors ca ON ca.descendant_id = vc.category_id
),
per_cat AS (
  SELECT
    vca.category_id,
    count(DISTINCT vca.video_id)                                     AS total_videos,
    count(DISTINCT vca.video_id) FILTER (WHERE s72.c IS NOT NULL)    AS videos_with_suggests,
    COALESCE(SUM(s24.c), 0)::int                                     AS suggest_delta_24h,
    COALESCE(SUM(s72.c), 0)::int                                     AS suggest_delta_72h
  FROM vca
  LEFT JOIN s24 ON s24.video_id = vca.video_id
  LEFT JOIN s72 ON s72.video_id = vca.video_id
  GROUP BY vca.category_id
)
SELECT
  c.id          AS category_id,
  c.slug,
  c.name,
  c.parent_id,
  c.depth,
  pc.total_videos,
  pc.videos_with_suggests,
  pc.suggest_delta_24h,
  pc.suggest_delta_72h,
  ROUND(
    (pc.suggest_delta_24h * 3)
    + (pc.suggest_delta_72h * 1)
    + CASE WHEN pc.total_videos > 0
        THEN (pc.videos_with_suggests::numeric / pc.total_videos) * 10
        ELSE 0 END,
    3
  ) AS score,
  now() AS computed_at
FROM public.categories c
JOIN per_cat pc ON pc.category_id = c.id;

CREATE UNIQUE INDEX mv_category_suggest_score_pk
  ON public.mv_category_suggest_score (category_id);
CREATE INDEX mv_category_suggest_score_order
  ON public.mv_category_suggest_score (score DESC);

GRANT SELECT ON public.mv_category_suggest_score TO authenticated, anon;

-- Extend refresh_mv switch to handle the new view.
CREATE OR REPLACE FUNCTION public.refresh_mv(_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  t0 timestamptz := clock_timestamp();
  rows_count int;
  err text;
BEGIN
  BEGIN
    IF _name = 'mv_trending' THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_trending;
      SELECT count(*) INTO rows_count FROM public.mv_trending;
    ELSIF _name = 'mv_suggested_feed' THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_suggested_feed;
      SELECT count(*) INTO rows_count FROM public.mv_suggested_feed;
    ELSIF _name = 'mv_category_stats' THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_category_stats;
      SELECT count(*) INTO rows_count FROM public.mv_category_stats;
    ELSIF _name = 'mv_category_suggest_score' THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_category_suggest_score;
      SELECT count(*) INTO rows_count FROM public.mv_category_suggest_score;
    ELSE
      RAISE EXCEPTION 'Unknown view: %', _name;
    END IF;
    INSERT INTO public.mv_refresh_log(view_name, duration_ms, rows_affected, ok)
    VALUES (_name, EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int, rows_count, true);
    RETURN jsonb_build_object('ok', true, 'view', _name, 'rows', rows_count);
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM;
    INSERT INTO public.mv_refresh_log(view_name, duration_ms, rows_affected, ok, error)
    VALUES (_name, EXTRACT(MILLISECONDS FROM (clock_timestamp() - t0))::int, NULL, false, err);
    RETURN jsonb_build_object('ok', false, 'view', _name, 'error', err);
  END;
END $function$;
