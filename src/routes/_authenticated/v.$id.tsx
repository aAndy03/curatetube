import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Sparkles, ExternalLink, AlertTriangle, Tag as TagIcon } from "lucide-react";

import { getVideoDetail } from "@/lib/library.functions";
import { getVideoTags } from "@/lib/tags.functions";
import { getVideoAttribution } from "@/lib/admin.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VideoActions } from "@/components/video-actions";
import { useHydratedSuggestCount } from "@/hooks/use-hydrated-status";

export const Route = createFileRoute("/_authenticated/v/$id")({
  component: VideoDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-semibold">Video not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been removed or hasn't been approved yet.
      </p>
    </div>
  ),
});

function VideoDetailPage() {
  const { id } = Route.useParams();
  const fetchDetail = useServerFn(getVideoDetail);
  const fetchAttribution = useServerFn(getVideoAttribution);
  const fetchTags = useServerFn(getVideoTags);
  const { data, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });
  const attrQ = useQuery({
    queryKey: ["video-attribution", id],
    queryFn: () => fetchAttribution({ data: { videoId: id } }),
  });
  const tagsQ = useQuery({
    queryKey: ["video-tags", id],
    queryFn: () => fetchTags({ data: { videoId: id } }),
    staleTime: 60_000,
  });
  const liveSuggestCount = useHydratedSuggestCount(id, data?.video?.suggest_count ?? 0);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  const video = data?.video;
  if (!video) throw notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="overflow-hidden rounded-lg border bg-black">
        <AspectRatio ratio={16 / 9}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
          />
        </AspectRatio>
      </div>

      <header className="space-y-3">
        <h1 className="text-xl font-semibold leading-snug sm:text-2xl">{video.title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {video.creator ? (
            <Link
              to="/creators/$id"
              params={{ id: video.creator.id }}
              className="flex items-center gap-3 rounded-md border bg-card p-2 pr-4 hover:border-foreground/30"
            >
              <Avatar className="h-9 w-9">
                {video.creator.thumbnail_url ? (
                  <AvatarImage src={video.creator.thumbnail_url} alt="" />
                ) : null}
                <AvatarFallback>{video.creator.title.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{video.creator.title}</p>
                {video.creator.handle ? (
                  <p className="text-xs text-muted-foreground">{video.creator.handle}</p>
                ) : null}
              </div>
            </Link>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" /> {video.submission_count} submitters
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> {liveSuggestCount} suggests
            </span>
            <Button variant="ghost" size="sm" asChild>
              <a
                href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open on YouTube <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2">
          <VideoActions videoId={video.id} size="md" />
        </div>

        {attrQ.data?.enabled && attrQ.data.contributors.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {(() => {
              const named = attrQ.data.contributors.filter((c) => c.name);
              const anonCount = attrQ.data.contributors.length - named.length;
              const parts: string[] = [];
              if (named.length)
                parts.push(named.map((n) => n.name).join(", "));
              if (anonCount)
                parts.push(
                  `${anonCount} anonymous contributor${anonCount === 1 ? "" : "s"}`,
                );
              return `Originally submitted by ${parts.join(" and ")}.`;
            })()}
          </p>
        ) : null}

        {(video.content_warnings ?? []).length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-foreground/20 bg-muted px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Content warnings:</span>
            {video.content_warnings.map((w) => (
              <Badge key={w} variant="outline">{w}</Badge>
            ))}
          </div>
        ) : null}

        {video.curator_note ? (
          <div className="rounded-md border bg-card p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Curator note</p>
            <p className="mt-1 whitespace-pre-line">{video.curator_note}</p>
          </div>
        ) : null}

        {video.description ? (
          <details className="rounded-md border bg-card p-3 text-sm">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
              Description
            </summary>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{video.description}</p>
          </details>
        ) : null}
      </header>
    </div>
  );
}
