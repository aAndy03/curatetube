import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Sparkles } from "lucide-react";

import { listApprovedVideos } from "@/lib/library.functions";
import { VideoCard } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/use-permissions";
import { useSubmitSheet } from "@/lib/use-submit-sheet";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [{ title: "Home — CurateTube" }],
  }),
  component: FeedPage,
});

function FeedPage() {
  const list = useServerFn(listApprovedVideos);
  const { data: perms } = usePermissions();
  const canSubmit = perms?.has("submission.create");

  const { data, isLoading } = useQuery({
    queryKey: ["videos", "approved", "feed"],
    queryFn: () => list({ data: { limit: 24, offset: 0 } }),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="text-sm text-muted-foreground">
            The newest curated videos in the library.
          </p>
        </div>
      </header>

      {isLoading ? (
        <section className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </section>
      ) : (data?.videos.length ?? 0) === 0 ? (
        <section className="rounded-xl border bg-card p-10 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">No approved videos yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Be the first to seed the library. Submit a YouTube URL and a moderator will review it.
          </p>
          {canSubmit ? (
            <Button asChild className="mt-4">
              <Link to="/submit">
                <Plus className="mr-1 h-4 w-4" /> Submit a video
              </Link>
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data!.videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </section>
      )}
    </div>
  );
}
