import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";

import { listSuggestedVideos } from "@/lib/library.functions";
import {
  getSuggestCategoryRails,
  type SuggestCategoryRail,
} from "@/lib/suggest-categories.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useInView } from "@/hooks/use-in-view";

const PAGE_SIZE = 24;

export const Route = createFileRoute("/_authenticated/suggest")({
  head: () => ({
    meta: [
      { title: "Suggested — CurateTube" },
      {
        name: "description",
        content: "Videos the community has suggested most. Ranked by suggestion count.",
      },
    ],
  }),
  component: SuggestPage,
});

function SuggestPage() {
  const fn = useServerFn(listSuggestedVideos);
  const railsFn = useServerFn(getSuggestCategoryRails);

  const q = useInfiniteQuery({
    queryKey: ["suggested-feed"],
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      fn({ data: { limit: PAGE_SIZE, offset: pageParam as number } }),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 5 * 60 * 1000,
  });

  // Mirrors mv refresh cadence (15 min). Reuses dedup cycle on server.
  const railsQ = useQuery({
    queryKey: ["suggest-category-rails"],
    queryFn: () => railsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const sentinelRef = useInView(
    () => {
      if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    },
    { enabled: !!q.hasNextPage && !q.isFetchingNextPage },
  );

  const videos = q.data?.pages.flatMap((p) => p.videos) ?? [];
  const rails = railsQ.data?.rails ?? [];
  const coldStart = railsQ.data?.is_cold_start ?? false;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Sparkles className="h-5 w-5" /> Suggested
          </h1>
          <p className="text-sm text-muted-foreground">
            Ordered by how many people have suggested each video.
          </p>
        </div>
      </header>

      {q.isLoading ? (
        <SkeletonGrid count={PAGE_SIZE} />
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v, i) => (
              <VideoCard key={v.id} video={v as VideoCardData} priority={i < 4} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-6">
            {q.isFetchingNextPage ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : !q.hasNextPage ? (
              <span className="text-xs text-muted-foreground">End of feed</span>
            ) : null}
          </div>
        </section>
      )}

      {rails.length > 0 ? (
        <section className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              {coldStart ? "Most popular categories" : "Based on recent activity"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {coldStart ? "Cold start — ordered by catalogue size." : "Refreshes every 15 min."}
            </p>
          </div>
          <div className="space-y-10">
            {rails.map((rail) => (
              <CategoryRail key={rail.category.id} rail={rail} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CategoryRail({ rail }: { rail: SuggestCategoryRail }) {
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{rail.category.name}</h3>
          {!rail.is_cold_start ? (
            <Badge variant="outline" className="text-[10px]">
              score {rail.score.toFixed(1)}
            </Badge>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/categories/$slug" params={{ slug: rail.category.slug }}>
            See all <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {rail.videos.map((v) => (
          <VideoCard key={v.id} video={v as VideoCardData} />
        ))}
      </div>
    </div>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border bg-card p-10 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-medium">No suggestions yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Be the first to suggest a video — open any video and tap Suggest.
      </p>
    </div>
  );
}
