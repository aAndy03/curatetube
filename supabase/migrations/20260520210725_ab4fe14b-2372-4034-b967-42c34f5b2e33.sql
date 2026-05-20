
-- Plan 4 Phase 1: Categories tree, tag tiers, video manager prep, quotas

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.tag_source AS ENUM ('platform','sciencedirect','youtube_api','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tag_tier AS ENUM ('primary','secondary','internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tag_assigned_by AS ENUM ('system','user','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CATEGORIES (extend existing) ============
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS depth INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Closure table for fast subtree lookups
CREATE TABLE IF NOT EXISTS public.category_ancestors (
  ancestor_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  descendant_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  depth INT NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_anc_ancestor ON public.category_ancestors(ancestor_id);
CREATE INDEX IF NOT EXISTS idx_cat_anc_descendant ON public.category_ancestors(descendant_id);

ALTER TABLE public.category_ancestors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ca_select_all ON public.category_ancestors;
CREATE POLICY ca_select_all ON public.category_ancestors FOR SELECT USING (true);
DROP POLICY IF EXISTS ca_write_perm ON public.category_ancestors;
CREATE POLICY ca_write_perm ON public.category_ancestors FOR ALL
  USING (public.has_permission(auth.uid(), 'taxonomy.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'taxonomy.manage'));

-- Depth + closure maintenance
CREATE OR REPLACE FUNCTION public.categories_compute_depth(_parent_id UUID)
RETURNS INT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT depth + 1 FROM public.categories WHERE id = _parent_id), 0)
$$;

CREATE OR REPLACE FUNCTION public.categories_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.depth := public.categories_compute_depth(NEW.parent_id);
  IF NEW.depth > 6 THEN
    RAISE EXCEPTION 'Category depth (% ) exceeds max of 6', NEW.depth;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.categories_closure_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- self
  INSERT INTO public.category_ancestors(ancestor_id, descendant_id, depth)
    VALUES (NEW.id, NEW.id, 0) ON CONFLICT DO NOTHING;
  -- ancestors of parent + 1
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.category_ancestors(ancestor_id, descendant_id, depth)
      SELECT ca.ancestor_id, NEW.id, ca.depth + 1
        FROM public.category_ancestors ca
        WHERE ca.descendant_id = NEW.parent_id
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_categories_before_insert ON public.categories;
CREATE TRIGGER trg_categories_before_insert
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_after_insert();

DROP TRIGGER IF EXISTS trg_categories_after_insert_closure ON public.categories;
CREATE TRIGGER trg_categories_after_insert_closure
  AFTER INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_closure_insert();

-- Backfill closure rows for existing categories (self only, since legacy depth=0)
INSERT INTO public.category_ancestors(ancestor_id, descendant_id, depth)
  SELECT id, id, 0 FROM public.categories
  ON CONFLICT DO NOTHING;

-- ============ VIDEO_CATEGORIES extend ============
ALTER TABLE public.video_categories
  ADD COLUMN IF NOT EXISTS assigned_by UUID,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_video_categories_category ON public.video_categories(category_id);

CREATE OR REPLACE FUNCTION public.video_categories_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_count INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO current_count FROM public.video_categories WHERE video_id = NEW.video_id;
    IF current_count > 5 THEN
      RAISE EXCEPTION 'Max 5 categories per video';
    END IF;
    UPDATE public.categories SET video_count = video_count + 1 WHERE id = NEW.category_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.categories SET video_count = GREATEST(0, video_count - 1) WHERE id = OLD.category_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_video_categories_sync ON public.video_categories;
CREATE TRIGGER trg_video_categories_sync
  AFTER INSERT OR DELETE ON public.video_categories
  FOR EACH ROW EXECUTE FUNCTION public.video_categories_sync();

-- ============ TAGS extend ============
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS source public.tag_source NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS tier public.tag_tier NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS is_platform_tag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0;

-- GIN full-text index (Phase 11, included early)
CREATE INDEX IF NOT EXISTS idx_tags_fts ON public.tags
  USING gin(to_tsvector('english', name || ' ' || slug));

-- ============ VIDEO_TAGS extend ============
ALTER TABLE public.video_tags
  ADD COLUMN IF NOT EXISTS rank INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS assigned_by public.tag_assigned_by NOT NULL DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON public.video_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_video_tags_primary ON public.video_tags(video_id) WHERE rank <= 3;

CREATE OR REPLACE FUNCTION public.video_tags_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.tag_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_video_tags_sync ON public.video_tags;
CREATE TRIGGER trg_video_tags_sync
  AFTER INSERT OR DELETE ON public.video_tags
  FOR EACH ROW EXECUTE FUNCTION public.video_tags_sync();

-- ============ VIDEOS denorm ============
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS primary_tag_ids UUID[] NOT NULL DEFAULT '{}';

-- ============ SUBMISSIONS extend ============
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS proposed_category_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS proposed_tag_ids UUID[] NOT NULL DEFAULT '{}';

-- ============ USER_CATEGORY_PINS ============
CREATE TABLE IF NOT EXISTS public.user_category_pins (
  user_id UUID NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);
ALTER TABLE public.user_category_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ucp_self ON public.user_category_pins;
CREATE POLICY ucp_self ON public.user_category_pins FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ PERMISSIONS ============
INSERT INTO public.permissions(key, area, description) VALUES
  ('taxonomy.manage', 'taxonomy', 'Create, edit, reparent and delete categories and tag tiers'),
  ('library.manage', 'library', 'Manage approved video catalog (categories and tag assignment)')
  ON CONFLICT (key) DO NOTHING;

-- Grant to owner role if exists
INSERT INTO public.role_permissions(role_id, permission_key)
  SELECT r.id, p.key
  FROM public.roles r CROSS JOIN (VALUES ('taxonomy.manage'),('library.manage')) AS p(key)
  WHERE r.name = 'owner'
  ON CONFLICT DO NOTHING;

-- ============ APP_SETTINGS seeds ============
INSERT INTO public.app_settings(key, value) VALUES
  ('submit_limit_default', '{"default":3,"per_role":{"curator":10,"admin":0}}'::jsonb),
  ('max_tags_per_video', '1000'::jsonb),
  ('trending_min_video_count', '3'::jsonb),
  ('trending_viral_cap_pct', '0.4'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- ============ SEED PLATFORM TAGS (small inline set) ============
-- ScienceDirect tags (22k+) will be imported via an admin server fn from src/data/seeds/.
-- This migration only seeds the structural platform tags.
DO $$
DECLARE
  platform_tags TEXT[] := ARRAY[
    'Short-Form','Long-Form','Documentary','Tutorial','Vlog','Interview','Talk Show',
    'Podcast Video','Live Stream','Webinar','Lecture','Presentation','Animation',
    'Stop Motion','Motion Graphics','Screen Recording','Narrative','Explainer',
    'Review','Unboxing','Commentary','Reaction','Behind the Scenes','Bloopers',
    'Montage','Time-Lapse','Slow Motion','ASMR',
    '4320p (8K UHD)','2160p (4K UHD)','1440p (2K QHD)','1080p (Full HD)','720p (HD)',
    '480p (SD)','HDR10','HDR10+','Dolby Vision','HLG','SDR',
    'English','Spanish','French','German','Italian','Portuguese','Russian',
    'Mandarin Chinese','Hindi','Arabic','Japanese','Korean','Vietnamese','Thai'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY platform_tags LOOP
    INSERT INTO public.tags(slug, name, source, tier, is_platform_tag, approved)
      VALUES (
        lower(regexp_replace(t, '[^a-zA-Z0-9]+', '-', 'g')),
        t,
        'platform',
        'primary',
        true,
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        source = 'platform',
        tier = 'primary',
        is_platform_tag = true;
  END LOOP;
END $$;
