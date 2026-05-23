// Phase 4 — shared in-memory tag cache for VideoCard chips.
// One server call per session (10-minute stale time), Map<id, tag> for O(1) lookup.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicTags, type PublicTag } from "@/lib/tags.functions";

export function useTagsCache() {
  const fetchTags = useServerFn(listPublicTags);
  const q = useQuery({
    queryKey: ["public-tags"],
    queryFn: () => fetchTags(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  const byId = React.useMemo(() => {
    const m = new Map<string, PublicTag>();
    for (const t of q.data?.tags ?? []) m.set(t.id, t);
    return m;
  }, [q.data]);
  return { byId, isLoading: q.isLoading };
}
