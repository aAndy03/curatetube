
-- ============ Closure-aware reparent ============
CREATE OR REPLACE FUNCTION public.categories_reparent(_id uuid, _new_parent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_parent_depth int;
  subtree_height int;
BEGIN
  IF _id = _new_parent_id THEN
    RAISE EXCEPTION 'Cannot reparent a category to itself';
  END IF;

  -- cycle guard: new parent must not be a descendant of _id
  IF _new_parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.category_ancestors
    WHERE ancestor_id = _id AND descendant_id = _new_parent_id
  ) THEN
    RAISE EXCEPTION 'Cannot reparent under own descendant';
  END IF;

  new_parent_depth := COALESCE(
    (SELECT depth FROM public.categories WHERE id = _new_parent_id),
    -1
  );
  subtree_height := COALESCE(
    (SELECT MAX(depth) FROM public.category_ancestors WHERE ancestor_id = _id),
    0
  );

  IF new_parent_depth + 1 + subtree_height > 6 THEN
    RAISE EXCEPTION 'Reparent would exceed max depth of 6';
  END IF;

  -- Update parent pointer on the node
  UPDATE public.categories
    SET parent_id = _new_parent_id,
        updated_at = now()
    WHERE id = _id;

  -- Wipe stale ancestor links for the entire subtree (keep self-rows)
  DELETE FROM public.category_ancestors ca
   WHERE ca.descendant_id IN (
     SELECT descendant_id FROM public.category_ancestors WHERE ancestor_id = _id
   )
   AND ca.depth > 0
   AND ca.ancestor_id NOT IN (
     SELECT descendant_id FROM public.category_ancestors WHERE ancestor_id = _id
   );

  -- For every node in the subtree, re-add (new_ancestor, descendant, depth)
  -- combining ancestors-of-new-parent with the in-subtree distance from _id.
  IF _new_parent_id IS NOT NULL THEN
    INSERT INTO public.category_ancestors(ancestor_id, descendant_id, depth)
    SELECT ap.ancestor_id, sd.descendant_id, ap.depth + 1 + sd.depth
      FROM public.category_ancestors ap
      JOIN public.category_ancestors sd ON sd.ancestor_id = _id
     WHERE ap.descendant_id = _new_parent_id
    ON CONFLICT DO NOTHING;
  END IF;

  -- Recompute depths for all subtree nodes from their longest ancestor chain
  UPDATE public.categories c
     SET depth = sub.new_depth
    FROM (
      SELECT descendant_id AS id, COALESCE(MAX(depth), 0) AS new_depth
        FROM public.category_ancestors
       WHERE descendant_id IN (
         SELECT descendant_id FROM public.category_ancestors WHERE ancestor_id = _id
       )
       GROUP BY descendant_id
    ) sub
    WHERE c.id = sub.id;
END
$$;

-- ============ One-time backfill: ensure self-rows exist & depths are correct ============
INSERT INTO public.category_ancestors(ancestor_id, descendant_id, depth)
SELECT id, id, 0 FROM public.categories
ON CONFLICT DO NOTHING;

-- Recompute depths for the whole tree
WITH RECURSIVE walk AS (
  SELECT id, parent_id, 0 AS d FROM public.categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, w.d + 1
    FROM public.categories c JOIN walk w ON c.parent_id = w.id
)
UPDATE public.categories c SET depth = w.d FROM walk w WHERE c.id = w.id;
