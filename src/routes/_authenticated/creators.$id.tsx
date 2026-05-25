import * as React from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";

import { getCreatorContributors, getCreatorDetail } from "@/lib/library.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoCard } from "@/components/video-card";

type SortKey = "recent" | "top_suggested" | "oldest";
const PAGE_SIZE = 24;

export const Route = createFileRoute("/_authenticated/creators/$id")({
  head: () => ({
    meta: [
      { title: "Creator — CurateTube" },
      {
        name: "description",
        content:
          "Approved videos and community contributors for this YouTube creator on CurateTube.",
      },
      { property: "og:title", content: "Creator — CurateTube" },
      {
        property: "og:description",
        content: "Approved videos and contributors for this creator on CurateTube.",
      },
    ],
  }),
  component: CreatorDetailPage,
});

function CreatorDetailPage() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getCreatorDetail);
  const fetchContribs = useServerFn(getCreatorContributors);

  const [sort, setSort] = React.useState<SortKey>("recent");
  const [page, setPage] = React.useState(0);

  // Reset to page 0 whenever the sort changes.
  React.useEffect(() => {
    setPage(0);
  }, [sort]);

  const { data, isLoading } = useQuery({
    queryKey: ["creator", id, sort, page],
    queryFn: () => fetchDetail({ data: { id, page, sort, pageSize: PAGE_SIZE } }),
  });
  const contribsQ = useQuery({
    queryKey: ["creator-contributors", id],
    queryFn: () => fetchContribs({ data: { creatorId: id } }),
  });

  if (isLoading && !data) {
    return <Skeleton className="h-32 w-full max-w-3xl" />;
  }
  const creator = data?.creator;
  if (!creator) throw notFound();

  const totalPages = Math.max(1, Math.ceil((data?.totalVideos ?? 0) / PAGE_SIZE));
  const contributors = contribsQ.data?.contributors ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start gap-4 rounded-lg border bg-card p-5">
        <Avatar className="h-20 w-20">
          {creator.thumbnail_url ? <AvatarImage src={creator.thumbnail_url} alt="" /> : null}
          <AvatarFallback>{creator.title.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{creator.title}</h1>
          {creator.handle ? (
            <p className="text-sm text-muted-foreground">{creator.handle}</p>
          ) : null}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {creator.subscriber_count ? (
              <span>
                {Intl.NumberFormat("en", { notation: "compact" }).format(creator.subscriber_count)}{" "}
                subscribers
              </span>
            ) : null}
            <span>
              {data?.totalVideos ?? 0} in library
              {creator.video_count ? ` · ${creator.video_count} on YouTube` : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              avg {data?.avgSuggestCount ?? 0} suggestions
            </span>
            {creator.country ? <span>{creator.country}</span> : null}
          </div>
          {creator.description ? (
            <p className="line-clamp-3 max-w-3xl pt-2 text-sm text-foreground/80">
              {creator.description}
            </p>
          ) : null}
        </div>
        {creator.channel_url ? (
          <Button variant="outline" size="sm" asChild>
            <a href={creator.channel_url} target="_blank" rel="noreferrer">
              YouTube channel <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
      </header>

      {contribsQ.data?.enabled && contributors.length > 0 ? (
        <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Contributors ({contributors.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {contributors.map((c) => (
              <Badge key={c.user_id} variant="secondary" className="gap-1">
                <span>{c.name}</span>
                <span className="text-muted-foreground">· {c.count}</span>
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">In the library</h2>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger aria-label="Sort videos" className="w-44">

              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most recent</SelectItem>
              <SelectItem value="top_suggested">Most suggested</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(data?.videos.length ?? 0) === 0 ? (
          <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            No approved videos for this creator yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 [content-visibility:auto] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data!.videos.map((v, i) => (
                <VideoCard
                  key={v.id}
                  priority={i < 4}
                  video={{
                    ...v,
                    creator: {
                      id: creator.id,
                      title: creator.title,
                      handle: creator.handle,
                      thumbnail_url: creator.thumbnail_url,
                    },
                  }}
                />
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
