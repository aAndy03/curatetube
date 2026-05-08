
-- 1. Denormalized counters on videos
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS app_like_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_dislike_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_watch_count integer NOT NULL DEFAULT 0;

-- Backfill from existing rows
UPDATE public.videos v SET
  app_like_count = COALESCE(s.likes,0),
  app_dislike_count = COALESCE(s.dislikes,0),
  app_watch_count = COALESCE(s.watches,0)
FROM (
  SELECT video_id,
    COUNT(*) FILTER (WHERE status::text = 'like') AS likes,
    COUNT(*) FILTER (WHERE status::text = 'dislike') AS dislikes,
    COUNT(*) FILTER (WHERE status::text IN ('watched','watching')) AS watches
  FROM public.user_video_status GROUP BY video_id
) s WHERE s.video_id = v.id;

-- Trigger to sync counters
CREATE OR REPLACE FUNCTION public.user_video_status_counters_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta int;
BEGIN
  IF TG_OP = 'INSERT' THEN delta := 1;
  ELSIF TG_OP = 'DELETE' THEN delta := -1;
  ELSE RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'like' THEN
      UPDATE public.videos SET app_like_count = GREATEST(0, app_like_count + delta) WHERE id = NEW.video_id;
    ELSIF NEW.status::text = 'dislike' THEN
      UPDATE public.videos SET app_dislike_count = GREATEST(0, app_dislike_count + delta) WHERE id = NEW.video_id;
    ELSIF NEW.status::text IN ('watched','watching') THEN
      UPDATE public.videos SET app_watch_count = GREATEST(0, app_watch_count + delta) WHERE id = NEW.video_id;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.status::text = 'like' THEN
      UPDATE public.videos SET app_like_count = GREATEST(0, app_like_count + delta) WHERE id = OLD.video_id;
    ELSIF OLD.status::text = 'dislike' THEN
      UPDATE public.videos SET app_dislike_count = GREATEST(0, app_dislike_count + delta) WHERE id = OLD.video_id;
    ELSIF OLD.status::text IN ('watched','watching') THEN
      UPDATE public.videos SET app_watch_count = GREATEST(0, app_watch_count + delta) WHERE id = OLD.video_id;
    END IF;
    RETURN OLD;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_uvs_counters ON public.user_video_status;
CREATE TRIGGER trg_uvs_counters
AFTER INSERT OR DELETE ON public.user_video_status
FOR EACH ROW EXECUTE FUNCTION public.user_video_status_counters_sync();

-- 2. Materialized views
DROP MATERIALIZED VIEW IF EXISTS public.mv_trending CASCADE;
CREATE MATERIALIZED VIEW public.mv_trending AS
WITH s24 AS (
  SELECT video_id, COUNT(*) c FROM public.video_suggestions
  WHERE created_at > now() - interval '24 hours' GROUP BY video_id
),
s72 AS (
  SELECT video_id, COUNT(*) c FROM public.video_suggestions
  WHERE created_at > now() - interval '72 hours' GROUP BY video_id
),
w24 AS (
  SELECT video_id, COUNT(*) c FROM public.user_video_status
  WHERE created_at > now() - interval '24 hours' AND status::text IN ('watched','watching','like')
  GROUP BY video_id
)
SELECT v.id AS video_id,
  COALESCE(s24.c,0) AS suggest_24h,
  COALESCE(s72.c,0) AS suggest_72h,
  COALESCE(w24.c,0) AS engage_24h,
  (COALESCE(s24.c,0)*3 + COALESCE(w24.c,0)*1)::numeric AS trending_score_24h,
  (COALESCE(s72.c,0)*3 + COALESCE(w24.c,0)*1)::numeric AS trending_score_72h
FROM public.videos v
LEFT JOIN s24 ON s24.video_id = v.id
LEFT JOIN s72 ON s72.video_id = v.id
LEFT JOIN w24 ON w24.video_id = v.id
WHERE v.status::text = 'approved';

CREATE UNIQUE INDEX mv_trending_pk ON public.mv_trending(video_id);
CREATE INDEX mv_trending_24 ON public.mv_trending(trending_score_24h DESC);
CREATE INDEX mv_trending_72 ON public.mv_trending(trending_score_72h DESC);

DROP MATERIALIZED VIEW IF EXISTS public.mv_suggested_feed CASCADE;
CREATE MATERIALIZED VIEW public.mv_suggested_feed AS
SELECT v.id AS video_id, v.suggest_count, v.first_submitted_at
FROM public.videos v
WHERE v.status::text = 'approved' AND v.suggest_count > 0;

CREATE UNIQUE INDEX mv_suggested_feed_pk ON public.mv_suggested_feed(video_id);
CREATE INDEX mv_suggested_feed_rank ON public.mv_suggested_feed(suggest_count DESC, first_submitted_at DESC);

DROP MATERIALIZED VIEW IF EXISTS public.mv_category_stats CASCADE;
CREATE MATERIALIZED VIEW public.mv_category_stats AS
SELECT c.id AS category_id,
  c.slug,
  c.name,
  COUNT(DISTINCT vc.video_id) AS video_count,
  COALESCE(AVG(v.suggest_count), 0)::numeric AS avg_suggest_count,
  (
    SELECT array_agg(t.thumb)
    FROM (
      SELECT v2.thumbnail_url AS thumb
      FROM public.video_categories vc2
      JOIN public.videos v2 ON v2.id = vc2.video_id
      WHERE vc2.category_id = c.id AND v2.status::text = 'approved' AND v2.thumbnail_url IS NOT NULL
      ORDER BY v2.suggest_count DESC NULLS LAST
      LIMIT 5
    ) t
  ) AS top_thumbnails
FROM public.categories c
LEFT JOIN public.video_categories vc ON vc.category_id = c.id
LEFT JOIN public.videos v ON v.id = vc.video_id AND v.status::text = 'approved'
GROUP BY c.id, c.slug, c.name;

CREATE UNIQUE INDEX mv_category_stats_pk ON public.mv_category_stats(category_id);

-- 3. Refresh log
CREATE TABLE IF NOT EXISTS public.mv_refresh_log (
  id bigserial PRIMARY KEY,
  view_name text NOT NULL,
  duration_ms integer NOT NULL,
  rows_affected integer,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT true,
  error text
);
CREATE INDEX IF NOT EXISTS mv_refresh_log_view_time ON public.mv_refresh_log(view_name, triggered_at DESC);

ALTER TABLE public.mv_refresh_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mvrl_select_admin ON public.mv_refresh_log FOR SELECT
  USING (public.has_permission(auth.uid(), 'settings.edit'));

-- 4. Refresh helper
CREATE OR REPLACE FUNCTION public.refresh_mv(_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.refresh_mv(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mv(text) TO service_role;

-- Initial population (non-concurrent first time)
REFRESH MATERIALIZED VIEW public.mv_trending;
REFRESH MATERIALIZED VIEW public.mv_suggested_feed;
REFRESH MATERIALIZED VIEW public.mv_category_stats;

-- Read access on materialized views
GRANT SELECT ON public.mv_trending, public.mv_suggested_feed, public.mv_category_stats TO anon, authenticated;
