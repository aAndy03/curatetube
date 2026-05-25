
-- ============================================================================
-- Phase 8 — mv_category_trending_score
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_category_trending_score AS
WITH params AS (
  SELECT
    COALESCE((SELECT (value)::int    FROM public.app_settings WHERE key = 'trending_min_video_count'), 3)   AS min_vc,
    COALESCE((SELECT (value)::numeric FROM public.app_settings WHERE key = 'trending_viral_cap_pct'),    0.4) AS cap_pct
),
vid_stats AS (
  SELECT
    v.id AS video_id,
    v.creator_id,
    COALESCE((SELECT COUNT(*) FROM public.video_suggestions vs
              WHERE vs.video_id = v.id AND vs.created_at > now() - interval '24 hours'), 0) AS sug24,
    COALESCE((SELECT COUNT(*) FROM public.user_video_status uvs
              WHERE uvs.video_id = v.id AND uvs.status::text = 'like'
                AND uvs.created_at > now() - interval '24 hours'), 0) AS like24,
    COALESCE((SELECT COUNT(*) FROM public.user_video_status uvs
              WHERE uvs.video_id = v.id AND uvs.status::text IN ('watched','watching')
                AND uvs.created_at > now() - interval '24 hours'), 0) AS watch24,
    COALESCE((SELECT COUNT(*) FROM public.submissions s
              WHERE s.video_id = v.id AND s.created_at > now() - interval '7 days'), 0) AS sub7d,
    CASE WHEN v.first_submitted_at > now() - interval '7 days' THEN 1 ELSE 0 END AS is_new_7d,
    COALESCE((SELECT COUNT(*) FROM public.leaderboard_entries le
              JOIN public.leaderboard_snapshots ls ON ls.id = le.snapshot_id
              WHERE le.video_id = v.id AND ls.created_at > now() - interval '7 days'), 0) AS lb_count
  FROM public.videos v
  WHERE v.status = 'approved'
),
vid_sub AS (
  SELECT video_id, creator_id, is_new_7d,
         (sug24 * 3 + like24 * 2 + watch24 * 1 + sub7d * 2 + lb_count * 4)::numeric AS sub_score
  FROM vid_stats
),
cat_video AS (
  SELECT vc.category_id, vs.video_id, vs.creator_id, vs.sub_score, vs.is_new_7d
  FROM public.video_categories vc
  JOIN vid_sub vs ON vs.video_id = vc.video_id
),
cat_raw AS (
  SELECT category_id,
         SUM(sub_score)                                          AS raw_total,
         SUM(is_new_7d)                                          AS new_videos_7d,
         COUNT(DISTINCT creator_id) FILTER (WHERE sub_score > 0) AS active_creators
  FROM cat_video
  GROUP BY category_id
),
cat_capped AS (
  SELECT cv.category_id,
         SUM(LEAST(cv.sub_score, cr.raw_total * (SELECT cap_pct FROM params))) AS capped_activity
  FROM cat_video cv
  JOIN cat_raw cr ON cr.category_id = cv.category_id
  WHERE cr.raw_total > 0
  GROUP BY cv.category_id
),
cat_assembled AS (
  SELECT
    c.id           AS category_id,
    c.slug,
    c.name,
    c.video_count,
    COALESCE(cr.active_creators, 0) AS active_creators,
    COALESCE(cr.new_videos_7d, 0)   AS new_videos_7d,
    (
      COALESCE(cc.capped_activity, 0)
      + COALESCE(cr.new_videos_7d, 0) * 5
      + CASE WHEN COALESCE(cr.active_creators, 0) > 3 THEN 2 ELSE 0 END
    )::numeric AS raw_score
  FROM public.categories c
  LEFT JOIN cat_raw    cr ON cr.category_id = c.id
  LEFT JOIN cat_capped cc ON cc.category_id = c.id
  WHERE c.video_count >= (SELECT min_vc FROM params)
),
norm AS (SELECT GREATEST(MAX(raw_score), 1) AS max_score FROM cat_assembled)
SELECT
  ca.category_id,
  ca.slug,
  ca.name,
  ca.video_count,
  ca.active_creators,
  ca.new_videos_7d,
  ca.raw_score,
  ROUND((ca.raw_score / (SELECT max_score FROM norm)) * 100, 2) AS score,
  now() AS refreshed_at
FROM cat_assembled ca;

CREATE UNIQUE INDEX IF NOT EXISTS mv_category_trending_score_pk
  ON public.mv_category_trending_score(category_id);
CREATE INDEX IF NOT EXISTS mv_category_trending_score_score_idx
  ON public.mv_category_trending_score(score DESC);

-- ============================================================================
-- Phase 9 — mv_creator_categories (top-level rollup via closure)
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_creator_categories AS
WITH top_cats AS (
  SELECT id FROM public.categories WHERE parent_id IS NULL
),
video_top_cat AS (
  SELECT DISTINCT vc.video_id, ca.ancestor_id AS category_id
  FROM public.video_categories vc
  JOIN public.category_ancestors ca ON ca.descendant_id = vc.category_id
  JOIN top_cats tc ON tc.id = ca.ancestor_id
)
SELECT
  c.id                AS category_id,
  c.slug              AS category_slug,
  c.name              AS category_name,
  c.sort_order        AS category_sort_order,
  cr.id               AS creator_id,
  cr.title            AS creator_title,
  cr.handle           AS creator_handle,
  cr.thumbnail_url    AS creator_thumbnail_url,
  cr.subscriber_count,
  COUNT(v.id)         AS videos_in_category
FROM video_top_cat vtc
JOIN public.videos    v  ON v.id = vtc.video_id AND v.status = 'approved'
JOIN public.creators  cr ON cr.id = v.creator_id
JOIN public.categories c ON c.id = vtc.category_id
GROUP BY c.id, c.slug, c.name, c.sort_order, cr.id, cr.title, cr.handle, cr.thumbnail_url, cr.subscriber_count;

CREATE UNIQUE INDEX IF NOT EXISTS mv_creator_categories_pk
  ON public.mv_creator_categories(category_id, creator_id);
CREATE INDEX IF NOT EXISTS mv_creator_categories_cat_idx
  ON public.mv_creator_categories(category_id, videos_in_category DESC);

-- ============================================================================
-- Wire new MVs into refresh_mv()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_mv(_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    ELSIF _name = 'mv_category_trending_score' THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_category_trending_score;
      SELECT count(*) INTO rows_count FROM public.mv_category_trending_score;
    ELSIF _name = 'mv_creator_categories' THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_creator_categories;
      SELECT count(*) INTO rows_count FROM public.mv_creator_categories;
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

-- Initial population (non-concurrent so the unique index can be built first)
REFRESH MATERIALIZED VIEW public.mv_category_trending_score;
REFRESH MATERIALIZED VIEW public.mv_creator_categories;
