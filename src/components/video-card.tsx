import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Users, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { VideoActions } from "@/components/video-actions";

export type VideoCardData = {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  submission_count: number;
  suggest_count: number;
  creator?: { id: string; title: string; handle: string | null; thumbnail_url: string | null } | null;
};

function formatDuration(s: number | null): string {
  if (!s || s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 86400_000;
  if (diff < day) return "today";
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / (day * 7))}w ago`;
  if (diff < day * 365) return `${Math.floor(diff / (day * 30))}mo ago`;
  return `${Math.floor(diff / (day * 365))}y ago`;
}

export function VideoCard({
  video,
  priority = false,
}: {
  video: VideoCardData;
  /** First few above-the-fold cards: skip lazy loading and hint a high fetch priority. */
  priority?: boolean;
}) {
  return (
    <Link
      to="/v/$id"
      params={{ id: video.id }}
      className="group block focus:outline-none [content-visibility:auto] [contain-intrinsic-size:1px_320px]"
    >
      <div className="relative overflow-hidden rounded-md border bg-card transition group-hover:border-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <AspectRatio ratio={16 / 9}>
          {video.thumbnail_url ? (
            <img
              src={video.thumbnail_url}
              alt=""
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              {...(priority ? { fetchPriority: "high" as const } : {})}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-muted text-xs text-muted-foreground">
              no thumbnail
            </div>
          )}
        </AspectRatio>
        {video.duration_seconds ? (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
            {formatDuration(video.duration_seconds)}
          </span>
        ) : null}
        <div className="pointer-events-auto absolute bottom-1.5 left-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="rounded-md bg-background/90 p-1 shadow-sm backdrop-blur">
            <VideoActions videoId={video.id} size="sm" />
          </div>
        </div>
      </div>
      <div className="mt-2 px-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">
          {video.title}
        </h3>
        {video.creator ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {video.creator.title}
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          {video.published_at ? <span>{relativeTime(video.published_at)}</span> : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {video.submission_count}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              This video was submitted by {video.submission_count}{" "}
              {video.submission_count === 1 ? "user" : "users"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {video.suggest_count}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Suggested by {video.suggest_count}{" "}
              {video.suggest_count === 1 ? "user" : "users"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Link>
  );
}
