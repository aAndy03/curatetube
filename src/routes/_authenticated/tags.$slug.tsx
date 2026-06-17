import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Tag as TagIcon } from "lucide-react";

import { listVideosByTagSlug } from "@/lib/tags.functions";
import { type VideoCardData } from "@/components/video-card";
import { InfiniteVideoGrid } from "@/components/infinite-video-grid";
import { useTagsCache } from "@/hooks/use-tags-cache";

const PAGE_SIZE = 24;

export const Route = createFileRoute("/_authenticated/tags/$slug")({
  head: () => ({
    meta: [{ title: "Tag — CurateTube" }],
  }),
  component: TagDetailPage,
  notFoundComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Tag not found.
    </div>
  ),
});

function TagDetailPage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(listVideosByTagSlug);
  const { byId: tagsById } = useTagsCache();

  const query = useInfiniteQuery({
    queryKey: ["tag", slug, "infinite"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fn({ data: { slug, limit: PAGE_SIZE, cursor: pageParam as number } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 5 * 60_000,
  });

  const head = query.data?.pages[0];
  if (!query.isLoading && head && !head.tag) throw notFound();

  // Prefer cached tag (resolves instantly when /feed → tag chip → /tags/[slug]).
  const cachedTag = React.useMemo(() => {
    for (const t of tagsById.values()) if (t.slug === slug) return t;
    return null;
  }, [tagsById, slug]);
  const tag = head?.tag ?? cachedTag;

  const videos = React.useMemo(
    () => (query.data?.pages.flatMap((p) => p.videos) ?? []) as VideoCardData[],
    [query.data],
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-2">
        <Link
          to="/feed"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <TagIcon className="h-5 w-5" />
          {tag?.name ?? slug}
        </h1>
        {tag ? (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {tag.source} · {tag.tier}
          </p>
        ) : null}
      </header>

      <InfiniteVideoGrid
        videos={videos}
        isLoading={query.isLoading}
        isFetchingNextPage={query.isFetchingNextPage}
        hasNextPage={Boolean(query.hasNextPage)}
        onLoadMore={() => query.fetchNextPage()}
        emptyMessage="No approved videos use this tag yet."
      />
    </div>
  );
}
