
REVOKE SELECT ON public.mv_trending, public.mv_suggested_feed, public.mv_category_stats FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.user_video_status_counters_sync() FROM PUBLIC, anon, authenticated;
