import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, Loader2, ArrowRight, Flame, Sparkles, Users2 } from "lucide-react";

import { listTrendingVideos } from "@/lib/library.functions";
import {
  getTrendingCategoryRails,
  type TrendingCategoryRail,
} from "@/lib/trending-categories.functions";
import { VideoCard, type VideoCardData } from "@/components/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInView } from "@/hooks/use-in-view";

const PAGE_SIZE = 24;

export const Route = createFileRoute("/_authenticated/trending")({
  head: () => ({
    meta: [
      { title: "Trending — CurateTube" },
      {
        name: "description",
        content: "Videos and categories gaining traction across the community right now.",
      },
    ],
  }),
  component: TrendingPage,
});

function TrendingPage() {
  const [windowH, setWindowH] = React.useState<24 | 72>(24);
  const fn = useServerFn(listTrendingVideos);
  const railsFn = useServerFn(getTrendingCategoryRails);

  const q = useInfiniteQuery({
    queryKey: ["trending", windowH],
    initialPageParam: 0 as number,
    queryFn: ({ pageParam }) =>
      fn({ data: { windowHours: windowH, limit: PAGE_SIZE, offset: pageParam as number } }),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: 5 * 60 * 1000,
  });

  // Mirrors mv_category_trending_score refresh cadence (15 min).
  const railsQ = useQuery({
    queryKey: ["trending-category-rails"],
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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10">
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

      {q.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">Nothing trending yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Check back once the community starts suggesting videos.
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v, i) => (
              <VideoCard key={v!.id} video={v as VideoCardData} priority={i < 4} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-6">
            {q.isFetchingNextPage ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : !q.hasNextPage ? (
              <span className="text-xs text-muted-foreground">End of list</span>
            ) : null}
          </div>
        </section>
      )}

      {rails.length > 0 ? (
        <section className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Flame className="h-5 w-5" /> Trending categories
            </h2>
            <p className="text-xs text-muted-foreground">Score 0–100 · refreshes every 15 min.</p>
          </div>
          <div className="space-y-10">
            {rails.map((rail) => (
              <TrendingRail key={rail.category.id} rail={rail} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TrendingRail({ rail }: { rail: TrendingCategoryRail }) {
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{rail.category.name}</h3>
          <Badge variant="outline" className="text-[10px]">
            score {rail.score.toFixed(1)}
          </Badge>
          {rail.new_videos_7d > 0 ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Sparkles className="h-3 w-3" /> {rail.new_videos_7d} new / 7d
            </Badge>
          ) : null}
          {rail.active_creators > 0 ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Users2 className="h-3 w-3" /> {rail.active_creators} creators
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
