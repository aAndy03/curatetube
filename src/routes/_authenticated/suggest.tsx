import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";

import { listSuggestedVideos } from "@/lib/library.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
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
  const q = useInfiniteQuery({
    queryKey: ["suggested-feed"],
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      fn({ data: { limit: PAGE_SIZE, offset: pageParam as number } }),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 5 * 60 * 1000,
  });

  const sentinelRef = useInView(
    () => {
      if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    },
    { enabled: !!q.hasNextPage && !q.isFetchingNextPage },
  );

  const videos = q.data?.pages.flatMap((p) => p.videos) ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
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
        <>
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
        </>
      )}
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
