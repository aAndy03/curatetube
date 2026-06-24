CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram + tsv indexes for ranked fuzzy search across videos, creators, tags.
CREATE INDEX IF NOT EXISTS videos_title_trgm_idx ON public.videos USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS videos_title_desc_tsv_idx ON public.videos USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));
CREATE INDEX IF NOT EXISTS creators_title_trgm_idx ON public.creators USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tags_name_trgm_idx ON public.tags USING gin (name gin_trgm_ops);

-- Public ranked search RPCs. All filter to approved/safe rows and execute as
-- SECURITY DEFINER so they can run without per-row RLS overhead while still
-- enforcing visibility in their WHERE clauses.

CREATE OR REPLACE FUNCTION public.search_videos(q text, lim int DEFAULT 8)
RETURNS TABLE (
  id uuid,
  youtube_id text,
  title text,
  thumbnail_url text,
  creator_id uuid,
  creator_title text,
  suggest_count int,
  sim real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id,
    v.youtube_id,
    v.title,
    v.thumbnail_url,
    c.id AS creator_id,
    c.title AS creator_title,
    v.suggest_count,
    GREATEST(
      similarity(coalesce(v.title, ''), q),
      similarity(coalesce(v.description, ''), q) * 0.4
    )::real AS sim
  FROM public.videos v
  LEFT JOIN public.creators c ON c.id = v.creator_id
  WHERE v.status = 'approved'
    AND length(coalesce(q, '')) >= 2
    AND (
      v.title ILIKE '%' || q || '%'
      OR v.title % q
      OR (v.description IS NOT NULL AND v.description ILIKE '%' || q || '%')
    )
  ORDER BY sim DESC, v.suggest_count DESC NULLS LAST, v.id ASC
  LIMIT GREATEST(1, LEAST(lim, 50));
$$;

CREATE OR REPLACE FUNCTION public.search_creators(q text, lim int DEFAULT 6)
RETURNS TABLE (
  id uuid,
  title text,
  handle text,
  thumbnail_url text,
  video_count int,
  sim real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.title,
    c.handle,
    c.thumbnail_url,
    (SELECT count(*)::int FROM public.videos v WHERE v.creator_id = c.id AND v.status = 'approved') AS video_count,
    similarity(coalesce(c.title, ''), q)::real AS sim
  FROM public.creators c
  WHERE length(coalesce(q, '')) >= 2
    AND (c.title ILIKE '%' || q || '%' OR c.title % q OR c.handle ILIKE '%' || q || '%')
  ORDER BY sim DESC, c.title ASC
  LIMIT GREATEST(1, LEAST(lim, 25));
$$;

CREATE OR REPLACE FUNCTION public.search_tags(q text, lim int DEFAULT 6)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  is_platform_tag boolean,
  sim real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.slug,
    t.name,
    t.is_platform_tag,
    similarity(coalesce(t.name, ''), q)::real AS sim
  FROM public.tags t
  WHERE length(coalesce(q, '')) >= 2
    AND (t.name ILIKE '%' || q || '%' OR t.name % q OR t.slug ILIKE '%' || q || '%')
  ORDER BY sim DESC, t.name ASC
  LIMIT GREATEST(1, LEAST(lim, 25));
$$;

GRANT EXECUTE ON FUNCTION public.search_videos(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_creators(text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tags(text, int) TO anon, authenticated, service_role;