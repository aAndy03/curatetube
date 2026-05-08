import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";

import { listSuggestedVideos } from "@/lib/library.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data, isLoading } = useQuery({
    queryKey: ["suggested-feed"],
    queryFn: () => fn({ data: { limit: 36 } }),
    staleTime: 5 * 60 * 1000,
  });

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

      {isLoading ? (
        <SkeletonGrid />
      ) : (data?.videos.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data!.videos.map((v) => (
            <VideoCard key={v.id} video={v as VideoCardData} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="aspect-video w-full" />
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
