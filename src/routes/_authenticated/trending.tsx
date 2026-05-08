import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp } from "lucide-react";

import { listTrendingVideos } from "@/lib/library.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/trending")({
  head: () => ({
    meta: [
      { title: "Trending — CurateTube" },
      {
        name: "description",
        content: "Videos gaining traction across the community right now.",
      },
    ],
  }),
  component: TrendingPage,
});

function TrendingPage() {
  const [windowH, setWindowH] = React.useState<24 | 72>(24);
  const fn = useServerFn(listTrendingVideos);
  const { data, isLoading } = useQuery({
    queryKey: ["trending", windowH],
    queryFn: () => fn({ data: { windowHours: windowH, limit: 36 } }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <TrendingUp className="h-5 w-5" /> Trending
          </h1>
          <p className="text-sm text-muted-foreground">
            Videos picking up suggestions in the last {windowH} hours.
          </p>
        </div>
        <Tabs
          value={String(windowH)}
          onValueChange={(v) => setWindowH(v === "72" ? 72 : 24)}
        >
          <TabsList>
            <TabsTrigger value="24">Last 24h</TabsTrigger>
            <TabsTrigger value="72">Last 72h</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full" />
          ))}
        </div>
      ) : (data?.videos.length ?? 0) === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">Nothing trending yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Check back once the community starts suggesting videos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data!.videos.map((v) => (
            <VideoCard key={v!.id} video={v as VideoCardData} />
          ))}
        </div>
      )}
    </div>
  );
}
