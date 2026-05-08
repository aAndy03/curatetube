import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";

import { getCreatorDetail } from "@/lib/library.functions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video-card";

export const Route = createFileRoute("/_authenticated/creators/$id")({
  component: CreatorDetailPage,
});

function CreatorDetailPage() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getCreatorDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["creator", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full max-w-3xl" />;
  }
  const creator = data?.creator;
  if (!creator) throw notFound();

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
            {creator.video_count ? <span>{creator.video_count} videos on YouTube</span> : null}
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

      <section className="space-y-3">
        <h2 className="text-lg font-medium">In the library</h2>
        {(data?.videos.length ?? 0) === 0 ? (
          <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            No approved videos for this creator yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data!.videos.map((v) => (
              <VideoCard
                key={v.id}
                video={{
                  ...v,
                  creator: { id: creator.id, title: creator.title, handle: creator.handle, thumbnail_url: creator.thumbnail_url },
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
