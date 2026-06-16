// Phase 6 Step 1 — Shared category tree cache.
// Read once per session (`staleTime: Infinity`) and consumed by submit sheet,
// moderation, admin/videos editor, suggest rails, etc. Mutations that change
// the tree (create/rename/reorder/reparent/delete) MUST invalidate the
// `CATEGORY_TREE_KEY` query so consumers stay in sync.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCategoryTree, type CategoryNode } from "@/lib/categories.functions";

export const CATEGORY_TREE_KEY = ["categories", "tree"] as const;

export function useCategoryTree() {
  const fetchTree = useServerFn(getCategoryTree);
  const q = useQuery({
    queryKey: CATEGORY_TREE_KEY,
    queryFn: () => fetchTree(),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });

  const nodes = q.data?.categories ?? [];
  const byId = React.useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);
  const bySlug = React.useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const n of nodes) m.set(n.slug, n);
    return m;
  }, [nodes]);
  const childrenOf = React.useMemo(() => {
    const m = new Map<string | null, CategoryNode[]>();
    for (const n of nodes) {
      const k = n.parent_id;
      const arr = m.get(k) ?? [];
      arr.push(n);
      m.set(k, arr);
    }
    return m;
  }, [nodes]);

  return { nodes, byId, bySlug, childrenOf, isLoading: q.isLoading };
}
